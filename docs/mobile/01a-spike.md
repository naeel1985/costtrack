# Phase 1a — De-risking spike: results

**Status: complete.** The spike is what surfaced the one architectural constraint that
reshapes the whole mobile effort, so it did its job. This is the clean, final record;
the running blow-by-blow has been collapsed into the outcome. The revised plan that
follows from it is in [`02-mobile-plan.md`](./02-mobile-plan.md).

## TL;DR

- **The build/engine-extraction works.** The pure engines were extracted into
  `packages/core` and the app builds and passes 98 tests on top of them.
- **The headline finding: the cPanel/CloudLinux host cannot run an npm monorepo.** Its
  Node Selector npm rejects workspaces outright and mis-resolves `file:` dependencies.
  Every workspace-based sharing mechanism failed on the host; only a **flat single-app
  repo with the engines imported as plain in-project source** deploys.
- **Consequence for mobile:** engine-sharing between web and mobile **cannot** use an npm
  workspace. It must use a host-neutral mechanism (a published package, a git dependency,
  or a copy). This is the main input to the new plan.

## What was tested vs. what we found

| # | Spike step | Result |
|---|---|---|
| 1 | Extract `packages/core`, build, deploy on Passenger | Extraction + `next build --webpack` ✅ locally and on the host. **Monorepo/workspaces ❌ on cPanel** — see below. Final flat layout deploys. |
| 2 | Does `/api/chat` streaming survive Passenger? | App-level streaming is real (`ReadableStream`, verified via `curl -N`). **Production proxy-buffering check still pending** on the host. Only gates the mobile *assistant*. |
| 3 | `Intl.NumberFormat` (AED) on Hermes | **Not yet verified** on a device. Only `money.ts` + `projection.ts` warning strings use `Intl`; fallback is a small manual formatter if needed. Carried into the mobile plan. |
| 4 | Bearer-aware `getAuth` + `POST /api/v1/auth/login` | **Not built.** Design stands (session sealing is transport-agnostic). Moved into the mobile plan. |
| 5 | `GET /api/v1/dashboard` + `POST /api/v1/income/debit` | **Not built.** Moved into the mobile plan as the endpoint pattern. |

## The cPanel constraint, precisely

CloudLinux's Node Selector symlinks `node_modules` into a per-app "nodevenv" and runs npm
with `--prefix /home/<user>/nodevenv/<app>/22/lib`. In that environment:

1. **npm workspaces do not work** — `npm install` at a workspace root installs nothing
   (`npm query .workspace` → `[]`, "No workspaces found!"), and it errors **even when a
   `workspaces` field only exists in an ancestor** package.json above the app.
2. **The host force-enters workspace mode** from a source higher-priority than a project
   `.npmrc` (an env var / a stale `package.json` at the `--prefix`), so `workspaces=false`
   in a file is ignored — only the CLI flag **`npm install --no-workspaces`** overrides it.
3. **`file:` dependencies mis-resolve** — a `file:vendor/x.tgz` dep is looked up relative
   to the nodevenv `--prefix`, not the repo, and fails `ENOENT`. So vendored tarballs and
   `file:` links are out too.

Sequence of approaches tried, each killed by the above: monorepo with hoisting → standalone
`apps/web` workspace → drop `apps/*` from workspaces → remove the `workspaces` field
entirely → vendored `file:` tarball → **(final)** no npm package at all.

## Final web architecture (shipped to `main`)

- **Flat single-app repo.** The Next app is at the repo root (`src/`, `server.js`,
  `package.json`, `prisma/`). **No `apps/`, no `workspaces`, no `@cashflow/core` npm
  package, no `file:` dep, no `transpilePackages`.**
- **Engines shared as in-project source.** They live once in **`packages/core/src`**; the
  app imports them through the existing `src/lib/<engine>.ts` shims, which now do
  `export * from "../../packages/core/src/<engine>"`. Next compiles them like any project
  file. `packages/core` keeps its own `package.json`/tests so the engines stay testable
  standalone and can be shared with mobile later.
- **The app's type-check excludes `packages/core`'s dev tooling** (`**/vitest.config.ts`),
  which would otherwise fail on the host where `vitest` isn't installed.
- Verified locally (incl. with `packages/core/node_modules` deleted, to mimic the host):
  clean `npm install`, `prisma generate` + `next build --webpack` compile, type-check
  clean, **98 tests** (80 core + 18 web).

## Deploy runbook (cPanel / Passenger — flat single app)

1. Repo at the cPanel app path (fresh `git clone` of `main` is cleanest).
2. **Setup Node.js App**: **Application root = repo root** (the folder with `server.js`),
   **startup file = `server.js`**, mode Production.
3. Install in the terminal with **`npm install --no-workspaces`**, then `npm run build`.
   Confirm `ls node_modules/.bin/prisma` first.
   - *To make the "Run NPM Install" button work without the flag:* the host's forced
     workspace setting must be cleared at its source — easiest is to **destroy the app +
     its nodevenv and recreate** against this (now permanently flat) repo.
4. Set env vars (`DATABASE_URL`, `DIRECT_URL`, `SERVER_KEY`, `SESSION_SECRET`, `SMTP_*`,
   `APP_URL`, `GROQ_API_KEY`, `GROQ_MODEL`). **`SERVER_KEY` must equal production's** or
   encrypted data can't be unsealed.
5. Start; smoke-test: `/`, log in, `/dashboard`, the assistant.

## Still-open host checks (do once, when convenient)
- **`/api/chat` streaming through Passenger** — `curl -N` the endpoint; confirm tokens
  arrive incrementally. If buffered: `PassengerBufferResponse off`, `PassengerMaxRequestTime 0`
  (nginx: `proxy_buffering off`). Only affects the assistant.
- **Pre-existing lint debt** (not caused by this work): `server.js` `require()` imports,
  `chat-widget.tsx` setState-in-effect, stray unused eslint-disable directives. Worth a
  separate cleanup pass.

## What this means for the mobile plan
The clean win: the engines are already isolated in `packages/core` with no Node/Prisma/
Intl-hostile dependencies. The constraint: **do not reach for an npm workspace to share
them** — the host won't have it. The revised plan picks a host-neutral sharing mechanism
and drops the monorepo assumption from Phase 0's Decision 2. See
[`02-mobile-plan.md`](./02-mobile-plan.md).
