# Seigem

Seigem kthen materialet e ngarkuara (PDF, Word, PowerPoint) në përmbledhje,
flashcards dhe kuize në shqip.

**Nuk ka faqe kryesore marketingu.** Aplikacioni është paneli: `/` ridrejton
automatikisht te `/dashboard`, dhe vizitorët e paidentifikuar kalojnë te
`/login`.

---

## Përmbajtja

- [Çfarë është Seigem](#çfarë-është-seigem)
- [Dizajni i panelit](#dizajni-i-panelit)
- [Stack](#stack)
- [Kërkesat](#kërkesat)
- [Instalimi lokal](#instalimi-lokal)
- [Variablat e mjedisit](#variablat-e-mjedisit)
- [Konfigurimi i Firebase](#konfigurimi-i-firebase)
- [Konfigurimi i DeepSeek](#konfigurimi-i-deepseek)
- [Konfigurimi i Whop](#konfigurimi-i-whop)
- [Zhvillimi lokal](#zhvillimi-lokal)
- [Testimi](#testimi)
- [Struktura e projektit](#struktura-e-projektit)
- [Arkitektura](#arkitektura)
- [Planet dhe kufijtë](#planet-dhe-kufijtë)
- [Privatësia](#privatësia)
- [Siguria](#siguria)
- [Deploy në produksion](#deploy-në-produksion)
- [Probleme të shpeshta](#probleme-të-shpeshta)
- [Statusi i projektit](#statusi-i-projektit)

---

## Çfarë është Seigem

Seigem është një aplikacion web që lejon studentët të ngarkojnë materiale
studimi dhe të marrin përmbajtje të gjeneruar automatikisht në shqip.

**Rrjedha kryesore:**

1. Ngarko **një ose më shumë** skedarë PDF, Word ose PowerPoint njëherësh.
2. Teksti nxirret **lokalisht në browser** — skedarët nuk ngarkohen askund.
3. Për secilin dokument gjenerohen **automatikisht** përmbledhja, flashcards dhe
   kuizi — pa pyetur gjë. Numri i parazgjedhur është 3 nga secili.
4. Serveri verifikon përdoruesin, kontrollon kufijtë e planit, dhe thërret
   DeepSeek.
5. Ruhen **vetëm** titulli dhe përmbajtja e gjeneruar.
6. Nëse dëshiron më shumë, butoni **"Gjenero më shumë"** shton materiale të reja.
7. Studio me leximin e përmbledhjes, flashcards interaktive dhe kuiz me pikë.

**Veçori kryesore:**

- Nxjerrja lokale e tekstit nga PDF, DOCX dhe PPTX — pa AI dhe pa ngarkim.
- Përmbledhje, flashcards dhe kuize në shqip, të strukturuara me JSON.
- Materialet e fundit në shiritin anësor, si te ChatGPT dhe DeepSeek.
- Tri plane: Falas, Plus dhe Pro, me kuota ditore të zbatuara në server.

---

## Dizajni i panelit

Të gjitha funksionet shfaqen në **një panel të vetëm**, pa faqe marketingu.

### Struktura

- **Shiriti anësor** — sipas modelit ChatGPT / DeepSeek:
  - logoja Seigem me nënshkrimin "Më shumë njohuri. Më shumë mundësi.",
  - butoni **"Material i ri"**, i cili pastron panelin dhe kthen te ngarkuesi,
  - lista **"Të fundit"** me materialet e ruajtura (kliko për t'i hapur),
  - **Plani** dhe **Cilësimet**, plus citati mbyllës.
- **Shiriti i sipërm** — njoftimet dhe menuja e llogarisë me "Shkëputu".
- **Rreshti i statistikave** — katër tregues plus karta e datës:

  | Treguesi | Burimi |
  | --- | --- |
  | Kufiri i sotëm | `dokumente të mbetura / kufiri ditor` |
  | Flashcards | Shuma e kartave në të gjitha materialet |
  | Pyetje kuizi | Shuma e pyetjeve në të gjitha materialet |
  | Studimi sot | Koha aktive e studimit, e matur nga serveri |

- **Ngarkuesi** — i vendosur nën statistikat; pranon disa skedarë njëherësh.
- **Panelet e punës** — Flashcards dhe Kuiz në një rresht, Përmbledhja nën to.

> **Materialet e ruajtura nuk listohen në panel.** Ato shfaqen vetëm në shiritin
> anësor, si te ChatGPT. Faqja `/materialet` mbetet për listën e plotë dhe
> fshirjen.

### Animacionet

Karta e flashcards **rrotullohet në 3D** kur trokitet, kështu që përgjigjja
shfaqet si një kthim fizik dhe jo si zëvendësim teksti. Karta e re hyn me një
kalim të lehtë. Të dyja çaktivizohen automatikisht për përdoruesit që kanë
zgjedhur "reduced motion".


### Tema

Paleta është **e errët**: sfond pothuajse i zi, karta pak më të çelëta me kufij
të dukshëm, dhe të njëjtat ngjyra theksi si dizajni referues — vjollcë, gjelbër,
portokalli dhe blu për treguesit, plus një blu e vetme për veprimet.

> **Shënim:** dokumenti master dhe dizajni i miratuar bien dakord për temën e
> errët. Të gjitha tokenat ndryshohen në një vend të vetëm
> (`src/app/globals.css`), kështu që kalimi në një paletë tjetër është
> ndryshim një skedari.

Kufizimet mbeten të respektuara dhe kontrollohen automatikisht nga testet:

- **Pa gradiente** — asnjë klasë `.bg-gradient-*`, `.from-*`, `.via-*` ose
  `.to-*` nuk emetohet në CSS.
- **Pa glassmorphism**, pa efekte neoni, pa forma dekorative.
- Ikona minimale dhe funksionale (set i vetëm inline, pa varësi të jashtme).
- Të gjitha ngjyrat vijnë nga tokenat; asnjë hex i shkruar në komponentë.
- Animacionet kufizohen te flashcards dhe respektojnë `prefers-reduced-motion`.

### Përgjegjshmëria

Shiriti anësor bëhet drawer në ekrane të vogla, rreshtat e kontrollit
mbështillen, dhe panelet kalojnë në një kolonë nën `xl`.

---

## Stack

| Shtresa | Teknologjia |
| --- | --- |
| Web app | Next.js 16 (App Router) + TypeScript |
| Stilizim | Tailwind CSS v4 |
| Autentikim | Firebase Authentication (Google Sign-In) |
| Baza e të dhënave | Cloud Firestore |
| AI | DeepSeek API (vetëm nga serveri) |
| Pagesat | Whop |
| Nxjerrja e dokumenteve | PDF.js, Mammoth, JSZip (në browser) |

---

## Kërkesat

- **Node.js** 20 ose më i ri
- **npm** 10 ose më i ri
- **Java 21+** — vetëm për emulatorin e Firestore gjatë testimit
- Një projekt **Firebase**
- Një çelës **DeepSeek API**
- Një llogari **Whop** me dy produkte

---

## Instalimi lokal

```bash
# 1. Klono repository-n
git clone <repository-url>
cd seigem

# 2. Instalo varësitë
npm install

# 3. Krijo skedarin e mjedisit lokal
cp .env.example .env.local

# 4. Plotëso vlerat në .env.local (shih seksionet më poshtë)

# 5. Nis serverin e zhvillimit
npm run dev
```

Aplikacioni hapet në [http://localhost:3000](http://localhost:3000).

> Java nuk kërkohet për zhvillim normal. Instaloje vetëm nëse do të ekzekutosh
> `npm run test:rules`:
> ```bash
> winget install --id Microsoft.OpenJDK.21   # Windows
> ```

### Komandat

```bash
npm run dev            # serveri i zhvillimit
npm run build          # build për produksion
npm start              # nis build-in e produksionit
npm run verify         # typecheck + lint (përdore para commit-it)
npm run test           # të gjitha testet
npm run test:unit      # testet pa emulator
npm run test:rules     # rregullat e Firestore (kërkon Java)
npm run fixtures       # rigjeneron skedarët testues
npm run emulators      # nis emulatorët Firestore + Auth
```

---

## Variablat e mjedisit

Të gjitha dokumentohen në detaje në `.env.example`. Ekzistojnë **18 variabla**.

### Publike (7) — të lexueshme nga kushdo

| Variabla | Statusi |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Kërkuar |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Kërkuar |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Kërkuar |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Kërkuar |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Kërkuar |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | **Opsional** — Cloud Storage nuk përdoret |
| `NEXT_PUBLIC_APP_URL` | Opsional (parazgjedhur `http://localhost:3000`) |

### Vetëm në server (11) — SEKRETE

| Variabla | Statusi |
| --- | --- |
| `FIREBASE_PROJECT_ID` | Kërkuar |
| `FIREBASE_CLIENT_EMAIL` | Kërkuar |
| `FIREBASE_PRIVATE_KEY` | Kërkuar (me `\n` të ruajtur) |
| `DEEPSEEK_API_KEY` | Kërkuar |
| `DEEPSEEK_BASE_URL` | Opsional |
| `DEEPSEEK_STANDARD_MODEL` | Opsional (parazgjedhur `deepseek-flash`) |
| `DEEPSEEK_PRO_MODEL` | Opsional (parazgjedhur `deepseek-v4-pro`) |
| `WHOP_API_KEY` | Kërkuar |
| `WHOP_WEBHOOK_SECRET` | Kërkuar |
| `WHOP_PLUS_PRODUCT_ID` | Kërkuar |
| `WHOP_PRO_PRODUCT_ID` | Kërkuar |

> **Mbrojtja:** `src/lib/env/server.ts` importon `server-only`. Nëse ndonjë
> komponent i klientit përpiqet ta importojë, **build-i dështohet** — kështu një
> gabim i pavëmendshëm nuk shndërrohet në rrjedhje sekreti.

### Pse `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` është opsional

Seigem nuk ngarkon skedarë: dokumentet përpunohen në browser. `storageBucket`
lexohet vetëm nga paketa `@firebase/storage`, të cilën Seigem nuk e importon.
Variabli mbetet sepse fragmenti i Firebase Console e përfshin atë.

---

## Konfigurimi i Firebase

### 1. Krijo projektin

1. Shko në [Firebase Console](https://console.firebase.google.com/).
2. **Add project** → ndiq hapat. Google Analytics nuk nevojitet.

### 2. Regjistro aplikacionin Web

**Project settings** → **Your apps** → ikona **Web** (`</>`), pastaj kopjo
vlerat në `.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=projekti-yt.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=projekti-yt
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
```

### 3. Aktivizo Google Sign-In

1. **Authentication** → **Sign-in method** → aktivizo **Google**.
2. **Authentication** → **Settings** → **Authorized domains**: shto `localhost`
   dhe domenin e produksionit.

### 4. Krijo Firestore

**Firestore Database** → **Create database** → **Production mode** → zgjidh
rajonin më të afërt (p.sh. `europe-west1`).

### 5. Ngarko rregullat e sigurisë

Rregullat janë në `firestore.rules` dhe **duhen ngarkuar** para produksionit:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

### 6. Krijo çelësin e Admin SDK

**Project settings** → **Service accounts** → **Generate new private key**.

```env
FIREBASE_PROJECT_ID=projekti-yt
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@projekti-yt.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
```

> **E rëndësishme:** Vendose çelësin brenda thonjëzave të dyfishta dhe **mbaj
> sekuencat `\n`** ashtu siç janë. Aplikacioni i kthen në rreshta të vërtetë
> automatikisht. Nëse kopjon çelësin në shumë rreshta, build-i dështon.

---

## Konfigurimi i DeepSeek

1. Krijo një llogari në [platform.deepseek.com](https://platform.deepseek.com/).
2. **API keys** → krijo një çelës të ri.
3. Shto kredite (DeepSeek faturohet sipas përdorimit).

```env
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_STANDARD_MODEL=deepseek-flash
DEEPSEEK_PRO_MODEL=deepseek-v4-pro
```

> **ID-të e modeleve u verifikuan** kundër
> [dokumentacionit zyrtar](https://api-docs.deepseek.com/quick_start/pricing).
> Emrat e vjetër `deepseek-chat` / `deepseek-reasoner` nuk janë më modelet
> aktuale.

### Zgjedhja e modelit

| Plan | Përmbledhje | Flashcards | Kuiz |
| --- | --- | --- | --- |
| Falas | `deepseek-flash` | `deepseek-flash` | `deepseek-flash` |
| Plus | `deepseek-flash` | `deepseek-flash` | `deepseek-flash` |
| Pro | `deepseek-flash` | `deepseek-flash` | **`deepseek-v4-pro`** |

Modeli i fuqishëm përdoret vetëm për Pro dhe vetëm për gjenerime ku arsyetimi
ndihmon vërtet (kuizet). Kontrolli lexon `usesProModel` nga konfigurimi i
planeve, kështu që një tabelë e konfiguruar gabimisht nuk jep akses aksidental.

### Trajtimi i përgjigjeve të dëmtuara

1. **Nxjerrja e JSON-it** provon: JSON të pastër → bllok kodi markdown → pjesa
   `{...}` më e jashtme.
2. Nëse nuk nxirret JSON, bëhet **një ripërpjekje** me një udhëzim korrigjues.
3. Nëse edhe ajo dështon, kthehet një gabim dhe **kuota kthehet**.

| Statusi | Riprovohet? |
| --- | --- |
| Gabim rrjeti, `429`, `500`, `503` | ✅ Po (2 herë, me pritje në rritje) |
| Përgjigjje bosh | ✅ Po |
| `401`, `402` (çelës/balancë) | ❌ Jo |
| `400` / `422` (kërkesë e pavlefshme) | ❌ Jo |

---

## Konfigurimi i Whop

1. Krijo një llogari në [whop.com](https://whop.com/) si shitës.
2. Krijo dy produkte: **Plus** (5.99€/muaj) dhe **Pro** (12.99€/muaj).
3. Kopjo **Product ID** për secilin.
4. Krijo një çelës API.
5. Konfiguro webhook-un:
   - URL: `https://domeni-yt.com/api/billing/webhook`
   - Ngjarjet: aktivizim, anulim, skadim dhe revokim
   - Kopjo **webhook secret** (formati `whsec_...`, base64)

```env
WHOP_API_KEY=...
WHOP_WEBHOOK_SECRET=whsec_...
WHOP_PLUS_PRODUCT_ID=prod_...
WHOP_PRO_PRODUCT_ID=prod_...
```

> **Siguri:** Vetëm një webhook i verifikuar nga Whop mund të ndryshojë planin.
> Kthimi nga checkout-i nuk aktivizon asgjë.

### Menaxhimi i gjendjeve

| Gjendja e Whop | Veprimi |
| --- | --- |
| `active`, `trialing` | Jep planin |
| `cancelled`, `expired`, `past_due`, `disputed` | Ktheu në Falas |
| Periudha ka skaduar | Ktheu në Falas, edhe nëse statusi është `active` |
| Anulim në fund të periudhës | Aksesi vazhdon deri në fund |
| Produkt i panjohur | **Nuk jep asgjë** |

### Testimi lokal i webhook-ut

```bash
ngrok http 3000
# Përdor URL-në e ngrok-ut si endpoint webhook në Whop.
```

---

## Zhvillimi lokal

### Rrjedha e punës

```bash
npm run dev          # nis serverin
npm run verify       # para çdo commit-i
npm run test         # para çdo push-i
```

### Konventat

- **Përmbajtja për klientin** shkruhet në **shqip**.
- **Emrat e kodit dhe komentet** mbeten në **anglisht**.
- **Pa gradiente, pa efekte neoni, pa glassmorphism**, pa animacione komplekse.
- Të gjithë numrat e planeve jetojnë vetëm në `src/config/plans.ts`.

### Tipet

TypeScript është konfiguruar me masë të plotë stricte:

| Flamuri | Çfarë parandalon |
| --- | --- |
| `strict` | Kontrollin bazë të tipeve |
| `noUncheckedIndexedAccess` | Qasje në indeks që mund të jetë `undefined` |
| `noImplicitReturns` | Funksione ku jo të gjitha rrugët kthejnë vlerë |
| `exactOptionalPropertyTypes` | Diferencimin mes `undefined` dhe mungesës |
| `noImplicitOverride` | Mungesën e `override` |
| `noFallthroughCasesInSwitch` | Rëniet në `switch` |
| `verbatimModuleSyntax` | Importet e tipeve në bundle |

---

## Testimi

```bash
npm run test           # 500 teste
npm run test:unit      # 442 teste (pa emulator)
npm run test:rules     # 58 teste kundër emulatorit Firestore
```

### Mbulimi sipas fushës

| Suite | Teste | Çfarë verifikon |
| --- | --- | --- |
| `test:rules` | 58 | Izolimi mes përdoruesve, refuzimi i përmbajtjes, planet |
| `test:render` | 60 | Renderimi, pa stil të ndaluar, pa XSS |
| `test:security` | 48 | Validation, MIME, rate limiting, sanitizimi |
| `test:plans` | 42 | Katalogu, metering, kufijtë |
| `test:billing-state` | 37 | Aktivizim, anulim, skadim, revokim |
| `test:quota` | 34 | Aritmetika e kuotave, kufiri i ditës |
| `test:generate` | 33 | Validimi i kërkesave dhe përgjigjeve |
| `test:ai` | 30 | Promptet shqip, nxjerrja e JSON |
| `test:dashboard` | 29 | Paneli i ri: statistikat, panelet, tema |
| `test:study` | 29 | Pikët e kuizit, interpretimi i tekstit |
| `test:history` | 25 | Konteksti, bashkimi, dublikatat |
| `test:deepseek` | 23 | Kërkesa, ripërpjekje, gabime |
| `test:billing` | 21 | Nënshkrimi, manipulimi, ripërdorimi |
| `test:extract` | 18 | PDF, DOCX, PPTX me skedarë realë |
| `test:uploader` | 13 | Gjendjet e ngarkuesit |

### Testet e nënshkrimit janë kundërshtare

Testet e webhook-ut provojnë që këto refuzohen: trupi i modifikuar, nënshkrimi i
falsifikuar, sekreti i gabuar, versioni `v1` i hequr, dhe webhook-u i vjetër.

### Skedarët e testimit

`npm run fixtures` rigjeneron skedarë **të vërtetë**: një PDF me operatorë
teksti, një `.docx` OOXML të vlefshëm, një `.pptx` ku rendi i slides ndryshon
nga rendi i emrave, një PDF pa tekst, dhe një `.docx` bosh.

---

## Struktura e projektit

```
src/
  app/                    Next.js App Router
    (auth)/login/         Hyrja me Google
    (dashboard)/          Faqet e mbrojtura (shirit anësor + shirit i sipërm)
      dashboard/          Paneli i vetëm kryesor
      materialet/         "Materialet e mia"
      studim/             Përvoja e studimit
      cmimet/             Faqja e çmimeve
      cilesimet/          Cilësimet e llogarisë
    api/
      auth/profile/       Krijimi i profilit
      generate/           Gjenerimi (i mbrojtur)
      study-sets/         Historiku dhe rigjenerimi
      study-time/         Koha e studimit
      billing/            Checkout dhe webhook

  components/
    ui/                   Primitivë (Button, Card, Alert, Icons)
    auth/                 AuthProvider, RequireAuth
    documents/            Ngarkuesi, opsionet, rrjedha
    dashboard/            Shiriti anësor (të fundit), shiriti i sipërm,
                          statistikat, panelet (flashcards, kuiz, përmbledhje)
    study/                Përmbledhja, flashcards (flip 3D), kuizi, use-deck

  services/               Ana e klientit
    document/             Nxjerrja lokale: PDF, DOCX, PPTX
    generation/           Thirrjet te /api/generate
    history/              Historiku dhe rigjenerimi
    study-time/           Raportimi i kohës së studimit

  server/                 VETËM SERVER
    ai/                   DeepSeek, promptet, validimi
    billing/              Webhook, abonimet
    firebase/             Admin SDK
    http/                 Auth, gabimet, rate limiting
    services/             Përdoruesit, study sets, kuotat, koha e studimit

  lib/                    Utility izomorfike
    env/                  public.ts dhe server.ts
    firebase/             Web SDK, koleksionet, skema
    utils/                Teksti, datat shqip, shfaqja
    billing.ts            Logjika e abonimeve (e pastër)
    quota.ts              Aritmetika e kuotave (e pastër)
    plan-limits.ts        Rregullat e metering (e pastër)
    regeneration.ts       Konteksti i rigjenerimit (e pastër)
    quiz.ts               Pikët e kuizit (e pastër)
    merge.ts              Shmangia e dublikatave (e pastër)

  config/                 plans.ts, app.ts

tests/                    500 teste
firestore.rules           Rregullat e produksionit
firestore.indexes.json    Indekset e përbëra
```

---

## Arkitektura

### Pse logjika e pastër është e ndarë

Modulet si `lib/quota.ts`, `lib/billing.ts` dhe `lib/quiz.ts` nuk importojnë
`server-only` as Firebase. Kjo lejon që të testohen direkt, dhe siguron që
aritmetika e kuotave dhe e pikëve të ketë **një implementim të vetëm** — të
përdorur nga serveri dhe nga UI-ja.

### Zbatimi i kuotave

```
Klienti  →  kontroll informativ (vetëm UX)
Serveri  →  transaksion Firestore (autoritativ)
```

Të gjitha metrikat validohen përpara se të konsumohet ndonjë: një kërkesë që
tejkalon kuotën refuzohet **e plotë**. Nëse gjenerimi dështon, kuota kthehet.

### Rrjedha e gjenerimit

1. Validimi i kërkesës (para çdo shpenzimi).
2. Konsumimi atomik i kuotës.
3. Thirrja e DeepSeek me prompte shqip dhe JSON mode.
4. Validimi i përgjigjjes — një përgjigjje e keqformuar **nuk ruhet kurrë**.
5. Ruajtja e titullit dhe përmbajtjes vetëm.
6. Kthimi i kuotës nëse dështon.

### Pse disa gjëra janë "të pastra"

Logjika që nuk varet nga React ose Firebase jeton në `lib/`:

| Moduli | Përgjegjësia |
| --- | --- |
| `quota.ts` | Sa njësi kanë mbetur, a lejohet një kërkesë |
| `plan-limits.ts` | Sa konsumon çdo lloj gjenerimi |
| `billing.ts` | Çfarë do të thotë një gjendje abonimi |
| `regeneration.ts` | A mjafton përmbajtja e ruajtur |
| `quiz.ts` | Pikët dhe përparimi i kuizit |
| `merge.ts` | Shmangia e dublikatave |

---

## Planet dhe kufijtë

| Plan | Çmimi | Dokumente / ditë | Flashcards / ditë | Pyetje kuizi / ditë |
| --- | --- | --- | --- | --- |
| **Falas** | 0€ | 2 | 3 | 3 |
| **Plus** | 5.99€ | 50 | 50 | 50 |
| **Pro** | 12.99€ | 200 | 200 | 200 |

**Çfarë konsumon çdo kërkesë:**

| Metrika | Konsumon |
| --- | --- |
| Dokumente | 1 njësi për çdo dokument të përpunuar |
| Flashcards | **N njësi për N flashcards** |
| Pyetje kuizi | **N njësi për N pyetje** |
| Përmbledhje | **Asnjë njësi e veçantë** |

Të gjithë numrat jetojnë vetëm në `src/config/plans.ts`. Një test verifikon
automatikisht që ato nuk përsëriten askund tjetër.

**Mbrojtja nga vlera të manipuluara:**

| Vlera e dërguar | Sjellja |
| --- | --- |
| `flashcards: 9999` | Kufizohet në 8 |
| `flashcards: -100` | Injorohet (nuk jep kuotë falas) |
| `uploads: -5` | Kufizohet në 0 |
| `plan: "pro"` | **Injorohet** — plani lexohet nga serveri |

Mesazhet e kuotës ndjekin formën e kërkuar:

> Të kanë mbetur 2 pyetje kuizi për sot.

---

## Privatësia

### Çfarë NUK ruhet kurrë

- skedarët e ngarkuar (PDF, Word, PowerPoint)
- teksti i plotë i nxjerrë nga dokumenti
- faqet, paragrafët ose XML-i i slides
- çdo ngarkesë binare ose base64

**Kontrata zbatohet në tre shtresa:**

1. Nxjerrja ndodh në browser; skedari nuk dërgohet askund.
2. `firestore.rules` refuzon emrat e fushave të ndaluara (`rawText`, `pages`,
   `slideXml`, `fileData`, etj.).
3. `src/lib/firebase/schema.ts` validon përpara çdo shkrimi.

### Çfarë ruhet

Vetëm titulli dhe përmbajtja e gjeneruar, plus metadata operative (uid, vulat
kohore, emri i modelit). Numëruesit e kuotave janë fusha të veçanta operative,
jo përmbajtje dokumenti.

### Teksti i përkohshëm

Teksti i nxjerrë mbahet vetëm në gjendjen e komponentit dhe lirohet sapo
gjenerimi përfundon. Kur rigjenerohet duke ri-ngarkuar dokumentin, teksti
përdoret vetëm për atë kërkesë dhe nuk ruhet.

### Historiku

Historiku shfaq **vetëm** përmbajtjen e ruajtur. Dokumenti origjinal nuk
shfaqet dhe nuk ofrohet asnjë lidhje shkarkimi, sepse nuk është ruajtur kurrë.

---

## Siguria

### Autentikimi

- Google Sign-In përmes Firebase; fjalëkalimet **nuk ruhen kurrë**.
- Çdo endpoint i mbrojtur verifikon token-in kriptografikisht
  (`verifyIdToken(token, true)`), që refuzon edhe sesionet e revokuara.
- `uid` merret **gjithmonë** nga token-i, kurrë nga trupi i kërkesës.

### Webhook-u i Whop

Verifikimi përdor specifikimin
[Standard Webhooks](https://docs.whop.com/developer/guides/webhooks) përmes
paketës zyrtare `standardwebhooks`:

```
përmbajtja = `${webhook-id}.${webhook-timestamp}.${trupi i papërpunuar}`
nënshkrimi = base64(HMAC_SHA256(sekreti, përmbajtja))
```

Paketa siguron **krahasim konstant në kohë** (një krahasim i zakonshëm do të
rrjedhte nënshkrimin përmes kohës) dhe **tolerancë 5-minutëshe** (pa të, një
webhook i kapur mund të ripërdorej).

### Rate limiting

| Bucket | Kufiri |
| --- | --- |
| Gjenerimi | 10 / minutë |
| Rigjenerimi | 10 / minutë |
| Historiku | 60 / minutë |
| Checkout | 5 / minutë |

Rate limiting është **mbrojtje nga abuzimi**, jo kufiri real: kufiri real janë
kuotat ditore të planit, të zbatuara në transaksione Firestore që mbijetojnë një
restart.

### Validimi i skedarëve

1. Madhësia (25 MB) dhe jo-bosh.
2. Shtesa (`.pdf`, `.docx`, `.pptx`).
3. Lloji MIME — refuzohet vetëm një lloj që **kundërshton** shtesën; llojet
   gjenerike (`application/octet-stream`) dhe bosh lejohen, sepse browser-at
   raportojnë në mënyrë të paqëndrueshme për dokumentet Office.
4. Kufiri i tekstit të nxjerrë (60,000 karaktere).

### Sanitizimi

- Filenames dhe titujt kalojnë nëpër `normalizeTitle`: hiqen karakteret e
  kontrollit, bashkohen hapësirat, kufizohet gjatësia.
- **Asnjë `dangerouslySetInnerHTML`.** Përmbajtja e modelit shfaqet si tekst;
  një test verifikon që `<script>` shfaqet i shpëtuar.
- Emrat e skedarëve nuk përdoren kurrë si rrugë.

### Sekretet

- Të gjitha sekretet lexohen vetëm nga `serverEnv`.
- Testet verifikojnë që asnjë modul klienti nuk referon një sekret.
- Përgjigjet e gabimeve nuk përmbajnë stack trace, rrugë skedarësh, apo tekste
  të ofruesit.

### Rregullat e Firestore

- **Refuzo si parazgjedhje** — `match /{document=**}` bllokon çdo gjë tjetër.
- **Izolim pronësie** — `list` dhe `get` të dyja kërkojnë `ownerUid`.
- **Planet zotërohen nga serveri** — klienti lexon `plan` dhe `usage`, por
  nuk mund t'i ndryshojë.

> **Zbulim i rëndësishëm:** `list` është një leje **e ndryshme** nga `get`.
> Dhënia e `list` pa kontroll pronësie krijonte një rrjedhje reale: një pyetës i
> pafiltruar kthente dokumentin e një përdoruesi tjetër në tërësi. Regresioni
> mbrohet nga një test i dedikuar.

---

## Deploy në produksion

### Para deploy-it

- [ ] Të gjitha 18 variablat e mjedisit janë vendosur në platformë
- [ ] `npm run verify` kalon
- [ ] `npm run test` kalon
- [ ] `firebase deploy --only firestore:rules,firestore:indexes` është ekzekutuar
- [ ] Domeni i produksionit është shtuar në **Authorized domains**
- [ ] `NEXT_PUBLIC_APP_URL` tregon domenin e produksionit
- [ ] Webhook-u i Whop tregon te `/api/billing/webhook`
- [ ] `.env.local` **nuk** është commit-uar

### Vercel (rekomanduar)

1. Lidh repository-n.
2. Shto variablat e mjedisit në **Settings → Environment Variables**.
3. Deploy.

> `FIREBASE_PRIVATE_KEY` duhet të ruajë `\n` ashtu siç është.

### Pas deploy-it

1. Testo hyrjen me Google.
2. Ngarko një PDF dhe verifiko gjenerimin.
3. Verifiko që një `users/{uid}` dokument krijohet me `plan: "free"`.
4. Testo webhook-un e Whop me një pagesë provë.

### Rate limiting në shumë instanca

Limiteri është **në memorie**, pra për-instancë. Kjo është e mjaftueshme për
mbrojtje nga shpërthimet. Një kufi i shpërndarë do të kërkonte Redis ose
Firestore — por kufiri real (kuotat ditore) është tashmë i përbashkët.

---

## Probleme të shpeshta

| Problemi | Shkaku dhe zgjidhja |
| --- | --- |
| `Missing required environment variable` | Plotëso `.env.local` dhe **rinis** serverin |
| `Failed to parse private key` | `FIREBASE_PRIVATE_KEY` duhet të jetë në një rresht me `\n` |
| `'server-only' cannot be imported` | Një komponent klienti importon kod serveri; ndaj kodin |
| Build-i dështon me `REPLACE_ME` | Vlerat e `.env.local` janë ende placeholder |
| Webhook kthen 500 | `WHOP_WEBHOOK_SECRET` nuk është base64 i vlefshëm |
| Emulatori nuk niset | Java 21+ mungon (`winget install Microsoft.OpenJDK.21`) |
| PDF pa tekst | PDF i skanuar; OCR nuk mbështetet |

---

## Statusi i projektit

**Të përfunduara:** 15 nga 15 detyrat, plus rishikimi i dizajnit.

> **Rishikimi i dizajnit (pas Task 15):** paneli u rindërtua sipas dizajnit të
> miratuar — **temë e errët**, shirit anësor me listën "Të fundit" sipas modelit
> ChatGPT, statistikat dhe panelet, plus animacion 3D te flashcards. Faqja
> kryesore e marketingut u hoq; `/` ridrejton te `/dashboard`. Ngarkimi tani
> pranon **disa skedarë** dhe gjeneron automatikisht përmbledhjen, flashcards dhe
> kuizin pa pyetur, me butonin "Gjenero më shumë" për materiale shtesë. Shtuar:
> koha e studimit, metadata e formatit të burimit dhe faqja e cilësimeve.

| # | Detyra | Statusi |
| --- | --- | --- |
| 1 | Inicializimi i projektit | ✅ |
| 2 | Struktura dhe konfigurimi | ✅ |
| 3 | Variablat e mjedisit | ✅ |
| 4 | Autentikimi | ✅ |
| 5 | Arkitektura e Firestore | ✅ |
| 6 | Nxjerrja lokale e tekstit | ✅ |
| 7 | Paneli kryesor | ✅ |
| 8 | Rrjedha e gjenerimit | ✅ |
| 9 | Integrimi me DeepSeek | ✅ |
| 10 | Planet Falas/Plus/Pro | ✅ |
| 11 | Numëruesit ditorë | ✅ |
| 12 | Faturimi me Whop | ✅ |
| 13 | Historiku dhe rigjenerimi | ✅ |
| 14 | Përvoja e studimit | ✅ |
| 15 | Siguria dhe gatishmëria | ✅ |

### Çfarë mbetet për të verifikuar

Këto kërkojnë kredenciale reale dhe **nuk janë testuar**:

- Hyrja e vërtetë me Google nga fillimi në fund.
- Një thirrje reale ndaj DeepSeek (pa çelës API në mjedisin e zhvillimit).
- Një transaksion real i Whop (checkout → webhook → aktivizim).
- Testimi manual i ndërveprimit në browser (drag-and-drop, trokitje).

---

## Licenca

Pronar privat. Të gjitha të drejtat e rezervuara.
