# Phase 2 — Mobile plan: API-first thin client

**Supersedes Phase 0's Decision 2 (monorepo engine-sharing).** The spike
([`01a-spike.md`](./01a-spike.md)) proved the cPanel/CloudLinux host can't run an npm
workspace, which made "share the engine *source* with a mobile app" the hard part. This
plan removes that problem entirely: **the engines stay on the server and are exposed over
a versioned REST API. The mobile app is a thin client that calls it.** Nothing from
`packages/core` ships to the phone in v1, so there is no package to publish, no submodule,
no vendored copy to keep in sync.

---

## 1. Clearing up "can React Native / Expo be hosted on cPanel?"

They aren't hosted anywhere — that's a category difference, not a limitation:

- **The Next.js app** is *server* software. It runs under Passenger on cPanel and answers
  HTTP requests. It already does.
- **A React Native / Expo app** is *client* software. It compiles to a native binary —
  `.apk`/`.aab` (Android), `.ipa` (iOS) — that you build with **EAS Build** (Expo's cloud
  builder) or locally, then install on a device or ship through the Play Store / App Store.
  There is no server process to host.

So the architecture is a clean split:

```
  ┌─────────────────────────────┐         HTTPS (Bearer token)        ┌──────────────────┐
  │  cPanel / Passenger          │  ◀───────────────────────────────▶ │  Mobile binary    │
  │  Next.js app (UNCHANGED host)│                                     │  (Expo / RN)      │
  │  • engines (packages/core)   │   GET /api/v1/dashboard             │  • screens        │
  │  • Prisma → Neon             │   POST /api/v1/income/debit         │  • fetch client   │
  │  • per-user AES-GCM decrypt  │   POST /api/v1/auth/login           │  • SecureStore    │
  └─────────────────────────────┘                                     └──────────────────┘
```

The same cPanel deployment that serves the web UI also serves `/api/v1/*`. **No new
hosting, no second server, no CORS story for the native client** (native `fetch` isn't
subject to browser CORS or our `connect-src 'self'` CSP — those only bind the web app).

---

## 2. Why this maps onto the existing code almost for free

Every read in [`src/server/queries.ts`](../../src/server/queries.ts) and every write in
`src/server/actions.ts` resolves the user through `requireUser()` →
[`getAuth()`](../../src/server/auth.ts). `getAuth` is the **only** thing tying a request to
the browser: today it reads the `cf_session` **cookie**. But a `Session` row is
transport-agnostic — it stores `tokenHash` + `encDek` (the DEK sealed with `SERVER_KEY`).

> **A mobile bearer token is just a session token carried in a header instead of a cookie.**

Teach `getAuth` to fall back to `Authorization: Bearer <token>` and every engine-backed
query works, unchanged, behind a REST endpoint — with the same per-user decryption and the
same "can never see another user's data" guarantee.

---

## 3. Auth: bearer tokens over the existing session model

### 3.1 Minimal changes to the server

1. **`getAuth` reads a bearer token as a fallback.** Cookie first (web), then
   `Authorization: Bearer` (mobile). Same `hashToken` lookup, same `openDekFromSession`,
   same expiry/`isActive` checks. One function, both transports.

   ```ts
   // src/server/auth.ts — inside getAuth(), after the cookie lookup misses:
   const bearer = (await headers()).get("authorization");
   const token = cookieToken ?? (bearer?.startsWith("Bearer ") ? bearer.slice(7) : null);
   ```

