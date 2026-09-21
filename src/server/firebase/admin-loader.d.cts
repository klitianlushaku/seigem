/**
 * Type declarations for the runtime firebase-admin loader.
 *
 * `admin-loader.cjs` is plain JavaScript, excluded from bundling so Node runs
 * its `require` calls at runtime and resolves firebase-admin's CommonJS build.
 * See that file's header for the full explanation.
 */
import type { App } from "firebase-admin/app";
import type { Auth } from "firebase-admin/auth";
import type {
  FieldValue as FirestoreFieldValue,
  Firestore,
  Timestamp as FirestoreTimestamp,
} from "firebase-admin/firestore";

/** Credentials passed from the validated server environment. */
export interface AdminCredentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/** Returns the singleton Admin app, initializing it on first use. */
export function getAdminApp(credentials: AdminCredentials): App;

/**
 * Firebase Admin Auth, bound to the singleton app.
 *
 * Credentials are required on the first call in the process; the loader caches
 * the app from then on.
 */
export function getAdminAuth(credentials: AdminCredentials): Auth;

/** Firebase Admin Firestore, bound to the singleton app. */
export function getAdminDb(credentials: AdminCredentials): Firestore;

/**
 * Firestore Timestamp class, resolved lazily.
 *
 * A Proxy, so importing this module never loads the SDK. It supports
 * `Timestamp.now()`, `Timestamp.fromDate(...)`, `new Timestamp(...)` and
 * `value instanceof Timestamp`.
 */
export const Timestamp: typeof FirestoreTimestamp;

/** Firestore FieldValue sentinel, resolved lazily for the same reason. */
export const FieldValue: typeof FirestoreFieldValue;

/** Resolution diagnostics for /api/health. Paths and booleans only. */
export function describeResolution(): {
  resolved: string | null;
  cwd: string;
  searchedDirs: string[];
  dirsThatExist: string[];
  adminPresent: boolean;
  packageRoot: string | null;
  rootEntries: string[] | null;
  libEntries: string[] | null;
  products: Record<
    string,
    {
      entryPath: string;
      entryExists: boolean;
      loaded: boolean;
      error: string | null;
    }
  >;
};