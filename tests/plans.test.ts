/**
 * Plan metering tests.
 *
 * Run with:  npm run test:plans
 *
 * Verifies that a generation request consumes EXACTLY the units the master
 * prompt specifies, for every plan, and that the boundaries behave correctly.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_FLASHCARDS,
  DEFAULT_QUIZ_QUESTIONS,
  MAX_FLASHCARDS_PER_REQUEST,
  MAX_QUIZ_QUESTIONS_PER_REQUEST,
  meteredKinds,
  normalizeCount,
  normalizeCounts,
  planMayUseProModel,
  usageRequestsFor,
} from "../src/lib/plan-limits.ts";
import {
  applyUsage,
  computeRemaining,
  findQuotaViolation,
  type CurrentUsage,
} from "../src/lib/quota.ts";
import {
  PLANS,
  PLAN_ORDER,
  getPlan,
  getPlanLimits,
  isPlanId,
  resolvePlanId,
} from "../src/config/plans.ts";
import { entitledPlan, isPlanExpired } from "../src/lib/entitlement.ts";

/** Current usage on the given day. */
function usage(overrides: Partial<CurrentUsage> = {}): CurrentUsage {
  return {
    dayKey: "2026-03-10",
    documents: 0,
    flashcards: 0,
    quizQuestions: 0,
    ...overrides,
  };
}

/** Converts the request list into an easy lookup. */
function asMap(requests: Array<{ metric: string; amount: number }>) {
  return Object.fromEntries(requests.map((r) => [r.metric, r.amount]));
}

// ===========================================================================
// Exactly three plans
// ===========================================================================

describe("plan catalogue", () => {
  it("defines exactly three plans", () => {
    assert.equal(PLAN_ORDER.length, 3);
    assert.deepEqual([...PLAN_ORDER], ["free", "plus", "pro"]);
    assert.equal(Object.keys(PLANS).length, 3);
  });

  it("names them Falas, Plus and Pro", () => {
    assert.equal(getPlan("free").name, "Falas");
    assert.equal(getPlan("plus").name, "Plus");
    assert.equal(getPlan("pro").name, "Pro");
  });

  it("prices them at 0€, 5.99€ and 12.99€", () => {
    assert.equal(getPlan("free").priceLabel, "0€");
    assert.equal(getPlan("plus").priceLabel, "5.99€");
    assert.equal(getPlan("pro").priceLabel, "12.99€");

    // Integer cents, so no floating-point rounding errors.
    assert.equal(getPlan("free").priceCents, 0);
    assert.equal(getPlan("plus").priceCents, 599);
    assert.equal(getPlan("pro").priceCents, 1299);
  });

  it("matches every daily limit from the specification", () => {
    // Free: 2 documents, 3 flashcards, 3 quiz questions.
    assert.deepEqual(getPlanLimits("free"), {
      documentsPerDay: 2,
      flashcardsPerDay: 3,
      quizQuestionsPerDay: 3,
    });

    // Plus: 50 of each.
    assert.deepEqual(getPlanLimits("plus"), {
      documentsPerDay: 50,
      flashcardsPerDay: 50,
      quizQuestionsPerDay: 50,
    });

    // Pro: 200 of each.
    assert.deepEqual(getPlanLimits("pro"), {
      documentsPerDay: 200,
      flashcardsPerDay: 200,
      quizQuestionsPerDay: 200,
    });
  });

  it("rejects invalid plan ids", () => {
    assert.equal(isPlanId("free"), true);
    assert.equal(isPlanId("enterprise"), false);
    assert.equal(isPlanId(""), false);
    assert.equal(isPlanId(null), false);
    assert.equal(isPlanId(42), false);
  });

  it("falls back to free for untrusted plan values", () => {
    // A tampered Firestore value must never grant a paid plan.
    assert.equal(resolvePlanId("pro"), "pro");
    assert.equal(resolvePlanId("hacked"), "free");
    assert.equal(resolvePlanId(undefined), "free");
    assert.equal(resolvePlanId({ plan: "pro" }), "free");
  });
});

// ===========================================================================
// Pro-only model access
// ===========================================================================

