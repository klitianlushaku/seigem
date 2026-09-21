/**
 * Shared shell for the legal pages.
 *
 * Kept as one component so the Terms and the Privacy Policy cannot drift apart
 * in layout, and so the "last updated" line and the contact details are stated
 * once.
 *
 * These pages are readable without signing in, which matters: a prospective
 * customer has to be able to read the terms before creating an account, and a
 * payment provider expects the same.
 */
import type { ReactNode } from "react";

import { LEGAL_LAST_UPDATED, SUPPORT_EMAIL } from "@/config/app";

/** A titled section of a legal document. */
export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-6 text-muted">
        {children}
      </div>
    </section>
  );
}

/** Page wrapper: title, revision date, body. */
export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto w-full max-w-3xl">
      <div className="dash-panel rounded-[22px] p-5 sm:p-7">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-1 text-xs text-muted">
          Përditësuar për herë të fundit: {LEGAL_LAST_UPDATED}
        </p>
        <p className="mt-4 text-sm leading-6 text-muted">{intro}</p>

        {children}

        <LegalSection title="Kontakt">
          <p>
            Për çdo pyetje rreth këtyre kushteve, ose për të ushtruar të drejtat
            e tua mbi të dhënat, shkruaj në{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-accent hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </LegalSection>
      </div>
    </article>
  );
}
