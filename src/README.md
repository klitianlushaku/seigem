# Seigem — folder architecture

This document explains what belongs in each folder. Following it keeps server
secrets out of the client bundle and keeps Firestore access patterns consistent.

```
src/
  app/                    Next.js App Router: routes, layouts, API handlers
    (auth)/               Route group: authentication pages (Task 4)
    (dashboard)/          Route group: protected dashboard pages (Task 7)
      dashboard/          Main screen after login
      materialet/         "Materialet e mia" — saved study sets (Task 13)
      studim/             Study experience: summary, flashcards, quiz (Task 14)
    api/                  Route handlers (server-only)
      auth/               Session / profile bootstrap
      generate/           Protected AI generation endpoint (Tasks 8-9)
      billing/            Whop checkout + webhook endpoints (Task 12)
    layout.tsx            Root layout
    page.tsx              Public landing page
    globals.css           Theme tokens and global styles

  components/             Reusable React components
    ui/                   Generic primitives (Button, Card, Input, Alert)
    auth/                 Authentication components
    dashboard/            Dashboard-specific components
    documents/            Uploader, drag-and-drop, extraction states
    study/                Summary renderer, flashcard deck, quiz runner
    billing/              Pricing table and plan cards

  services/               Client-side integrations (browser)
    document/             Local text extraction — PDF, DOCX, PPTX (Task 6)
    generation/           Thin client wrappers that call /api/generate
    billing/              Client-side checkout initiation

  server/                 SERVER-ONLY. Never imported from a Client Component.
    ai/                   DeepSeek client, Albanian prompts, JSON validation
    firebase/             Firebase Admin SDK initialization
    services/             Study-set persistence, usage counters
    billing/              Whop API client and webhook verification
    http/                 Shared request/response helpers and auth guards

  lib/                    Isomorphic utilities (safe on both client and server)
    env/                  public.ts (browser-safe) and server.ts (server-only)
    firebase/             Firebase Web SDK init, collection/field names
    utils/                Formatting, validation, text normalization

  config/                 Centralized configuration
    app.ts                App-wide constants (limits, accepted formats)
    plans.ts              Plan pricing and daily quotas — single source of truth

  types/                  Shared TypeScript domain types

firestore.rules           Firestore security rules (Task 5)
firestore.indexes.json    Composite index definitions
```

## Rules

1. **`server/` and `lib/env/server.ts` are server-only.** Both start with
   `import "server-only"`, so importing them from a Client Component fails at
   build time instead of leaking a secret.
2. **Plan numbers live only in `config/plans.ts`.** Never repeat a quota value.
3. **Uploaded files are parsed in the browser** (`services/document/`) and never
   uploaded. Only extracted text is sent to `/api/generate`.
4. **Only titles and generated content are persisted.** Never file bytes,
   extracted text, pages, paragraphs, or slide XML.
5. **`config/` and `types/`** are dependency-free and importable anywhere.