2. **`createSession` returns the token** instead of only setting the cookie. The web path
   keeps setting the cookie (thin wrapper); the mobile login endpoint takes the returned
   token and puts it in the JSON body. No new crypto — reuses `generateToken` / `hashToken`
   / `sealDekForSession` exactly as web login does today
   ([`auth-actions.ts:179`](../../src/server/auth-actions.ts#L179)).

3. **An API-flavoured guard** (`requireApiUser`) that returns `401`/`403` **JSON** instead
   of `requireUser`'s `redirect("/login")` — routes must not redirect. It calls the same
   `getAuth`; only the failure branch differs.

### 3.2 Login / logout endpoints

- `POST /api/v1/auth/login` `{ identifier, password }` → reuses the exact `loginUser`
  logic: lockout check → `verifyPassword` → `unwrapDek(password, …)` →
  `createSession(userId, dek)` → **returns `{ token, expiresAt, user }`** (no cookie).
- `POST /api/v1/auth/logout` (Bearer) → deletes the session row.
- `GET /api/v1/auth/me` (Bearer) → returns the `user` block; lets the app validate a stored
  token on launch.

### 3.3 Token lifetime — the one open decision

v1 default: **reuse the 7-day session** as the bearer (simplest, zero new schema; the app
re-logs-in weekly). If that's too short for a phone, the upgrade is **short-lived access +
rotating refresh token** (add a `refreshTokenHash` + rotation endpoint; enables remote
revoke). Not a blocker — ship the 7-day bearer, revisit if it chafes. *(This is the
question left open when we pivoted; parking it here rather than blocking the API work.)*

---

## 4. Serialization rules (the only real transformation layer)

The RSC path hands `Date` objects and raw numbers straight to components. JSON can't, so
each endpoint needs a thin DTO mapper. The rules are uniform and small:

- **Money stays integer minor units** as JSON numbers (`amountMinor`, `balanceMinor`, …).
  No floats, no formatting server-side.
- **Dates → ISO 8601 strings** (`date.toISOString()`); the client parses back.
- **No `Intl` on the server path.** The API returns `amountMinor` + `currency` code; the
  **mobile client formats** (`Intl.NumberFormat`, or a manual fallback if Hermes's Intl is
  thin — see open checks). This keeps the Hermes/Intl question a *client* concern, not an
  API blocker.
- **Codenames only where already codenamed** — the assistant endpoint keeps the MCP
  tokenisation (`ACCT_001`…); the data endpoints return the user's own decrypted data (it's
  their data, over their authenticated channel), same as the web UI shows.

A single `serialize()` helper (deep Date→ISO) covers most endpoints.

---

## 5. Endpoint surface (v1)

All under `/api/v1`, all Bearer-authed except login. Each read is a **direct call to an
existing query** — no engine logic is re-implemented.

| Method & path | Backed by (queries.ts / actions) | Notes |
|---|---|---|
| `POST /api/v1/auth/login` | `loginUser` core | returns `{ token, expiresAt, user }` |
| `POST /api/v1/auth/logout` | `destroySession` | |
| `GET /api/v1/auth/me` | `getAuth` | validate stored token on launch |
| `GET /api/v1/dashboard?horizonDays=90` | `getDashboard` | the big one — accounts, projection, timeline, salaryPeriod, obligations |
| `GET /api/v1/accounts` | `getAccountsWithBalances` | |
| `GET /api/v1/transactions?type&accountId&from&to&search` | `getTransactions` | capped at 500 as today |
| `GET /api/v1/obligations?horizonDays=90` | `getUpcomingObligations` | |
| `GET /api/v1/income/schedule` | `getRecurringIncomeSchedule` | the Debit table data |
| `GET /api/v1/notifications` | `getNotifications` | the bell feed |
| `GET /api/v1/pdcs?status&direction` | `getPdcs` | |
| `GET /api/v1/provisions` | `getProvisions` | |
| `GET /api/v1/budgets?month=YYYY-MM` | `getBudgets` | |
| `GET /api/v1/reports?monthsBack=6` | `getReportData` | |
| `GET /api/v1/categories` / `GET /api/v1/recurring` | `getCategories` / `getRecurringRules` | reference data |
| **Writes** | | |
| `POST /api/v1/income/debit` `{ occurrenceKey, amountMinor? }` | `debitRecurringOccurrence` | |
| `POST /api/v1/income/undo` `{ occurrenceKey }` | `undoRecurringOccurrence` | |
| `POST /api/v1/notifications/ack` `{ keys[] }` | `acknowledgeNotifications` | |
| `POST /api/v1/transactions` (create) | transaction-create action | v1.1 if we keep v1 read-mostly |
| `POST /api/v1/chat` (stream) | reuse existing `/api/chat` | already bearer-able once `getAuth` reads the header |

### 5.1 Writes need a small refactor

Server actions call `revalidatePath(...)` (a Next web concern) and are `"use server"`
functions. For the API, **extract each mutation's core** (the DB work) into a plain
function in `src/server/mutations/*` that both the server action *and* the API route call.
The action keeps its `revalidatePath`; the route just returns JSON. This avoids running
`revalidatePath` from a route handler and keeps one source of truth for the mutation.

### 5.2 Cross-cutting

- **Versioned** under `/api/v1` so the app can pin a contract; breaking changes go to `v2`.
- **Uniform error shape**: `{ error: string }` with proper status (`400/401/403/404/500`),
  matching the existing routes.
- **Rate-limit** login (reuse the `LoginAttempt` lockout that `loginUser` already applies).
- **The chat stream already works** — `/api/chat` returns a `ReadableStream` with
  `X-Accel-Buffering: no`. Once `getAuth` reads the bearer header it's mobile-ready; the
  only open item is confirming Passenger doesn't buffer it (carried below).

---

## 6. Mobile client stack

- **Expo (dev-client) + EAS Build.** Fastest path, cloud builds (no local Android SDK
  setup to fight), OTA JS updates, first-class `expo-secure-store` (Keychain/Keystore) for
  the bearer token, `expo-local-authentication` for biometric unlock. Hermes by default.
  Bare RN stays available if a native module ever forces it.
- **Token storage**: bearer in `expo-secure-store` (hardware-backed), never in
  AsyncStorage. Optional biometric gate before use.
- **Data layer**: a typed `fetch` wrapper that injects `Authorization: Bearer`, plus
  React Query for caching/retries. DTO types generated from / mirrored against the
  serializers in §4.
- **Offline** (Phase 0's "encrypted read-only cache"): **deferred past v1.** v1 is
  online-only — the app calls the API live. When we add offline, it caches the *already-
  decrypted* DTOs (server did the crypto) in encrypted storage; it never handles the DEK.
  This is the pay-off of server-side decryption: the phone never holds a key.

---

## 7. Build order

1. **Server, auth**: `getAuth` bearer fallback + `createSession` returns token +
   `requireApiUser` + `POST /api/v1/auth/login|logout` + `GET /me`. Ship behind the live
   host; test with `curl -H "Authorization: Bearer …"`.
2. **Server, reads**: `serialize()` helper + `GET /api/v1/dashboard` first (highest value),
   then accounts / transactions / obligations / income-schedule / notifications, then the
   rest of the table. Each is ~10 lines: authed guard → existing query → serialize.
3. **Server, writes**: extract mutation cores → `POST income/debit`, `income/undo`,
   `notifications/ack`.
4. **Mobile skeleton**: Expo app, login screen → token in SecureStore → dashboard screen
   off `GET /api/v1/dashboard`. Prove the round-trip end-to-end on a device.
5. **Mobile breadth**: remaining read screens, then the Debit action, then the assistant
   (streaming) if the Passenger check passes.
6. **Hardening**: token lifetime decision (§3.3), rate-limit review, error states.

Steps 1–3 are **all in this repo** and ship with the normal cPanel deploy — no new host,
no workspace, no engine packaging. Steps 4+ live in the mobile app (separate repo
recommended, since it deploys to app stores, not cPanel).

---

## 8. Open host/runtime checks (carried from the spike)

- **`/api/chat` streaming through Passenger** — confirm tokens arrive incrementally with
  `curl -N`; if buffered, `PassengerBufferResponse off` / nginx `proxy_buffering off`. Only
  gates the mobile *assistant*, not the data API.
- **`Intl.NumberFormat` (AED) on Hermes** — now a *client* concern (§4). If Hermes's Intl
  is thin, use a small manual minor-units formatter in the app. Doesn't touch the API.
- **HTTPS + valid cert on the cPanel domain** — mandatory before shipping bearer tokens
  over the wire (Android/iOS block cleartext by default anyway).
