"use client";

/**
 * `/studim` — the study experience.
 *
 * Accepts `?id=<studySetId>` to open a specific saved set. With no id, the most
 * recent set is opened.
 *
 * The inner component reads search params, so it is wrapped in Suspense: the
 * Next.js App Router requires a boundary around `useSearchParams` when the page
 * is statically rendered.
 */
import { Suspense } from "react";

import { Card } from "@/components/ui/card";
import { StudyExperience } from "@/components/study/study-experience";

export default function StudyPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <p className="text-sm text-muted">Duke lexuar materialin…</p>
        </Card>
      }
    >
      <StudyExperience />
    </Suspense>
  );
}
