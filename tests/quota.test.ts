/**
 * Quota logic tests.
 *
 * Run with:  npm run test:quota
 *
 * The pure parts of the quota system are tested here: remaining calculations,
 * day-boundary resets, and the Albanian quota messages. The transactional
 * consume/refund path is exercised against the Firestore emulator in
 * `quota.emulator.test.ts`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  applyUsage,
  buildQuotaMessage,
  computeRemaining,
  findQuotaViolation,
  normalizeUsage,
  reverseUsage,
  type CurrentUsage,
} from "../src/lib/quota.ts";
import {
  PLANS,
  getPlanLimits,
  usageLabel,
  USAGE_METRICS,
  type UsageMetric,
} from "../src/config/plans.ts";
import { serverDayKey, isStaleDayKey } from "../src/lib/utils/date.ts";

/** Builds a usage record for a given day, defaulting to the current server day. */
function usage(overrides: Partial<CurrentUsage> = {}): CurrentUsage {
  return {
    dayKey: serverDayKey(),
    documents: 0,
    flashcards: 0,
    quizQuestions: 0,
    ...overrides,
  };
}

const ONE = (metric: UsageMetric) => [{ metric, amount: 1 }];

// ===========================================================================
// Plan limits
// ===========================================================================

describe("plan limits", () => {
  it("matches the master prompt values exactly", () => {
    assert.deepEqual(getPlanLimits("free"), {
      documentsPerDay: 2,
      flashcardsPerDay: 3,
      quizQuestionsPerDay: 3,
    });
    assert.deepEqual(getPlanLimits("plus"), {
      documentsPerDay: 50,
      flashcardsPerDay: 50,
      quizQuestionsPerDay: 50,
    });
    assert.deepEqual(getPlanLimits("pro"), {
      documentsPerDay: 200,
      flashcardsPerDay: 200,
      quizQuestionsPerDay: 200,
    });
  });

  it("prices match the master prompt", () => {
    assert.equal(PLANS.free.priceCents, 0);
    assert.equal(PLANS.plus.priceCents, 599);
    assert.equal(PLANS.pro.priceCents, 1299);
  });

  it("only Pro uses the reasoning model", () => {
    assert.equal(PLANS.free.usesProModel, false);
    assert.equal(PLANS.plus.usesProModel, false);
    assert.equal(PLANS.pro.usesProModel, true);
  });

  it("every plan defines all three metrics", () => {
    for (const planId of ["free", "plus", "pro"] as const) {
      for (const metric of USAGE_METRICS) {
        assert.equal(
          typeof getPlanLimits(planId)[metric],
          "number",
          `${planId}.${metric}`,
        );
      }
    }
  });
});

// ===========================================================================
// Remaining calculation
// ===========================================================================

describe("remaining allowance", () => {
  it("starts at the full plan limit", () => {
    const remaining = computeRemaining("free", usage());
    assert.equal(remaining.documents, 2);
    assert.equal(remaining.flashcards, 3);
    assert.equal(remaining.quizQuestions, 3);
  });

  it("decrements as quota is used", () => {
    const remaining = computeRemaining(
      "free",
      usage({ documents: 1, flashcards: 2, quizQuestions: 3 }),
    );
    assert.deepEqual(
      [remaining.documents, remaining.flashcards, remaining.quizQuestions],
      [1, 1, 0],
    );
  });

  it("never goes negative even if counters are corrupted", () => {
    const remaining = computeRemaining(
      "free",
      usage({ documents: 999, flashcards: 999, quizQuestions: 999 }),
    );
    assert.deepEqual(
      [remaining.documents, remaining.flashcards, remaining.quizQuestions],
      [0, 0, 0],
    );
  });

  it("scales with the plan", () => {
    const remaining = computeRemaining("pro", usage());
    assert.deepEqual(
      [remaining.documents, remaining.flashcards, remaining.quizQuestions],
      [200, 200, 200],
    );
  });
});

// ===========================================================================
// Enforcement
// ===========================================================================

