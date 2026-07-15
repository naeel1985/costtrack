# Deploying to cPanel (Node.js / Passenger)

Your database is on **Neon** (remote), so cPanel only runs the Node app and
connects out to Neon over TLS. Neon is already migrated and seeded — you do **not**
set up any database on cPanel.

## What was added to the code for cPanel

- **`server.js`** — the Passenger startup file. cPanel runs this directly; it
  boots Next.js in production and listens on `process.env.PORT` (Passenger binds it).
- **`build: "prisma generate && next build"`** in `package.json` — the Prisma
  client is generated as part of the build (which runs in the app root, where the
  schema lives). Note: cPanel runs `npm install` in the venv lib folder that has
  no `prisma/` dir, so generation must **not** be a `postinstall` hook.
- **Prisma `binaryTargets`** now include a Linux engine (`rhel-openssl-3.0.x`, the
  usual CloudLinux/AlmaLinux target) plus `native`.

Nothing else changes — the app is the same.

## Steps

1. **Get the code onto the server** (cPanel → *Git Version Control*, or upload a
   zip). Do **not** upload `node_modules`, `.next`, `.env`, `dev-outbox/`, or
   `.pglite-data/` (all gitignored already).

2. **cPanel → Setup Node.js App → Create Application:**
   - **Node.js version:** 20 or 22
   - **Application mode:** Production
   - **Application root:** the folder you uploaded to (e.g. `apps/cashflow`)
   - **Application URL:** your domain or subdomain (must be **HTTPS** — see note)
   - **Application startup file:** `server.js`

3. **Add the environment variables** (see the list below) in the app's
   *Environment variables* section, then **Save**.

4. **Install dependencies:** click **Run NPM Install** (installs packages incl. the
   Prisma engines). This no longer generates the client — the build does.

5. **Build the app.** Enter the app (the panel shows *Run JS script* and a command
   like `source /home/USER/nodevenv/APP/NODE/bin/activate && cd ~/APP`), then run:
   ```bash
   npm run build      # runs `prisma generate` then `next build`
   ```
   If your plan has no terminal or the build runs out of memory, build locally
   (`npm run build`) and upload the generated **`.next`** folder alongside the code.

6. **Restart** the application (button in the Node.js App UI). Open your URL —
   it should redirect to `/login`.

## Environment variables to add in cPanel

**Required (runtime):**

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Neon **pooled** URL, ending with `&pgbouncer=true` (copy from your local `.env`) |
| `SERVER_KEY` | same base64 value as local `.env` (rotating it invalidates all sessions) |
| `SESSION_SECRET` | same base64 value as local `.env` |
| `APP_URL` | `https://your-domain.com` (used in verification-email links) |
| `NODE_ENV` | `production` |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_SECURE` | `true` |
| `SMTP_USER` | `eng.naeel.zuriek@gmail.com` |
| `SMTP_PASS` | your Gmail App Password |
| `MAIL_FROM` | `Cashflow <eng.naeel.zuriek@gmail.com>` |

**Optional:**

| Variable | When you need it |
| --- | --- |
| `LOGIN_MAX_ATTEMPTS` / `LOGIN_LOCKOUT_MINUTES` | tune login lockout (defaults 5 / 15) |
| `DIRECT_URL` | only if you run `prisma migrate deploy` **from** the server |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_EMAIL` | only if you run `npm run db:seed` from the server |

> Copy the exact `DATABASE_URL`, `SERVER_KEY`, and `SESSION_SECRET` **values from
> your local `.env`** — the encryption keys must match or existing encrypted data
> can't be read. Never commit `.env`; enter these in the cPanel UI.

## Notes & gotchas

- **HTTPS is required.** In production the session cookie is `Secure`, so it's only
  sent over HTTPS. Enable **AutoSSL** for the domain, or logins won't stick.
- **Neon is already set up.** No migration/seed needed on cPanel. (If you ever want
  to run them from the server, add `DIRECT_URL` + `ADMIN_*` and run
  `npx prisma migrate deploy` / `npm run db:seed`.)
- **Prisma engine error** (e.g. "…rhel-openssl-1.1.x…"): your host uses a different
  OpenSSL. Edit `binaryTargets` in `prisma/schema.prisma` to the reported target
  (e.g. `rhel-openssl-1.1.x` or `debian-openssl-3.0.x`), re-`npm install`, rebuild.
- **Dev dependencies for build:** `npm run build` needs the devDependencies
  (TypeScript, Tailwind). cPanel's *Run NPM Install* installs them by default; if
  you customized it to omit dev deps, build locally and upload `.next` instead.
- **Outbound network:** the server must reach Neon (`*.neon.tech:5432`) and Gmail
  (`smtp.gmail.com:465`). These are open on most cPanel hosts.
