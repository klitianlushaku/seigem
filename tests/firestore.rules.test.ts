/**
 * Firestore Security Rules test suite.
 *
 * Run with:  npm run test:rules
 *
 * Requires the Firestore emulator, which `npm run test:rules` starts
 * automatically via `firebase emulators:exec`.
 *
 * These tests are the security contract from Task 5. They prove:
 *   1. A user cannot read or write another user's data.
 *   2. Document content (files, extracted text, pages, slide XML) can never
 *      be persisted, even if a client tries.
 *   3. Plan and usage fields are server-owned and cannot be self-granted.
 */
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

const PROJECT_ID = "seigem-rules-test";

const ALICE = "alice-uid";
const BOB = "bob-uid";

let testEnv: RulesTestEnvironment;

/** A valid study-set payload owned by `uid`. */
function validStudySet(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    ownerUid: uid,
    title: "Biologji - Qeliza",
    summary: "Përmbledhje e materialit.",
    flashcards: [{ question: "Çfarë është qeliza?", answer: "Njësia bazë e jetës." }],
    quizQuestions: [
      {
        question: "Sa kromozome ka njeriu?",
        options: ["23", "46", "12", "64"],
        correctOptionIndex: 1,
        explanation: "Njeriu ka 46 kromozome.",
      },
    ],
    hasSummary: true,
    hasFlashcards: true,
    hasQuiz: true,
    model: "deepseek-chat",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function aliceDb() {
  return testEnv.authenticatedContext(ALICE).firestore();
}

function bobDb() {
  return testEnv.authenticatedContext(BOB).firestore();
}

function anonDb() {
  return testEnv.unauthenticatedContext().firestore();
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

// ===========================================================================
// studySets — ownership
// ===========================================================================

describe("studySets: ownership isolation", () => {
  it("allows a user to create their own study set", async () => {
    await testEnv.clearFirestore();
    await assertSucceeds(
      setDoc(doc(aliceDb(), "studySets", "a1"), validStudySet(ALICE)),
    );
  });

  it("prevents creating a study set owned by someone else", async () => {
    await testEnv.clearFirestore();
    // Alice tries to write a document whose ownerUid is Bob.
    await assertFails(
      setDoc(doc(aliceDb(), "studySets", "spoofed"), validStudySet(BOB)),
    );
  });

  it("allows the owner to read their own study set", async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "studySets", "a1"), validStudySet(ALICE));
    });

    await assertSucceeds(getDoc(doc(aliceDb(), "studySets", "a1")));
  });

  it("BLOCKS another authenticated user from reading it", async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "studySets", "a1"), validStudySet(ALICE));
    });

    await assertFails(getDoc(doc(bobDb(), "studySets", "a1")));
  });

  it("BLOCKS an unauthenticated visitor from reading it", async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "studySets", "a1"), validStudySet(ALICE));
    });

    await assertFails(getDoc(doc(anonDb(), "studySets", "a1")));
  });

  it("BLOCKS another user from updating it", async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "studySets", "a1"), validStudySet(ALICE));
    });

    await assertFails(
      updateDoc(doc(bobDb(), "studySets", "a1"), { title: "Hacked" }),
    );
  });

  it("BLOCKS another user from deleting it", async () => {
    await testEnv.clearFirestore();
    const { deleteDoc } = await import("firebase/firestore");
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "studySets", "a1"), validStudySet(ALICE));
    });

    await assertFails(deleteDoc(doc(bobDb(), "studySets", "a1")));
  });

  it("allows the owner to delete their own study set", async () => {
    await testEnv.clearFirestore();
    const { deleteDoc } = await import("firebase/firestore");
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "studySets", "a1"), validStudySet(ALICE));
    });

    await assertSucceeds(deleteDoc(doc(aliceDb(), "studySets", "a1")));
  });

  it("BLOCKS a query that is not scoped to the caller", async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "studySets", "a1"), validStudySet(ALICE));
      await setDoc(doc(ctx.firestore(), "studySets", "b1"), validStudySet(BOB));
    });

    // Bob queries with no ownerUid filter. Firestore evaluates rules per
    // document, so Alice's document fails the ownership check.
    await assertFails(getDocs(query(collection(bobDb(), "studySets"), limit(50))));
  });

  it("allows a query scoped to the caller's own uid", async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "studySets", "a1"), validStudySet(ALICE));
      await setDoc(doc(ctx.firestore(), "studySets", "b1"), validStudySet(BOB));
    });

    await assertSucceeds(
      getDocs(
        query(
          collection(aliceDb(), "studySets"),
          where("ownerUid", "==", ALICE),
          limit(50),
        ),
      ),
    );
  });

  it("REGRESSION: an unscoped query must not return another user's data", async () => {
    // This is the most serious bug found in Task 5. `list` is a separate
    // permission from `get`; granting it without an ownership check let a
    // query return other users' documents in full, even though `get` denied
    // them. Both rules must carry the ownership condition.
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "studySets", "alice1"), validStudySet(ALICE));
    });

    const bobDb2 = bobDb();
    await assertFails(getDocs(query(collection(bobDb2, "studySets"), limit(50))));

    // Prove the data is genuinely unreachable, not merely an error response.
    await assertFails(
      getDocs(
        query(collection(bobDb2, "studySets"), where("ownerUid", "==", ALICE), limit(50)),
      ),
    );
  });

  it("a user's own scoped query returns only their documents", async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "studySets", "alice1"), validStudySet(ALICE));
      await setDoc(doc(ctx.firestore(), "studySets", "bob1"), validStudySet(BOB));
    });

    const snap = await getDocs(
      query(
        collection(aliceDb(), "studySets"),
        where("ownerUid", "==", ALICE),
        limit(50),
      ),
    );

    assert.equal(snap.size, 1, "Alice should see exactly her own study set");
    assert.equal(snap.docs[0]?.data().ownerUid, ALICE);
  });
});

