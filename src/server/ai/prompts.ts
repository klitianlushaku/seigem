/**
 * Albanian prompt construction for DeepSeek.
 *
 * Requirements driving these prompts:
 *   - Generated educational content must be in ALBANIAN, so the prompts are.
 *   - Summaries focus on the most important concepts and avoid unnecessary length.
 *   - Technical terminology from the source is preserved verbatim.
 *   - Flashcards have a clear question and a concise answer.
 *   - Quiz questions are useful for studying, not trivial, and each has exactly
 *     one identifiable correct answer.
 *   - Multiple choice with four options is preferred where suitable.
 *   - Output must be machine-readable JSON.
 *
 * DeepSeek's JSON mode additionally requires that the word "json" appears in
 * the prompt and that an example of the desired shape is given:
 * https://api-docs.deepseek.com/guides/json_mode
 */
import type { GenerationKind } from "@/types";

/** Output token budget. DeepSeek truncates JSON mid-string if this is too low. */
export const MAX_OUTPUT_TOKENS = 4096;

/** How many of each kind a request asked for. */
export interface RequestedCounts {
  flashcards: number;
  quizQuestions: number;
}

export interface ExcludedQuestions {
  flashcards?: string[];
  quizQuestions?: string[];
}

/**
 * Shared rules applied to every request.
 *
 * The last rule matters more than it looks: the response is a single JSON
 * object, and a model that also emits an empty `summary` when no summary was
 * requested produces content the user did not ask for and is not charged for.
 */
const COMMON_RULES = `
Rregulla të përgjithshme:
- Përgjigju VETËM me JSON të vlefshëm. Pa tekst para ose pas JSON-it, pa blloqe kod.
- I gjithë përmbajtja e gjeneruar duhet të jetë në shqip.
- Përdor vetëm informacionin që gjendet në materialin e dhënë. Mos shpik fakte.
- Ruaj terminologjinë teknike ashtu siç shfaqet në burim (p.sh. emrat e koncepteve, simbolet, formulat).
- Mos përfshi komente, shpjegime meta apo tekst shtesë.
- Kthe VETËM çelësat e kërkuar. Mos shto çelësa të tjerë.
`.trim();

/** Per-kind output specifications. */
const SUMMARY_SPEC = `
Detyra: krijo një përmbledhje të strukturuar të materialit.

Formati i detyruar — përdor SAKTËSISHT këto tre seksione Markdown, në këtë rend:

## Pikat kryesore
- Nga 4 deri në 7 pika, secila një fjali e vetme dhe konkrete.
- Secila pikë duhet të qëndrojë më vete, pa iu referuar "materialit më sipër".
- Përfshi numra, formula ose emra kur janë thelbësorë.

## Shpjegimi
- 2 deri në 4 paragrafë që shpjegojnë idetë kryesore me lidhje logjike mes tyre.
- Përqendrohu në KONCEPTET MË TË RËNDËSISHME, jo në detaje margjinale.
- Mos e zgjat pa nevojë.

## Definicione
- Nga 3 deri në 6 terma, secili në formatin: **Termi** — shpjegim i shkurtër.
- Zgjidh termat teknikë që studenti duhet t'i mbajë mend.
- Shpjegimi një fjali, pa përsëritur fjalë për fjalë pikat kryesore.

Kërkesa të tjera:
- Ruaj terminologjinë teknike ashtu siç shfaqet në burim.
- Mos përsërit të njëjtin informacion në seksione të ndryshme.
- Mos shto seksione të tjera përveç këtyre tre.
`.trim();

/**
 * Flashcard specification for an exact count.
 *
 * The count is stated explicitly because the quota is charged per requested
 * card: producing more than was charged would hand a free user more content
 * than their tier allows, and producing fewer would be a silent overcharge.
 */
function flashcardsSpec(count: number): string {
  return `
Detyra: krijo flashcards për përsëritje.

Kërkesa:
- Krijo SAKTËSISHT ${count} ${count === 1 ? "kartë" : "karta"}. As më shumë, as më pak.
- Çdo kartë ka një pyetje të qartë dhe një përgjigje të shkurtër e të saktë.
- Pyetja duhet të ketë kuptim edhe jashtë kontekstit të materialit.
- Përgjigjja duhet të jetë koncize: një frazë ose një fjali e shkurtër.
- Mos krijo karta të dyfishta ose shumë të ngjashme.
`.trim();
}

/** Quiz specification for an exact count. */
function quizSpec(count: number): string {
  return `
Detyra: krijo pyetje kuizi me zgjedhje të shumëfishtë.

Kërkesa:
- Krijo SAKTËSISHT ${count} ${count === 1 ? "pyetje" : "pyetje"}. As më shumë, as më pak.
- Çdo pyetje duhet të jetë e dobishme për studim, jo e parëndësishme ose mashtruese.
- Përdor KATËR alternativa kur është e mundur.
- Duhet të ketë SAKTËSISHT NJË përgjigje të saktë, të identifikueshme pa dyshim.
- Alternativat e gabuara duhet të jenë të besueshme, jo qesharake.
- "correctOptionIndex" është indeksi (duke filluar nga 0) i alternativës së saktë.
- Shto një "explanation" të shkurtër kur ndihmon të kuptohet përgjigjja.
`.trim();
}

