# Phase 1a — De-risking spike: results & go/no-go

**Branch:** `mobile/phase-1a-spike` (nothing merged to `master`, nothing deployed).
**Scope run this turn:** steps 1–2 (per "report after step 2 before continuing").
Steps 3–5 are **not started**, awaiting your go/no-go.

## What the restructure did
- Repo is now an **npm-workspaces monorepo**: `apps/web` (the whole Next app, moved
  intact) + `packages/core` (the pure engines) + root workspace manager.
- `packages/core` (`@cashflow/core`) now owns the 8 pure modules — `money`, `domain`,
  `initials`, `card-cycle`, `salary-period`, `cashflow-timeline`, `projection`,
  `notifications` — plus their 6 Vitest suites. Only dependency: `date-fns`.
- The web app consumes them via **re-export shims** (`apps/web/src/lib/<engine>.ts` →
  `export * from "@cashflow/core/<engine>"`), so **every existing `@/lib/…` import keeps
  working with zero call-site churn.** (Shims are temporary; call sites can be pointed
  straight at `@cashflow/core` in a later pass.)
- `next.config.ts` gains `transpilePackages: ["@cashflow/core"]` (core ships as TS
  source; Next compiles it — no separate build step).
- `.gitignore` de-anchored so nested `node_modules/` and `.next/` are ignored.

---

## Note on each of the five

### 1. Extract `packages/core` → `next build --webpack` → Passenger smoke deploy
**Local half: DONE, green.** Verified on this branch:
- `npm install` at root links `@cashflow/core` and `@cashflow/web` as workspaces and
  **hoists all deps to root `node_modules`** (the exact condition we needed to test).
- `npm run build` → **`prisma generate` emits the client to the hoisted
  `node_modules/@prisma/client`**, then **`✓ Compiled successfully`** with the webpack
  builder. This is the single biggest risk (Prisma engine under hoisted `node_modules`)
  and it passes locally.
- `packages/core` typecheck clean; `apps/web` `tsc --noEmit` clean.
- Tests: **core 80 + web 18 = 98** (unchanged total), all pass, chained via `npm test`.
- The **relocated `server.js` boots** (`node apps/web/server.js` → "Cashflow ready") and
  serves the public route (HTTP 200), resolving `next` from the hoisted root
  `node_modules`.

