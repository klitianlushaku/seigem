import type { Metadata } from "next";

import { LegalPage, LegalSection } from "@/components/legal/legal-page";
import {
  APP_NAME,
  MERCHANT_OF_RECORD,
  SUPPORT_EMAIL,
} from "@/config/app";
import { PLANS, PLAN_ORDER } from "@/config/plans";

export const metadata: Metadata = {
  title: "Kushtet e përdorimit",
};

/**
 * Terms of Service.
 *
 * IMPORTANT: this is a plain-language starting point written to match what the
 * application actually does. It is NOT legal advice and has not been reviewed by
 * a lawyer. Before selling to the public, have it checked against the
 * jurisdiction you trade from, and confirm the merchant-of-record wording with
 * Whop.
 *
 * Every factual claim below is verifiable in the codebase, deliberately:
 * documents are parsed in the browser and never uploaded, only generated content
 * is stored, and payments are handled entirely by Whop.
 */
export default function TermsPage() {
  const paidPlans = PLAN_ORDER.filter((id) => id !== "free").map((id) => PLANS[id]);

  return (
    <LegalPage
      title="Kushtet e përdorimit"
      intro={`Këto kushte rregullojnë përdorimin e ${APP_NAME}. Duke krijuar një llogari ose duke përdorur shërbimin, ti pranon ato.`}
    >
      <LegalSection title="1. Shërbimi">
        <p>
          {APP_NAME} kthen materiale studimi (PDF, Word dhe PowerPoint) në
          përmbledhje, flashcards dhe pyetje kuizi, të krijuara automatikisht nga
          një model gjuhësor.
        </p>
        <p>
          Përmbajtja gjenerohet automatikisht dhe mund të përmbajë gabime. Ajo
          është një mjet studimi ndihmës, nuk është material zyrtar i kursit dhe
          nuk zëvendëson tekstin origjinal apo udhëzimet e mësuesit. Verifiko
          gjithmonë informacionin e rëndësishëm në burimin origjinal.
        </p>
      </LegalSection>

      <LegalSection title="2. Llogaria">
        <p>
          Hyrja bëhet me llogari Google. Ti je përgjegjës për ruajtjen e sigurt të
          llogarisë sate Google dhe për çdo aktivitet që ndodh përmes llogarisë
          tënde në {APP_NAME}.
        </p>
        <p>
          Duhet të jesh të paktën 16 vjeç për të krijuar një llogari. Nëse je më
          i ri, përdor shërbimin vetëm me pëlqimin e prindit ose kujdestarit.
        </p>
        <p>
          Ne mund të pezullojmë një llogari që shkel këto kushte, abuzon me
          shërbimin ose përdoret për qëllime të paligjshme.
        </p>
      </LegalSection>

      <LegalSection title="3. Planet dhe pagesat">
        <p>
          Ekziston një plan falas dhe dy plane me pagesë:{" "}
          {paidPlans.map((plan) => `${plan.name} (${plan.priceLabel} ${plan.periodLabel})`).join(", ")}
          . Kufijtë e secilit plan zbatohen në server dhe rishikohen në çdo
          kërkesë.
        </p>
        <p>
          <strong className="text-content">
            Pagesat përpunohen nga {MERCHANT_OF_RECORD}, i cili vepron si
            tregtar i regjistruar (merchant of record).
          </strong>{" "}
          Kjo do të thotë që {MERCHANT_OF_RECORD} është pala që shet abonimin,
          mbledh pagesën dhe trajton faturat, taksat dhe rimbursimet. Kushtet e
          pagesës dhe të rimbursimit të {MERCHANT_OF_RECORD} zbatohen përveç
          këtyre kushteve.
        </p>
        <p>
          Abonimet rinovohen automatikisht në fund të çdo periudhe pagese, me të
          njëjtin çmim, derisa të anulohen. Anulimi ndalon rinovimin e
          ardhshëm; qasja mbetet e hapur deri në fund të periudhës së paguar.
          Anulimin mund ta bësh nga faqja e abonimit ose nga paneli i{" "}
          {MERCHANT_OF_RECORD}.
        </p>
        <p>
          Çmimet shfaqen në euro ose dollarë sipas planit. Taksa mund të shtohen
          në arkë sipas vendit tënd.
        </p>
      </LegalSection>

      <LegalSection title="4. Përdorimi i lejuar">
        <p>Nuk lejohet:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            ngarkimi i materialeve që nuk ke të drejtë t&apos;i përdorësh
            (përmbajtje me të drejta autori që nuk të takojnë, materiale të
            ndaluara, të dhëna personale të personave të tjerë);
          </li>
          <li>
            përpjekja për të anashkaluar kufijtë e planit, normat e kërkesave ose
            sigurinë e shërbimit;
          </li>
          <li>
            përdorimi i shërbimit për të krijuar përmbajtje të paligjshme,
            mashtruese ose të dëmshme;
          </li>
          <li>
            riprodhim, rishitje ose ekspozim automatik i shërbimit pa leje me
            shkrim.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Përmbajtja e përdoruesit">
        <p>
          Materialet që ngarkon mbeten të tuajat. Dokumenti origjinal nuk
          ruhet: ai lexohet brenda shfletuesit tënd dhe vetëm teksti i nxjerrë
          dërgohet për përpunim. Ruhen vetëm titulli dhe përmbajtja e gjeneruar
          (përmbledhja, kartat, pyetjet), të lidhura me llogarinë tënde.
        </p>
        <p>
          Duke ngarkuar një material, ti na jep leje ta përpunojmë atë vetëm për
          të krijuar përmbajtjen që kërkon. Nuk e përdorim përmbajtjen tënde për
          qëllime të tjera.
        </p>
      </LegalSection>

      <LegalSection title="6. Pronësia intelektuale">
        <p>
          Emri {APP_NAME}, dizajni dhe kodi i shërbimit mbeten pronë e
          operatorit. Përmbajtja që gjenerohet për materialin tënd mund të
          përdoret prej teje për studim personal.
        </p>
      </LegalSection>

      <LegalSection title="7. Nivelet e shërbimit dhe kufizimi i përgjegjësisë">
        <p>
          Shërbimi ofrohet &ldquo;si është&rdquo;. Përpiqemi ta mbajmë gjithmonë
          funksional, por nuk garantojmë që do të jetë i pandërprerë ose pa
          gabime. Gjenerimi varet nga shërbime të palëve të treta që mund të mos
          jenë të disponueshme përkohësisht.
        </p>
        <p>
          Në masën maksimale të lejuar nga ligji, nuk jemi përgjegjës për dëme të
          tërthorta ose të pasojave që vijnë nga përdorimi i shërbimit, duke
          përfshirë gabime në përmbajtjen e gjeneruar. Përgjegjësia jonë totale
          nuk e kalon shumën që ke paguar në dymbëdhjetë muajt e fundit.
        </p>
      </LegalSection>

      <LegalSection title="8. Ndryshimet dhe përfundimi">
        <p>
          Mund t&apos;i përditësojmë këto kushte; ndryshimet materiale
          njoftohen në shërbim. Mund ta ndalosh përdorimin në çdo moment dhe të
          kërkosh fshirjen e llogarisë. Ne mund ta ndalojmë shërbimin me
          njoftim paraprak.
        </p>
      </LegalSection>

      <LegalSection title="9. Zgjidhja e mosmarrëveshjeve">
        <p>
          Për çdo mosmarrëveshje, kontakto fillimisht në {SUPPORT_EMAIL} — shumica
          e problemeve zgjidhen aty. Për mosmarrëveshje rreth pagesave, drejtimi i
          parë është mbështetja e {MERCHANT_OF_RECORD}.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
