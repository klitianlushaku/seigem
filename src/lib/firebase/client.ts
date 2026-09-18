/**
 * Firebase client initialization (browser / React).
 *
 * Safe to import from Client Components: it only uses NEXT_PUBLIC_ values.
 * Firestore persistence uses the default (in-memory / IndexedDB) cache; no
 * document content is ever written here by this module.
 */
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

import { publicEnv } from "@/lib/env/public";

/**
 * Firebase Web SDK configuration.
 *
 * `storageBucket` is included only when configured. It is optional because
 * Seigem never uses Cloud Storage — documents are parsed in the browser — and
 * `@firebase/storage` is the only package that reads this key. Spreading it
 * conditionally keeps the object free of an explicit `undefined`, which
 * `exactOptionalPropertyTypes` would otherwise reject.
 */
const firebaseConfig = {
  apiKey: publicEnv.firebaseApiKey,
  authDomain: publicEnv.firebaseAuthDomain,
  projectId: publicEnv.firebaseProjectId,
  messagingSenderId: publicEnv.firebaseMessagingSenderId,
  appId: publicEnv.firebaseAppId,
  ...(publicEnv.firebaseStorageBucket
    ? { storageBucket: publicEnv.firebaseStorageBucket }
    : {}),
};

/**
 * Returns the singleton Firebase app, initializing it on first use.
 * Guards against re-initialization during hot reload.
 */
export function getFirebaseApp(): FirebaseApp {
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
}

/** Shared Firebase Auth instance. */
export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}

/** Shared Firestore instance. */
export function getFirebaseDb(): Firestore {
  return getFirestore(getFirebaseApp());
}
