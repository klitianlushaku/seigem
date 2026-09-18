"use client";

/**
 * "Ndihmë & Mbështetje" — the help page.
 *
 * A small, self-contained FAQ plus a contact route. Deliberately static: it
 * answers the questions the app actually raises (where the document goes, what
 * the daily limits mean, how generation works) without inventing a support
 * system that does not exist yet.
 */
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { HelpIcon } from "@/components/ui/icons";
import { getPlan, PLAN_ORDER } from "@/config/plans";

/** One question and its answer. */
interface FaqEntry {
  question: string;
  answer: string;
}

const FAQ: readonly FaqEntry[] = [
  {
    question: "A ruhet dokumenti që ngarkoj?",
    answer:
      "Jo. Skedari lexohet vetëm në shfletuesin tënd për të nxjerrë tekstin, dhe teksti përdoret vetëm për gjenerimin. Ruhen vetëm përmbledhja, flashcards dhe pyetjet e kuizit që krijohen.",
  },
  {
    question: "Cilat formate pranohen?",
    answer:
      "PDF, Word (.docx) dhe PowerPoint (.pptx), deri në 25 MB për skedar. Mund të ngarkosh disa skedarë njëherësh.",
  },
  {
    question: "Pse nuk gjenerohet asgjë nga një PDF?",
    answer:
      "PDF-të e skanuara përmbajnë imazhe, jo tekst. Pa një shtresë teksti nuk ka çfarë të lexohet, prandaj ngarko një version me tekst ose një dokument Word.",
  },
  {
    question: "Si funksionojnë kufijtë ditorë?",
    answer:
      "Çdo plan ka një numër dokumentesh, flashcards dhe pyetjesh kuizi në ditë. Kufijtë rifreskohen çdo ditë. Mund t'i shohësh në faqen e planit.",
  },
  {
    question: "Mund të shtoj më shumë materiale më vonë?",
    answer:
      "Po. Hap një material të ruajtur dhe zgjidh \"Gjenero më shumë\" për të shtuar karta ose pyetje të reja, pa e humbur atë që ke.",
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <Card>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stat-blue/12 text-stat-blue">
            <HelpIcon size={20} />
          </span>
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold">Ndihmë &amp; Mbështetje</h1>
            <p className="mt-0.5 text-xs text-muted">
              Përgjigjet për pyetjet më të shpeshta.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold">Pyetje të shpeshta</h2>

        <dl className="mt-3 space-y-3">
          {FAQ.map((entry) => (
            <div
              key={entry.question}
              className="rounded-xl border border-line px-3.5 py-3"
            >
              <dt className="text-[13px] font-semibold">{entry.question}</dt>
              <dd className="mt-1.5 text-[12px] leading-5 text-muted">
                {entry.answer}
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold">Kufijtë e planeve</h2>
        <p className="mt-1 text-xs text-muted">
          Numrat vlejnë për çdo ditë dhe rifreskohen automatikisht.
        </p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-[12px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.08em] text-muted">
                <th scope="col" className="py-1.5 pr-3 font-semibold">
                  Plani
                </th>
                <th scope="col" className="py-1.5 pr-3 font-semibold">
                  Dokumente
                </th>
                <th scope="col" className="py-1.5 pr-3 font-semibold">
                  Flashcards
                </th>
                <th scope="col" className="py-1.5 font-semibold">
                  Pyetje kuizi
                </th>
              </tr>
            </thead>
            <tbody>
              {PLAN_ORDER.map((planId) => {
                const plan = getPlan(planId);
                return (
                  <tr key={planId} className="border-t border-line">
                    <th scope="row" className="py-2 pr-3 font-semibold">
                      {plan.name}
                    </th>
                    <td className="py-2 pr-3 tabular-nums text-muted">
                      {plan.limits.documentsPerDay}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-muted">
                      {plan.limits.flashcardsPerDay}
                    </td>
                    <td className="py-2 tabular-nums text-muted">
                      {plan.limits.quizQuestionsPerDay}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Link
          href="/cmimet"
          className="mt-3 inline-block text-xs font-medium text-accent hover:underline"
        >
          Shiko planet dhe përmirëso →
        </Link>
      </Card>
    </div>
  );
}