// ===========================================================================
// studySets — privacy: document content must never be persisted
// ===========================================================================

describe("studySets: document content is never persisted", () => {
  const forbiddenPayloads: Array<[string, Record<string, unknown>]> = [
    ["raw extracted text", { rawText: "Teksti i plotë i dokumentit..." }],
    ["extractedText", { extractedText: "Teksti i plotë..." }],
    ["document pages", { pages: [{ index: 1, text: "faqe" }] }],
    ["paragraphs", { paragraphs: ["paragraf 1", "paragraf 2"] }],
    ["slide XML", { slideXml: "<p:sld><p:cSld>...</p:cSld></p:sld>" }],
    ["file bytes", { fileData: "JVBERi0xLjQK..." }],
    ["base64 payload", { base64: "JVBERi0xLjQKJcOkw7zDtsOfCg==" }],
    ["storage download url", { downloadUrl: "https://storage.example/x.pdf" }],
    ["original file field", { file: { name: "x.pdf" } }],
    ["full text field", { text: "i gjithë teksti i dokumentit" }],
    ["slide XML", { slideXml: "<p:sld><p:cSld>...</p:cSld></p:sld>" }],
    ["slide text", { slideText: "titulli i slides" }],
    ["buffer-like field", { buffer: "AAAA" }],
    ["document content field", { documentContent: "teksti i plotë" }],
    ["original text field", { originalText: "origjinali" }],
    ["storage path", { storagePath: "gs://bucket/file.pdf" }],
  ];

  for (const [label, extra] of forbiddenPayloads) {
    it(`rejects a study set containing ${label}`, async () => {
      await testEnv.clearFirestore();
      await assertFails(
        setDoc(doc(aliceDb(), "studySets", "bad"), validStudySet(ALICE, extra)),
      );
    });
  }

  it("rejects an unknown extra field not in the allow-list", async () => {
    await testEnv.clearFirestore();
    await assertFails(
      setDoc(
        doc(aliceDb(), "studySets", "bad2"),
        validStudySet(ALICE, { somethingUnexpected: "x" }),
      ),
    );
  });

  it("accepts a study set with only title + generated content", async () => {
    await testEnv.clearFirestore();
    await assertSucceeds(
      setDoc(doc(aliceDb(), "studySets", "good"), validStudySet(ALICE)),
    );
  });
});

// ===========================================================================
// studySets — schema validation
// ===========================================================================

