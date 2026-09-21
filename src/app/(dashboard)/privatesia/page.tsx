import type { Metadata } from "next";

import { LegalPage, LegalSection } from "@/components/legal/legal-page";
import { APP_NAME, SUPPORT_EMAIL } from "@/config/app";

export const metadata: Metadata = {
  title: "Politika e privatësisë",
};

/**
 * Privacy Policy.
 *
 * IMPORTANT: this is a plain-language description of what the application
 * actually does with data, written from the code rather than from a template. It
 * is NOT legal advice and has not been reviewed by a lawyer. Have it checked
 * before selling to the public, and keep it accurate: a policy that overstates
 * or understates what happens is worse than none.
 *
 * The data flows described here mirror the code exactly:
 *   - sign-in is Firebase Authentication (Google);
 *   - documents are parsed in the BROWSER (pdf.js / mammoth / JSZip) and the
 *     file itself is never uploaded or stored;
 *   - the extracted text is sent to DeepSeek for generation and is not persisted;
 *   - Firestore stores only the title, the generated content and counters;
 *   - payments are handled by Whop, which sees the buyer's payment details and
 *     receives the internal account id as metadata.
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Politika e privatësisë"
      intro={`Kjo faqe shpjegon cilat të dhëna mblidhen kur përdor ${APP_NAME}, pse mblidhen, dhe çfarë të drejtash ke mbi to.`}
    >
      <LegalSection title="1. Çfarë NUK ruajmë">
        <p>
          <strong className="text-content">
            Dokumentet që ngarkon nuk dërgohen dhe nuk ruhen në serverët tanë.
          </strong>{" "}
          Skedari lexohet brenda shfletuesit tënd dhe teksti nxirret lokalisht.
          Vetëm teksti i nxjerrë dërgohet për përpunim, dhe ai nuk ruhet pasi
          përfundon gjenerimi.
        </p>
        <p>
          Nuk ruajmë fjalëkalime: hyrja bëhet përmes llogarisë tënde Google.
        </p>
      </LegalSection>

      <LegalSection title="2. Të dhënat që mblidhen">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <span className="text-content">Identiteti i llogarisë:</span> emri,
            adresa e emailit dhe identifikuesi i llogarisë Google, marrë nga
            Firebase Authentication gjatë hyrjes.
          </li>
          <li>
            <span className="text-content">Përmbajtja e gjeneruar:</span> titulli
            i materialit, përmbledhja, flashcards dhe pyetjet e kuizit që
            krijohen, të lidhura me llogarinë tënde.
          </li>
          <li>
            <span className="text-content">Të dhëna përdorimi:</span> numëruesit
            ditorë (dokumente, flashcards, pyetje) dhe koha e studimit, të
            nevojshme për zbatimin e kufijve të planit.
          </li>
          <li>
            <span className="text-content">Të dhëna abonimi:</span> plani,
            data e skadimit dhe identifikuesi i abonimit, të marra nga{" "}
            {APP_NAME === "Seigem" ? "Whop" : "ofruesi i pagesave"}.
          </li>
        </ul>
        <p>
          Nuk mblidhen të dhëna pagese: numri i kartës dhe të dhënat bankare
          mbeten vetëm te ofruesi i pagesave.
        </p>
      </LegalSection>

      <LegalSection title="3. Pse përpunohen (baza ligjore)">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <span className="text-content">Për të ofruar shërbimin</span>{" "}
            (ekzekutimi i kontratës): krijimi i përmbledhjeve, kartave dhe
            kuizeve, dhe ruajtja e tyre në llogarinë tënde.
          </li>
          <li>
            <span className="text-content">Për të zbatuar kufijtë e planit</span>{" "}
            (ekzekutimi i kontratës): numërimi ditor i përdorimit.
          </li>
          <li>
            <span className="text-content">Për sigurinë e shërbimit</span>{" "}
            (interes legjitim): parandalimi i abuzimit dhe i kërkesave
            autentikimi të rreme.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Kush i pranon të dhënat">
        <p>
          Nuk i shesim dhe nuk i ndajmë të dhënat për reklama. Përdorim
          ofruesit e mëposhtëm, vetëm aq sa duhet për shërbimin:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <span className="text-content">Google Firebase</span> — hyrja në
            llogari dhe ruajtja e përmbajtjes së gjeneruar dhe e numëruesve.
          </li>
          <li>
            <span className="text-content">DeepSeek</span> — përpunimi i tekstit
            për të krijuar përmbledhjen, kartat dhe pyetjet. Tekstit i nënshtrohet
            gjenerimit dhe nuk përdoret për të stërvitur modele sipas kushteve të
            tyre të shërbimit.
          </li>
          <li>
            <span className="text-content">Whop</span> — përpunimi i pagesave,
            faturave dhe abonimeve. Whop merr identifikuesin e llogarisë sate si
            metadata të blerjes, që abonimi t&apos;i lidhet llogarisë së saktë.
          </li>
          <li>
            <span className="text-content">Vercel</span> — strehimi i
            aplikacionit dhe regjistrat e gabimeve.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Sa kohë ruhen">
        <p>
          Përmbajtja e gjeneruar dhe numëruesit ruhen derisa ta fshish materialin
          ose llogarinë. Mund të fshish çdo material individual nga lista e
          materialeve. Kur fshin llogarinë, fshihen edhe të dhënat e lidhura me
          të.
        </p>
      </LegalSection>

      <LegalSection title="6. Të drejtat e tua">
        <p>
          Sipas GDPR, ke të drejtë të hysh në të dhënat e tua, t&apos;i
          korrigjosh, t&apos;i fshish, të kufizosh përpunimin, të marrësh një
          kopje të tyre dhe të kundërshtosh përpunimin. Për çdo kërkesë, shkruaj
          në {SUPPORT_EMAIL} dhe përgjigjemi brenda 30 ditësh.
        </p>
        <p>
          Nëse mendon se të drejtat e tua janë shkelur, mund të ankohesh pranë
          autoritetit për mbrojtjen e të dhënave personale në vendin tënd.
        </p>
      </LegalSection>

      <LegalSection title="7. Kukit dhe gjurmimi">
        <p>
          {APP_NAME} nuk përdor kuki reklamimi dhe nuk bën gjurmim ndërfaqesh.
          Përdoren vetëm kukit e nevojshme për funksionimin e hyrjes dhe të
          sesionit.
        </p>
      </LegalSection>

      <LegalSection title="8. Siguria">
        <p>
          Komunikimi është i kriptuar (HTTPS). Qasja në të dhënat e tua mbrohet
          nga rregulla sigurie në bazën e të dhënave, të cilat lejojnë vetëm
          llogarinë tënde t&apos;i lexojë dhe shkruajë materialet e veta.
        </p>
      </LegalSection>

      <LegalSection title="9. Ndryshimet">
        <p>
          Ndryshimet materiale njoftohen në shërbim përpara se të hyjnë në fuqi.
          Vazhdimi i përdorimit pas njoftimit nënkupton pranimin e politikës së
          përditësuar.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