describe("quota enforcement", () => {
  it("allows a request within the remaining allowance", () => {
    assert.equal(findQuotaViolation("free", usage(), ONE("flashcardsPerDay")), null);
  });

  it("rejects a request that would exceed the allowance", () => {
    const violation = findQuotaViolation(
      "free",
      usage({ flashcards: 3 }),
      ONE("flashcardsPerDay"),
    );
    assert.notEqual(violation, null);
    assert.equal(violation?.metric, "flashcardsPerDay");
    assert.equal(violation?.remaining, 0);
  });

  it("reports exactly how many units remain", () => {
    const violation = findQuotaViolation(
      "free",
      usage({ quizQuestions: 1 }),
      [{ metric: "quizQuestionsPerDay", amount: 5 }],
    );
    assert.equal(violation?.remaining, 2);
  });

  it("charges N units for a request of N (not 1)", () => {
    // "A request for 10 flashcards should consume 10 flashcard units."
    const after = applyUsage(usage(), [{ metric: "flashcardsPerDay", amount: 10 }]);
    assert.equal(after.flashcards, 10);
  });

  it("rejects a batch when ANY metric is over quota, charging nothing", () => {
    const state = usage({ flashcards: 3 }); // flashcards exhausted
    const requests = [
      { metric: "flashcardsPerDay" as const, amount: 1 },
      { metric: "quizQuestionsPerDay" as const, amount: 1 },
    ];

    const violation = findQuotaViolation("free", state, requests);
    assert.notEqual(violation, null, "batch must be rejected as a whole");

    // The check is read-only: nothing is consumed on rejection.
    assert.equal(state.quizQuestions, 0);
  });

  it("ignores zero and negative amounts", () => {
    assert.equal(
      findQuotaViolation("free", usage({ flashcards: 3 }), [
        { metric: "flashcardsPerDay", amount: 0 },
      ]),
      null,
    );
  });

  it("allows exactly the remaining amount", () => {
    assert.equal(
      findQuotaViolation("free", usage(), [
        { metric: "flashcardsPerDay", amount: 3 },
      ]),
      null,
    );
  });

  it("rejects one unit more than the remaining amount", () => {
    assert.notEqual(
      findQuotaViolation("free", usage(), [
        { metric: "flashcardsPerDay", amount: 4 },
      ]),
      null,
    );
  });
});

// ===========================================================================
// Refunds
// ===========================================================================

describe("quota refunds", () => {
  it("reverses a consumed request", () => {
    const consumed = applyUsage(usage(), [{ metric: "flashcardsPerDay", amount: 2 }]);
    const refunded = reverseUsage(consumed, [{ metric: "flashcardsPerDay", amount: 2 }]);
    assert.equal(refunded.flashcards, 0);
  });

  it("never refunds below zero", () => {
    const refunded = reverseUsage(usage(), [{ metric: "flashcardsPerDay", amount: 5 }]);
    assert.equal(refunded.flashcards, 0);
  });
});

// ===========================================================================
// Day boundary
// ===========================================================================