describe("studySets: schema validation", () => {
  it("rejects an empty title", async () => {
    await testEnv.clearFirestore();
    await assertFails(
      setDoc(doc(aliceDb(), "studySets", "t"), validStudySet(ALICE, { title: "" })),
    );
  });

  it("rejects a title longer than 120 characters", async () => {
    await testEnv.clearFirestore();
    await assertFails(
      setDoc(
        doc(aliceDb(), "studySets", "t2"),
        validStudySet(ALICE, { title: "x".repeat(121) }),
      ),
    );
  });

  it("rejects hasSummary=true with no summary", async () => {
    await testEnv.clearFirestore();
    await assertFails(
      setDoc(
        doc(aliceDb(), "studySets", "t3"),
        validStudySet(ALICE, { summary: null }),
      ),
    );
  });

  it("rejects a quiz question whose correctOptionIndex is out of range", async () => {
    await testEnv.clearFirestore();
    await assertFails(
      setDoc(
        doc(aliceDb(), "studySets", "t4"),
        validStudySet(ALICE, {
          quizQuestions: [
            { question: "?", options: ["a", "b"], correctOptionIndex: 5 },
          ],
        }),
      ),
    );
  });

  it("rejects a flashcard with an empty answer", async () => {
    await testEnv.clearFirestore();
    await assertFails(
      setDoc(
        doc(aliceDb(), "studySets", "t5"),
        validStudySet(ALICE, {
          flashcards: [{ question: "Pyetje?", answer: "" }],
        }),
      ),
    );
  });

  it("rejects a flashcard carrying an extra field", async () => {
    await testEnv.clearFirestore();
    await assertFails(
      setDoc(
        doc(aliceDb(), "studySets", "t6"),
        validStudySet(ALICE, {
          flashcards: [{ question: "P?", answer: "A.", rawText: "leak" }],
        }),
      ),
    );
  });

  it("accepts a valid quiz with four options", async () => {
    await testEnv.clearFirestore();
    await assertSucceeds(
      setDoc(doc(aliceDb(), "studySets", "ok"), validStudySet(ALICE)),
    );
  });
});

// ===========================================================================
// studySets — list validation must cover EVERY element, not just the first few
// ===========================================================================
// Regression guard: the rules engine has no `.all()` over lists of maps, so
// validation is per-index. These tests prove a bad element is caught even when
// it sits deep in the list.

describe("studySets: list validation depth", () => {
  const goodCard = { question: "Pyetje?", answer: "Përgjigje." };
  const badCard = { question: "", answer: "Përgjigje." };

  /** Builds a flashcard list of length n with a bad entry at `badIndex`. */
  function cardsWithBadAt(n: number, badIndex: number) {
    return Array.from({ length: n }, (_, i) =>
      i === badIndex ? badCard : goodCard,
    );
  }

  for (const index of [0, 1, 4, 5, 6, 7]) {
    it(`rejects an invalid flashcard at index ${index}`, async () => {
      await testEnv.clearFirestore();
      await assertFails(
        setDoc(
          doc(aliceDb(), "studySets", `deep-${index}`),
          validStudySet(ALICE, { flashcards: cardsWithBadAt(8, index) }),
        ),
      );
    });
  }

  it("accepts a full list of 8 valid flashcards", async () => {
    await testEnv.clearFirestore();
    await assertSucceeds(
      setDoc(
        doc(aliceDb(), "studySets", "full8"),
        validStudySet(ALICE, {
          flashcards: Array.from({ length: 8 }, () => goodCard),
        }),
      ),
    );
  });

  it("rejects 9 flashcards (over the validated bound)", async () => {
    await testEnv.clearFirestore();
    await assertFails(
      setDoc(
        doc(aliceDb(), "studySets", "over9"),
        validStudySet(ALICE, {
          flashcards: Array.from({ length: 9 }, () => goodCard),
        }),
      ),
    );
  });

  it("rejects an invalid quiz question late in the list", async () => {
    await testEnv.clearFirestore();
    const good = {
      question: "Pyetje?",
      options: ["a", "b", "c", "d"],
      correctOptionIndex: 0,
    };
    // correctOptionIndex out of range, positioned at index 6.
    const questions = Array.from({ length: 8 }, (_, i) =>
      i === 6 ? { ...good, correctOptionIndex: 9 } : good,
    );

    await assertFails(
      setDoc(
        doc(aliceDb(), "studySets", "deepquiz"),
        validStudySet(ALICE, { quizQuestions: questions }),
      ),
    );
  });

  it("rejects a flashcard whose extra field sits deep in the list", async () => {
    await testEnv.clearFirestore();
    const leaking = { ...goodCard, rawText: "teksti i dokumentit" };
    const cards = Array.from({ length: 8 }, (_, i) =>
      i === 7 ? leaking : goodCard,
    );

    await assertFails(
      setDoc(
        doc(aliceDb(), "studySets", "deepleak"),
        validStudySet(ALICE, { flashcards: cards }),
      ),
    );
  });
});