describe("Pro model access", () => {
  it("is granted to Pro only", () => {
    assert.equal(planMayUseProModel("pro"), true);
    assert.equal(planMayUseProModel("plus"), false);
    assert.equal(planMayUseProModel("free"), false);
  });
});

// ===========================================================================
// Metering — exactly N units for N items
// ===========================================================================

describe("metering", () => {
  it("charges one document unit for an upload", () => {
    const requests = usageRequestsFor(["summary"], { flashcards: 5, quizQuestions: 5 }, 1);
    assert.deepEqual(asMap(requests), { documentsPerDay: 1 });
  });

  it("does NOT charge a separate counter for the summary", () => {
    // Requirement: a summary from a successfully processed upload needs no
    // separate daily summary counter.
    const requests = usageRequestsFor(["summary"], { flashcards: 5, quizQuestions: 5 }, 1);
    const metrics = meteredKinds(requests);
    assert.equal(metrics.includes("flashcardsPerDay"), false);
    assert.equal(metrics.includes("quizQuestionsPerDay"), false);
    assert.equal(requests.length, 1, "only the document counter applies");
  });

  it("charges N units for N flashcards", () => {
    const requests = usageRequestsFor(["flashcards"], { flashcards: 10, quizQuestions: 5 }, 0);
    assert.deepEqual(asMap(requests), { flashcardsPerDay: 10 });
  });

  it("charges N units for N quiz questions", () => {
    const requests = usageRequestsFor(["quiz"], { flashcards: 5, quizQuestions: 7 }, 0);
    assert.deepEqual(asMap(requests), { quizQuestionsPerDay: 7 });
  });

  it("charges every metric when all kinds are requested", () => {
    const requests = usageRequestsFor(
      ["summary", "flashcards", "quiz"],
      { flashcards: 4, quizQuestions: 6 },
      1,
    );
    assert.deepEqual(asMap(requests), {
      documentsPerDay: 1,
      flashcardsPerDay: 4,
      quizQuestionsPerDay: 6,
    });
  });

  it("does not charge for kinds that were not requested", () => {
    const requests = usageRequestsFor(["summary"], { flashcards: 8, quizQuestions: 8 }, 1);
    assert.equal(requests.length, 1);
  });

  it("charges nothing when regenerating without a new upload", () => {
    // uploads = 0 and only a summary requested: no units consumed at all.
    const requests = usageRequestsFor(["summary"], { flashcards: 5, quizQuestions: 5 }, 0);
    assert.equal(requests.length, 0);
  });
});

// ===========================================================================
// Count normalization — hostile input
// ===========================================================================

describe("count normalization", () => {
  it("defaults missing counts", () => {
    const counts = normalizeCounts({});
    assert.equal(counts.flashcards, DEFAULT_FLASHCARDS);
    assert.equal(counts.quizQuestions, DEFAULT_QUIZ_QUESTIONS);
  });

  it("clamps counts above the storable maximum", () => {
    const counts = normalizeCounts({ flashcards: 9999, quizQuestions: 9999 });
    assert.equal(counts.flashcards, MAX_FLASHCARDS_PER_REQUEST);
    assert.equal(counts.quizQuestions, MAX_QUIZ_QUESTIONS_PER_REQUEST);
  });

  it("rejects negative and zero counts (which would credit quota)", () => {
    // A negative amount would REDUCE usage, i.e. grant free quota.
    assert.equal(normalizeCount(-100, 8, 5), 5, "negative falls back to default");
    assert.equal(normalizeCount(0, 8, 5), 5, "zero falls back to default");
  });

  it("rejects non-numeric counts", () => {
    assert.equal(normalizeCount("10", 8, 5), 5, "string ignored");
    assert.equal(normalizeCount(NaN, 8, 5), 5);
    assert.equal(normalizeCount(Infinity, 8, 5), 5);
    assert.equal(normalizeCount(null, 8, 5), 5);
    assert.equal(normalizeCount({}, 8, 5), 5);
  });

  it("floors fractional counts", () => {
    assert.equal(normalizeCount(3.9, 8, 5), 3);
  });

  it("accepts a valid in-range count unchanged", () => {
    assert.equal(normalizeCount(4, 8, 5), 4);
  });
});

