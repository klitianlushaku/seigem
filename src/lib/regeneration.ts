/**
 * Regeneration context assembly.
 *
 * When a user asks for MORE material on an existing study set, Seigem no longer
 * has the original document — it was never stored. Requirements are explicit
 * about what to do:
 *
 *   - Use the stored title first.
 *   - Also use the saved summary, flashcards, and quiz content as context.
 *   - Do NOT pretend the title alone contains the whole document.
 *   - If that context is insufficient, ask the user to re-upload.
 *
 * Pure functions so the sufficiency rules can be unit-tested without Firebase.
 */
import type { Flashcard, QuizQuestion } from "@/types";

/** What is available for a saved study set. */
export interface RegenerationContext {
  title: string;
  summary: string | null;
  flashcards: Flashcard[];
  quizQuestions: QuizQuestion[];
}

/** Why regeneration can or cannot proceed. */
export type ContextAssessment =
  | {
      /** Enough context to generate without the original document. */
      sufficient: true;
      /** Assembled context text to send to the model. */
      contextText: string;
      /** How the context was built, for logging and messaging. */
      basis: "full" | "partial";
    }
  | {
      sufficient: false;
      /** Albanian message telling the user to re-upload. */
      message: string;
      reason: "title_only" | "no_content";
    };

/**
 * Minimum characters of saved content needed to attempt generation without the
 * original document.
 *
 * A title alone is a few dozen characters and carries almost none of the
 * document's substance. Roughly 400 characters is about a solid paragraph —
 * enough to anchor related questions without inventing material wholesale.
 */
export const MIN_CONTEXT_CHARS = 400;

/** Builds the text used as context from whatever was saved. */
export function buildContextText(context: RegenerationContext): string {
  const parts: string[] = [`Titulli i materialit: ${context.title}`];

  if (context.summary) {
    parts.push("", "Përmbledhja e ruajtur:", context.summary);
  }

  if (context.flashcards.length > 0) {
    const cards = context.flashcards
      .map((card, index) => `${index + 1}. ${card.question} — ${card.answer}`)
      .join("\n");
    parts.push("", "Flashcards të ruajtura:", cards);
  }

  if (context.quizQuestions.length > 0) {
    const questions = context.quizQuestions
      .map((question, index) => {
        const correct = question.options[question.correctOptionIndex] ?? "";
        return `${index + 1}. ${question.question} (e saktë: ${correct})`;
      })
      .join("\n");
    parts.push("", "Pyetje kuizi të ruajtura:", questions);
  }

  return parts.join("\n");
}

/** Total characters of saved content, excluding the title. */
export function savedContentLength(context: RegenerationContext): number {
  const summaryLength = context.summary?.length ?? 0;
  const flashcardLength = context.flashcards.reduce(
    (total, card) => total + card.question.length + card.answer.length,
    0,
  );
  const quizLength = context.quizQuestions.reduce(
    (total, question) =>
      total +
      question.question.length +
      question.options.join("").length +
      (question.explanation?.length ?? 0),
    0,
  );

  return summaryLength + flashcardLength + quizLength;
}

/**
 * Decides whether saved content is enough to generate from.
 *
 * A title alone is NEVER enough: the requirement forbids implying that the
 * title contains the document. In that case the user is asked to re-upload.
 */
export function assessRegenerationContext(
  context: RegenerationContext,
): ContextAssessment {
  const savedLength = savedContentLength(context);

  if (savedLength === 0) {
    return {
      sufficient: false,
      reason: "no_content",
      message:
        "Ky material nuk ka përmbajtje të ruajtur mjaftueshëm për gjenerim të ri. Ngarko përsëri dokumentin origjinal.",
    };
  }

  if (savedLength < MIN_CONTEXT_CHARS) {
    return {
      sufficient: false,
      reason: "title_only",
      message:
        "Përmbajtja e ruajtur është shumë e vogël për të gjeneruar materiale të reja të sakta. Ngarko përsëri dokumentin origjinal.",
    };
  }

  return {
    sufficient: true,
    // "full" when a summary exists (the richest single source), otherwise the
    // saved cards and questions still give a workable basis.
    basis: context.summary ? "full" : "partial",
    contextText: buildContextText(context),
  };
}

/**
 * Instructions appended to the prompt when generating from saved content
 * rather than the original document.
 *
 * Tells the model to stay within what the saved material supports, so it does
 * not invent facts the user would reasonably attribute to their document.
 */
export const REGENERATION_NOTICE = `
Ky material nuk përmban dokumentin origjinal. Më poshtë jepet vetëm përmbajtja e
ruajtur më parë (titulli, përmbledhja, flashcards dhe pyetjet e kuizit).

Kërkesa:
- Krijo materiale të reja që lidhen me përmbajtjen e mësipërme.
- Mos shpik fakte që nuk mbështeten nga përmbajtja e dhënë.
- Mos përsërit materialet ekzistuese; krijo pyetje ose karta të reja.
`.trim();