// ===========================================================================
// users — plan and usage are server-owned
// ===========================================================================

describe("users: server-owned fields", () => {
  function profile(uid: string, overrides: Record<string, unknown> = {}) {
    return {
      uid,
      displayName: "Alice",
      email: "alice@example.com",
      createdAt: new Date(),
      updatedAt: new Date(),
      plan: "free",
      planExpiresAt: null,
      whopSubscriptionId: null,
      usage: { dayKey: "2026-01-01", documents: 0, flashcards: 0, quizQuestions: 0 },
      ...overrides,
    };
  }

  it("allows a user to read their own profile", async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", ALICE), profile(ALICE));
    });

    await assertSucceeds(getDoc(doc(aliceDb(), "users", ALICE)));
  });

  it("BLOCKS reading another user's profile", async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", ALICE), profile(ALICE));
    });

    await assertFails(getDoc(doc(bobDb(), "users", ALICE)));
  });

  it("BLOCKS client-side profile creation", async () => {
    await testEnv.clearFirestore();
    await assertFails(setDoc(doc(aliceDb(), "users", ALICE), profile(ALICE)));
  });

  it("BLOCKS a user upgrading their own plan to pro", async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", ALICE), profile(ALICE));
    });

    await assertFails(
      updateDoc(doc(aliceDb(), "users", ALICE), { plan: "pro" }),
    );
  });

  it("BLOCKS a user increasing their own usage quota", async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", ALICE), profile(ALICE));
    });

    // The realistic attack: keep the shape valid but claim more allowance.
    await assertFails(
      updateDoc(doc(aliceDb(), "users", ALICE), {
        usage: {
          dayKey: "2026-01-01",
          documents: 0,
          flashcards: 999,
          quizQuestions: 999,
        },
      }),
    );
  });

  it("BLOCKS a user resetting their usage counters to bypass quota", async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "users", ALICE),
        profile(ALICE, {
          usage: {
            dayKey: "2026-01-01",
            documents: 2,
            flashcards: 3,
            quizQuestions: 3,
          },
        }),
      );
    });

    await assertFails(
      updateDoc(doc(aliceDb(), "users", ALICE), {
        usage: { dayKey: "2026-01-02", documents: 0, flashcards: 0, quizQuestions: 0 },
      }),
    );
  });

  it("BLOCKS a user linking a fake Whop subscription", async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", ALICE), profile(ALICE));
    });

    await assertFails(
      updateDoc(doc(aliceDb(), "users", ALICE), { whopSubscriptionId: "fake" }),
    );
  });

  it("allows a user updating only their display name", async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", ALICE), profile(ALICE));
    });

    await assertSucceeds(
      updateDoc(doc(aliceDb(), "users", ALICE), { displayName: "Alice e Re" }),
    );
  });

  it("BLOCKS deleting a profile from the client", async () => {
    await testEnv.clearFirestore();
    const { deleteDoc } = await import("firebase/firestore");
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", ALICE), profile(ALICE));
    });

    await assertFails(deleteDoc(doc(aliceDb(), "users", ALICE)));
  });
});

// ===========================================================================
// Default deny
// ===========================================================================

describe("default deny", () => {
  it("BLOCKS reads from an unknown collection", async () => {
    await testEnv.clearFirestore();
    await assertFails(getDoc(doc(aliceDb(), "randomStuff", "x")));
  });

  it("BLOCKS writes to an unknown collection", async () => {
    await testEnv.clearFirestore();
    await assertFails(setDoc(doc(aliceDb(), "randomStuff", "x"), { a: 1 }));
  });
});
