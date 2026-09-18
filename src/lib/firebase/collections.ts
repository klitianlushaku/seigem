/**
 * Firestore collection and field names.
 *
 * Centralized so that security rules, server code, and client code cannot drift
 * apart. Keep this in sync with `firestore.rules`.
 *
 * Privacy contract (enforced in later tasks):
 *   - Uploaded PDF / Word / PowerPoint files are NEVER stored.
 *   - Extracted document text, pages, paragraphs, and slide XML are NEVER stored.
 *   - Only the title and the generated study content are persisted.
 */

/** Top-level collection names. */
export const COLLECTIONS = {
  /** User profiles and account metadata (plan, usage counters). */
  users: "users",
  /** Generated study sets. Each belongs to exactly one authenticated user. */
  studySets: "studySets",
  /** Public quiz snapshots addressed by an unguessable token. */
  quizShares: "quizShares",
} as const;

/**
 * Field names used across documents.
 * Kept as a flat map to avoid typos in string literals.
 */
export const FIELDS = {
  // --- users/{uid} -----------------------------------------------------
  uid: "uid",
  displayName: "displayName",
  email: "email",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
  plan: "plan",
  /** Plan expiry timestamp, maintained by verified Whop webhooks only. */
  planExpiresAt: "planExpiresAt",
  /** Whop subscription id, linked to the Firebase user server-side. */
  whopSubscriptionId: "whopSubscriptionId",
  /** True when the membership is scheduled to end at period end. */
  cancelAtPeriodEnd: "cancelAtPeriodEnd",
  /** Daily usage counters, keyed by "YYYY-MM-DD" in the server timezone. */
  usage: "usage",
  /**
   * Active study time for today, keyed by the same server day.
   * Server-owned: the client reports elapsed seconds and the server totals them.
   */
  studyTime: "studyTime",

  // --- studySets/{studySetId} -----------------------------------------
  ownerUid: "ownerUid",
  title: "title",
  summary: "summary",
  flashcards: "flashcards",
  quizQuestions: "quizQuestions",
  /** AI model used, retained for debugging and cost tracking. */
  model: "model",
  /**
   * Display-only metadata about the SOURCE document: its format and page or
   * slide count. This is not source content — the file itself is never stored.
   */
  sourceFormat: "sourceFormat",
  sourceUnits: "sourceUnits",
  /** Explicit presence flags, so history can show what exists cheaply. */
  hasSummary: "hasSummary",
  hasFlashcards: "hasFlashcards",
  hasQuiz: "hasQuiz",
} as const;