// ===========================================================================
// Quota boundaries per plan
// ===========================================================================

describe("quota boundaries", () => {
  const plans = [
    { id: "free", limit: 3, documents: 2 },
    { id: "plus", limit: 50, documents: 50 },
    { id: "pro", limit: 200, documents: 200 },
  ] as const;

  for (const { id, limit, documents } of plans) {
    it(`${id}: allows a request up to the limit`, () => {
      assert.equal(
        findQuotaViolation(id, usage(), [
          { metric: "flashcardsPerDay", amount: limit },
        ]),
        null,
      );
    });

    it(`${id}: rejects one unit beyond the limit`, () => {
      const violation = findQuotaViolation(id, usage(), [
        { metric: "flashcardsPerDay", amount: limit + 1 },
      ]);
      assert.notEqual(violation, null);
      assert.equal(violation?.metric, "flashcardsPerDay");
      assert.equal(violation?.remaining, limit);
    });

    it(`${id}: rejects when the allowance is exhausted`, () => {
      const violation = findQuotaViolation(
        id,
        usage({ flashcards: limit }),
        [{ metric: "flashcardsPerDay", amount: 1 }],
      );
      assert.notEqual(violation, null);
      assert.equal(violation?.remaining, 0);
    });

    it(`${id}: reports the correct remaining amount mid-way`, () => {
      const used = Math.floor(limit / 2);
      const violation = findQuotaViolation(
        id,
        usage({ flashcards: used }),
        [{ metric: "flashcardsPerDay", amount: limit }],
      );
      assert.notEqual(violation, null);
      assert.equal(violation?.remaining, limit - used);
    });

    it(`${id}: enforces the document allowance`, () => {
      assert.equal(
        findQuotaViolation(id, usage(), [
          { metric: "documentsPerDay", amount: documents },
        ]),
        null,
      );
      assert.notEqual(
        findQuotaViolation(id, usage(), [
          { metric: "documentsPerDay", amount: documents + 1 },
        ]),
        null,
      );
    });
  }

  it("free plan matches the exact specification scenario", () => {
    // The required example: 2 quiz questions remaining.
    const state = usage({ quizQuestions: 1 });
    const remaining = computeRemaining("free", state);
    assert.equal(remaining.quizQuestions, 2);

    // Asking for 3 when only 2 remain must fail.
    const violation = findQuotaViolation("free", state, [
      { metric: "quizQuestionsPerDay", amount: 3 },
    ]);
    assert.equal(violation?.remaining, 2);
  });

  it("a document-only request does not consume flashcard quota", () => {
    const requests = usageRequestsFor(["summary"], { flashcards: 5, quizQuestions: 5 }, 1);
    const after = applyUsage(usage(), requests);

    assert.equal(after.documents, 1);
    assert.equal(after.flashcards, 0, "flashcard quota untouched");
    assert.equal(after.quizQuestions, 0, "quiz quota untouched");
  });

  it("consuming N units leaves limit minus N remaining", () => {
    const requests = usageRequestsFor(["flashcards"], { flashcards: 2, quizQuestions: 5 }, 0);
    const after = applyUsage(usage(), requests);
    const remaining = computeRemaining("free", after);

    assert.equal(remaining.flashcards, 1, "3 - 2 = 1");
  });
});

// ===========================================================================
// Server-side enforcement
// ===========================================================================

