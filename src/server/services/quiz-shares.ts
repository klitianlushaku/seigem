/** Server-side creation and lookup for read-only quiz links. */
import "server-only";

import { randomBytes } from "node:crypto";

import { Timestamp } from "firebase-admin/firestore";

import { COLLECTIONS } from "@/lib/firebase/collections";
import { getAdminDb } from "@/server/firebase/admin";
import { getStudySet } from "@/server/services/study-sets";
import type { QuizQuestion } from "@/types";

export interface PublicQuizShare {
  token: string;
  title: string;
  questions: QuizQuestion[];
}

function sharesCollection() {
  return getAdminDb().collection(COLLECTIONS.quizShares);
}

/** Creates a snapshot so later edits to the owner's set do not alter a link. */
export async function createQuizShare(
  ownerUid: string,
  studySetId: string,
): Promise<PublicQuizShare | null> {
  const studySet = await getStudySet(ownerUid, studySetId);
  if (!studySet || studySet.quizQuestions.length === 0) return null;

  const token = randomBytes(32).toString("base64url");
  const share = {
    token,
    ownerUid,
    studySetId,
    title: studySet.title,
    quizQuestions: studySet.quizQuestions,
    createdAt: Timestamp.now(),
  };

  await sharesCollection().doc(token).set(share);
  return {
    token,
    title: share.title,
    questions: share.quizQuestions,
  };
}

/** Reads only a token-addressed quiz snapshot; no auth is required. */
export async function getPublicQuizShare(
  token: string,
): Promise<PublicQuizShare | null> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const snapshot = await sharesCollection().doc(token).get();
  if (!snapshot.exists) return null;

  const data = snapshot.data() ?? {};
  if (typeof data.title !== "string" || !Array.isArray(data.quizQuestions)) {
    return null;
  }

  return {
    token,
    title: data.title,
    questions: data.quizQuestions as QuizQuestion[],
  };
}