describe("day boundary resets", () => {
  it("resets all counters when the stored day is stale", () => {
    const raw = {
      dayKey: "2020-01-01",
      documents: 2,
      flashcards: 3,
      quizQuestions: 3,
    };
    const normalized = normalizeUsage(raw, serverDayKey());

    assert.equal(normalized.documents, 0);
    assert.equal(normalized.flashcards, 0);
    assert.equal(normalized.quizQuestions, 0);
  });

  it("preserves counters within the same day", () => {
    const today = serverDayKey();
    const normalized = normalizeUsage(
      { dayKey: today, documents: 1, flashcards: 2, quizQuestions: 3 },
      today,
    );

    assert.deepEqual(
      [normalized.documents, normalized.flashcards, normalized.quizQuestions],
      [1, 2, 3],
    );
  });

  it("treats missing or malformed counters as zero", () => {
    const today = serverDayKey();
    const normalized = normalizeUsage({ dayKey: today }, today);
    assert.deepEqual(
      [normalized.documents, normalized.flashcards, normalized.quizQuestions],
      [0, 0, 0],
    );

    const malformed = normalizeUsage(
      { dayKey: today, documents: "lots", flashcards: -5, quizQuestions: NaN },
      today,
    );
    assert.deepEqual(
      [malformed.documents, malformed.flashcards, malformed.quizQuestions],
      [0, 0, 0],
    );
  });

  it("uses a stable YYYY-MM-DD key", () => {
    assert.equal(serverDayKey(new Date("2026-03-09T12:00:00Z")), "2026-03-09");
  });

  it("does not depend on the local timezone", () => {
    assert.equal(serverDayKey(new Date("2026-03-09T23:30:00Z")), "2026-03-09");
    assert.equal(serverDayKey(new Date("2026-03-09T00:30:00Z")), "2026-03-09");
  });

  it("rolls over at UTC midnight", () => {
    assert.notEqual(
      serverDayKey(new Date("2026-03-09T23:59:59Z")),
      serverDayKey(new Date("2026-03-10T00:00:01Z")),
    );
  });

  it("detects a stale day key", () => {
    const today = new Date("2026-03-10T10:00:00Z");
    assert.equal(isStaleDayKey("2026-03-09", today), true);
    assert.equal(isStaleDayKey("2026-03-10", today), false);
  });
});

// ===========================================================================
// Quota messages (required shape)
// ===========================================================================

describe("quota messages", () => {
  it("matches the required example exactly", () => {
    // The master prompt gives this exact sentence as the expected shape.
    assert.equal(
      buildQuotaMessage("quizQuestionsPerDay", 2),
      "Të kanë mbetur 2 pyetje kuizi për sot.",
    );
  });

  it("uses the singular form for one remaining unit", () => {
    assert.equal(
      buildQuotaMessage("documentsPerDay", 1),
      "Të kanë mbetur 1 dokument për sot.",
    );
    assert.equal(
      buildQuotaMessage("flashcardsPerDay", 1),
      "Të kanë mbetur 1 flashcard për sot.",
    );
  });

  it("says so plainly when nothing remains", () => {
    const message = buildQuotaMessage("flashcardsPerDay", 0);
    assert.match(message, /shfrytëzuar/i);
    assert.match(message, /nesër/i);
  });

  it("always states a number when units remain", () => {
    for (const metric of USAGE_METRICS) {
      const message = buildQuotaMessage(metric, 5);
      assert.match(message, /\b5\b/, `${metric} message must state the count`);
    }
  });

  it("inflects labels correctly", () => {
    assert.equal(usageLabel("documentsPerDay", 1), "dokument");
    assert.equal(usageLabel("documentsPerDay", 3), "dokumente");
    assert.equal(usageLabel("flashcardsPerDay", 1), "flashcard");
    assert.equal(usageLabel("quizQuestionsPerDay", 2), "pyetje kuizi");
  });
});

// ===========================================================================
// Day boundary
// ===========================================================================

describe("server day boundary", () => {
  it("uses a stable YYYY-MM-DD key", () => {
    assert.match(serverDayKey(new Date("2026-03-09T12:00:00Z")), /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(serverDayKey(new Date("2026-03-09T12:00:00Z")), "2026-03-09");
  });

  it("does not depend on the local timezone", () => {
    // 23:30 UTC is already the next day in some zones; the key must not shift.
    assert.equal(serverDayKey(new Date("2026-03-09T23:30:00Z")), "2026-03-09");
    assert.equal(serverDayKey(new Date("2026-03-09T00:30:00Z")), "2026-03-09");
  });

  it("rolls over at UTC midnight", () => {
    const before = new Date("2026-03-09T23:59:59Z");
    const after = new Date("2026-03-10T00:00:01Z");
    assert.notEqual(serverDayKey(before), serverDayKey(after));
  });

  it("detects a stale day key so counters reset", () => {
    const today = new Date("2026-03-10T10:00:00Z");
    assert.equal(isStaleDayKey("2026-03-09", today), true, "yesterday is stale");
    assert.equal(isStaleDayKey("2026-03-10", today), false, "today is current");
  });
});