/**
 * One JSON fragment per kind, assembled into a SINGLE example object.
 *
 * Earlier versions showed three separate example documents, which invited the
 * model to return only the first one. A single object containing every
 * requested key makes the required shape unambiguous.
 *
 * The `\\n` sequences are literal, so the example itself is valid JSON: an
 * example with raw newlines inside a string would teach the model to emit
 * JSON that cannot be parsed.
 */
const EXAMPLE_FRAGMENTS: Readonly<Record<GenerationKind, string>> = {
  summary: `"summary": "## Pikat kryesore\\n- Pika e parë.\\n- Pika e dytë.\\n\\n## Shpjegimi\\nParagraf shpjegues në shqip.\\n\\n## Definicione\\n**Termi** — shpjegim i shkurtër."`,
  flashcards: `"flashcards": [
    { "question": "Çfarë është qeliza?", "answer": "Njësia bazë strukturore e jetës." }
  ]`,
  quiz: `"quizQuestions": [
    {
      "question": "Sa kromozome ka njeriu?",
      "options": ["23", "46", "12", "64"],
      "correctOptionIndex": 1,
      "explanation": "Qelizat njerëzore përmbajnë 46 kromozome."
    }
  ]`,
};

/** Maps a generation kind to the JSON key the model must return. */
const RESPONSE_KEY: Readonly<Record<GenerationKind, string>> = {
  summary: "summary",
  flashcards: "flashcards",
  quiz: "quizQuestions",
};

/**
 * Builds the system prompt for a set of requested generation kinds.
 *
 * The model must return ONE JSON object containing every requested key, so a
 * single call can produce everything the user was charged for.
 *
 * @param kinds  Which outputs were requested.
 * @param counts How many of each. Defaults to the per-document maximum when
 *   omitted, so a caller that does not care still gets a bounded request.
 */
export function buildSystemPrompt(
  kinds: GenerationKind[],
  counts?: Partial<RequestedCounts>,
): string {
  const flashcardCount = counts?.flashcards ?? 8;
  const quizCount = counts?.quizQuestions ?? 8;

  const specs: string[] = [];
  const fragments: string[] = [];

  if (kinds.includes("summary")) {
    specs.push(SUMMARY_SPEC);
    fragments.push(EXAMPLE_FRAGMENTS.summary);
  }
  if (kinds.includes("flashcards")) {
    specs.push(flashcardsSpec(flashcardCount));
    fragments.push(EXAMPLE_FRAGMENTS.flashcards);
  }
  if (kinds.includes("quiz")) {
    specs.push(quizSpec(quizCount));
    fragments.push(EXAMPLE_FRAGMENTS.quiz);
  }

  const requestedKeys = kinds.map((kind) => RESPONSE_KEY[kind]).join(", ");
  const exampleObject = `{\n  ${fragments.join(",\n  ")}\n}`;

  return [
    "Ju jeni një asistent arsimor që përgatit materiale studimi në shqip nga dokumente të ngarkuara nga studentët.",
    COMMON_RULES,
    specs.join("\n\n"),
    `Formati i detyruar: kthe NJË objekt të vetëm JSON që përmban TË GJITHË këta çelësa: ${requestedKeys}. Mos kthe objekte të veçanta dhe mos lërë asnjë çelës jashtë.`,
    "Shembull i objektit të vetëm json që duhet ndjekur saktësisht:",
    exampleObject,
    "Kthe vetëm JSON-in, pa asnjë tekst tjetër.",
  ].join("\n\n");
}

/**
 * Builds the user prompt from the document title and extracted text.
 *
 * The title is included as context only. The extracted text is the sole source
 * of truth; it is sent for this request and never persisted.
 */
export function buildUserPrompt(title: string, text: string): string {
  return [
    `Titulli i materialit: ${title}`,
    "",
    "Materiali (teksti i nxjerrë nga dokumenti):",
    '"""',
    text,
    '"""',
    "",
    "Përgatit materialin sipas udhëzimeve dhe kthe vetëm JSON-in.",
  ].join("\n");
}

/** Adds explicit exclusions for regeneration so repeated batches stay new. */
export function buildExclusionPrompt(excluded: ExcludedQuestions): string {
  const flashcards = excluded.flashcards ?? [];
  const quizQuestions = excluded.quizQuestions ?? [];
  if (flashcards.length === 0 && quizQuestions.length === 0) return "";

  return [
    "Mos përsërit asnjë nga këto pyetje ekzistuese:",
    flashcards.length > 0
      ? `Flashcards: ${flashcards.map((question, index) => `${index + 1}. ${question}`).join(" | ")}`
      : "",
    quizQuestions.length > 0
      ? `Pyetje kuizi: ${quizQuestions.map((question, index) => `${index + 1}. ${question}`).join(" | ")}`
      : "",
    "Pyetjet e reja duhet të testojnë aspekte të tjera të materialit.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Albanian label for a generation kind, used in logs and error messages. */
const KIND_LABELS: Readonly<Record<GenerationKind, string>> = {
  summary: "përmbledhje",
  flashcards: "flashcards",
  quiz: "kuiz",
};

/** Albanian label for a generation kind. */
export function kindLabel(kind: GenerationKind): string {
  return KIND_LABELS[kind];
}

/** Keys the model is expected to return for the given kinds. */
export function expectedKeys(kinds: GenerationKind[]): string[] {
  const keys: string[] = [];
  if (kinds.includes("summary")) keys.push("summary");
  if (kinds.includes("flashcards")) keys.push("flashcards");
  if (kinds.includes("quiz")) keys.push("quizQuestions");
  return keys;
}
