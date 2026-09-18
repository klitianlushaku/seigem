"use client";

/**
 * "Materialet e mia" page.
 *
 * A dedicated route for the saved study-set history. The same section also
 * appears on the dashboard; this page gives it a stable URL for linking.
 */
import { StudySetHistory } from "@/components/dashboard/study-set-history";

export default function MaterialsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Materialet e mia
        </h1>
        <p className="mt-1 text-sm text-muted">
          Përmbledhjet, flashcards dhe kuizet që ke gjeneruar më parë. Dokumenti
          origjinal nuk ruhet — ruhet vetëm përmbajtja e gjeneruar.
        </p>
      </div>

      <StudySetHistory />
    </div>
  );
}