**Remaining (YOUR action — I can't reach cPanel): the real Passenger smoke deploy.**
Runbook below. Caveat: the local build is on Windows/`native` engine; cPanel is
CloudLinux, so the `rhel-openssl-3.0.x` engine path is only proven by the deploy.
The schema already lists that `binaryTarget`, so `prisma generate` on the host should
place it.

> **UPDATE (2026-07-22) — cPanel/CloudLinux cannot use npm workspaces at all; the repo is
> now FLAT.** On the host, npm refuses any workspace tree — `npm install` at a workspace
> root installs nothing (`npm query .workspace` → `[]`, "No workspaces found!"), and it
> fails **even when a `workspaces` field merely exists in an ancestor** package.json above
> the app. So the monorepo `apps/web` nesting was abandoned.
>
> **Final layout (flat, cPanel-native):**
> - The **web app lives at the repo root** again (`src/`, `server.js`, `package.json`, …) —
>   exactly the single-app shape cPanel expects. There is **no `apps/` directory and no
>   `workspaces` field anywhere.**
> - The shared engines still live once in **`packages/core`**, but the web app consumes them
>   as a **vendored tarball**: `"@cashflow/core": "file:vendor/cashflow-core.tgz"` (a plain
>   `file:` dep — no symlinks, no workspace machinery). `packages/core` is otherwise inert
>   for the web build; it's the source for the tarball and for the future mobile app.
> - `npm run vendor:core` repacks `packages/core` → `vendor/cashflow-core.tgz` (commit it).
> - Verified locally in exactly the cPanel shape: clean `npm install` at the root populates
>   `node_modules/.bin/{prisma,next}`, `prisma generate` + `next build --webpack` compile,
>   98 tests pass (80 core + 18 web).

**Deploy runbook (cPanel / Passenger — flat single app):**
1. Put the repo at the cPanel app path (a fresh `git clone` of `main` is cleanest).
2. cPanel **Setup Node.js App**: **Application root = the repo root** (the folder that
   contains `server.js` and `package.json`), **startup file = `server.js`**.
3. Run **NPM Install** (or `npm install` in that folder): installs the web deps **and
   extracts `vendor/cashflow-core.tgz` into `node_modules/@cashflow/core`** — no workspaces.
   Confirm with `ls node_modules/.bin/prisma`. Then `npm run build`.
4. Ensure env vars are visible to the app (`DATABASE_URL`, `DIRECT_URL`, `SERVER_KEY`,
   `SESSION_SECRET`, `SMTP_*`, `APP_URL`, `GROQ_API_KEY`, `GROQ_MODEL`). `SERVER_KEY`
   **must be identical to production** or existing sessions/data can't be unsealed.
5. Restart; smoke-test: load `/`, log in, load `/dashboard`, run the assistant.
6. **When `packages/core` changes:** run `npm run vendor:core` locally, commit the updated
   `vendor/cashflow-core.tgz`, redeploy.

### 2. Does `/api/chat` streaming survive Passenger?
**Cannot verify from here — needs your production host.** What I can confirm: the route
returns a `ReadableStream` of raw UTF-8 text with `Cache-Control: no-store` and
`X-Accel-Buffering: no`, and app-level streaming is real (confirmed live in an earlier
session via `curl -N`). The open question is **proxy/Passenger buffering**, which is
independent of the app.

**Production test:**
```bash
curl -N -H "Cookie: cf_session=<your session token>" \
     -H "Content-Type: application/json" \
     -d '{"messages":[{"role":"user","content":"When is my next card payment due?"}]}' \
     https://<prod-host>/api/chat
```
Tokens must arrive **incrementally**. If the whole answer lands at once after a pause,
something is buffering.

**Knobs to check (Apache/Passenger on cPanel):**
- `PassengerBufferResponse off` — the key one; some builds buffer by default.
- `PassengerMaxRequestTime 0` — so a long multi-tool-round stream isn't cut.
- If nginx sits in front: `proxy_buffering off` (the `X-Accel-Buffering: no` header
  already hints this).

**If it can't be un-buffered:** serve the stream from a dedicated Node port that bypasses
the buffering layer, or switch `/api/chat` to SSE with periodic keep-alive frames.
**This gate only blocks the mobile *assistant* — the rest of v1 (reads, mutations, auth)
does not depend on it.**

### 3. `Intl.NumberFormat` on Hermes (AED) — NOT started (correctly, per the gate)
Plan when we resume: verify grouping / 2-decimal / `AED ` placement / RTL on the target
Hermes build; if absent or divergent, land a manual grouping fallback **inside
`packages/core/money.ts`** so web and mobile stay byte-identical. (`money.ts` and
`projection.ts`'s warning strings are the only `Intl` users.)

### 4. Bearer-aware `getAuth` + `POST /api/v1/auth/login` — NOT started (after the gate)
Plan: a `getAuth` that also reads `Authorization: Bearer <token>`; a login endpoint that
returns the raw session token (no `Set-Cookie`). Session sealing is transport-agnostic
and unchanged.

### 5. `GET /api/v1/dashboard` + `POST /api/v1/income/debit` — NOT started (after the gate)
Plan: thin JSON handlers wrapping the existing `getDashboard` / `debitRecurringOccurrence`
logic, as the copy-paste pattern for the rest of the v1 surface.

---

## Go / No-Go

**Recommendation: conditional GO to steps 3–5, pending your two production checks.**
- The build/hoisting risk (the thing most likely to invalidate the monorepo) is **green
  locally**, including Prisma generation into hoisted `node_modules` and the relocated
  `server.js` booting.
- The two things I physically can't run — the **cPanel smoke deploy** and the
  **production streaming test** — are yours. Run both from the branch.
  - If the **deploy** is green → step 1 fully cleared.
  - If **streaming** buffers and can't be fixed → proceed with steps 4–5 anyway (reads +
    mutations + auth don't need it) and treat the mobile assistant as a separate,
    later gate.

**Nothing is committed or deployed.** The branch is ready for you to build/deploy and
report back the two results, at which point we continue to steps 3–5.

## Pre-existing (not caused by the spike)
`npm run lint` surfaces issues in files the move didn't touch — `server.js` (`require()`
imports), `chat-widget.tsx` (`setState` in an effect), and stray unused-eslint-disable
directives in `scripts/`/`prisma/`. Confirmed pre-existing (`server.js` already uses
`require()` on `master`). Out of scope for this spike; worth a separate cleanup.