describe("server-side enforcement", () => {
  it("the usage service is server-only", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/server/services/usage.ts", "utf8");
    assert.match(source, /import "server-only"/);
  });

  it("quota is consumed in a Firestore transaction", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/server/services/usage.ts", "utf8");
    assert.match(source, /runTransaction/, "must be atomic against concurrency");
  });

  it("the plan is resolved server-side, never from the request body", async () => {
    const { readFileSync } = await import("node:fs");
    const route = readFileSync("src/app/api/generate/route.ts", "utf8");
    assert.match(route, /getUserPlan\(decoded\.uid\)/);
    // The body must never be a source of plan information.
    assert.doesNotMatch(route, /body\.plan|body\.planId/);
  });

  it("plan numbers are not duplicated outside the config", async () => {
    const { readFileSync } = await import("node:fs");
    const { readdirSync, statSync } = await import("node:fs");
    const path = await import("node:path");

    // Walk src/, skipping the config file that legitimately defines them.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry)) continue;

        // Normalize separators: Windows returns backslashes.
        const normalized = full.split(path.sep).join("/");
        if (normalized.endsWith("config/plans.ts")) continue;

        const source = readFileSync(full, "utf8");
        // Look for the plan limit numbers used as literals alongside a metric
        // name, which would indicate a duplicated limit rather than config.
        //
        // The match excludes numbers joined to a preceding "/" (Tailwind opacity
        // utilities such as `border-danger/50`) or to a word character, because
        // those are CSS class names, not plan limits. Without that exclusion the
        // check reports a false positive on any component using such a class.
        if (
          /(?<![\w/])(200|50)(?![\w/])/.test(source) &&
          /flashcardsPerDay|quizQuestionsPerDay|documentsPerDay/.test(source)
        ) {
          offenders.push(normalized);
        }
      }
    };
    walk("src");

    assert.deepEqual(offenders, [], `plan limits duplicated in: ${offenders.join(", ")}`);
  });
});

// ===========================================================================
// Entitlement — a paid plan is a lease, not a permanent flag
// ===========================================================================
// Whop owns WHEN a subscription ends, but its webhooks are not guaranteed to
// arrive. If entitlement were taken purely from the stored `plan` field, a
// dropped cancellation would leave a lapsed customer on Plus or Pro forever —
// keeping the higher quota and paying nothing. These tests pin the rule that
// makes entitlement self-healing.

describe("plan entitlement", () => {
  const now = new Date("2026-03-10T12:00:00.000Z");
  const future = new Date("2026-04-10T12:00:00.000Z");
  const past = new Date("2026-02-10T12:00:00.000Z");

  it("leaves the free plan alone", () => {
    assert.equal(entitledPlan("free", null, now), "free");
    assert.equal(entitledPlan("free", past, now), "free");
    assert.equal(entitledPlan("free", future, now), "free");
  });

  it("keeps a paid plan that is still within its period", () => {
    assert.equal(entitledPlan("plus", future, now), "plus");
    assert.equal(entitledPlan("pro", future, now), "pro");
  });

  it("REVOKES a paid plan whose period has ended", () => {
    // The launch-critical case: a lapsed subscription must stop working.
    assert.equal(entitledPlan("plus", past, now), "free");
    assert.equal(entitledPlan("pro", past, now), "free");
  });

  it("revokes at the exact expiry instant", () => {
    assert.equal(entitledPlan("pro", now, now), "free");
    assert.equal(
      entitledPlan("pro", new Date(now.getTime() + 1), now),
      "pro",
      "one millisecond before expiry is still entitled",
    );
  });

  it("treats a paid plan with no recorded end date as active", () => {
    // Covers lifetime grants and manually applied plans; only a KNOWN expiry
    // may revoke an entitlement.
    assert.equal(entitledPlan("pro", null, now), "pro");
  });

  it("isPlanExpired agrees with the resolver", () => {
    assert.equal(isPlanExpired(past, now), true);
    assert.equal(isPlanExpired(future, now), false);
    assert.equal(isPlanExpired(null, now), false);
    assert.equal(isPlanExpired(now, now), true);
  });
});

// ===========================================================================
// The entitlement check is actually wired into plan resolution
// ===========================================================================

describe("entitlement enforcement", () => {
  it("getUserPlan applies the expiry rather than trusting the stored plan", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/server/services/users.ts", "utf8");

    assert.match(
      source,
      /entitledPlan\(/,
      "the stored plan must be resolved through the entitlement check",
    );
    assert.match(
      source,
      /planExpiresAt/,
      "the recorded expiry must actually be read",
    );
  });

  it("every quota decision goes through getUserPlan", async () => {
    // Both generating routes must resolve the plan server-side, so an expired
    // plan cannot be used to generate.
    const { readFileSync } = await import("node:fs");
    for (const file of [
      "src/app/api/generate/route.ts",
      "src/app/api/study-sets/regenerate/route.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      assert.match(source, /getUserPlan\(decoded\.uid\)/, file);
    }
  });
});
