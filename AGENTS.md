# AGENTS.md

## Cursor Cloud specific instructions

### What this is
Single-product app: **Kibritçi İnşaat ERP** — a Turkish construction-company ERP. It is a React 19 + Vite 6 SPA served together with an Express API by **one** Node process. There is no separate frontend/backend server.

### Running / building / testing (standard commands live in `package.json` `scripts`)
- Dev: `npm run dev` → `tsx server.ts` starts Express on `http://localhost:3000` with Vite in middleware mode. This one process serves both the SPA and `/api/*`. Do **not** run a separate Vite server.
- Lint/typecheck: `npm run lint` (this is `tsc --noEmit`; there is no ESLint).
- Build (production bundle): `npm run build`; `npm start` runs the built server.
- Node 22 is required (`.node-version`, `engines: >=20 <=22`). Package manager is npm (`package-lock.json`).

### Firebase points at LIVE production — be careful with writes
- The client Firebase config is bundled in `firebase-applet-config.json` and targets the **live production** project `kibritci-erp`. In dev, the app reads and writes **real company data** in Firestore/Auth unless you override `VITE_FIREBASE_*` in `.env.local`.
- Prefer read-only actions when testing. If you must create test data, clean it up. Test users can be removed by signing in as them (client SDK) and deleting `kullanicilar/{email}` (+ `portalKullanicilar/{email}` if present) then `deleteUser(currentUser)` — an unclaimed email user has write/delete rights per `firestore.rules`.

### Login gotchas (non-obvious)
- Founder emails (`santiye@kibritci.com`, `sametatak9@gmail.com`) require `FIREBASE_SERVICE_ACCOUNT_JSON`; without it, login fails with a "server configuration missing" error (it calls `/api/auth/founder-bootstrap`).
- A **regular** email/password login works fully client-side with no secrets, because `firestore.rules` grants ERP access to a "legacyUnclaimedEmailUser" (signed-in, non-anonymous, no custom claims).
- On first login the app auto-creates `kullanicilar/{email}` with a role guessed by `guessRoleFromEmail` (`src/lib/yetkiUtils.ts`). Unknown/gmail emails become `MİSAFİR` (guest) and are blocked by an authorization modal. To reach the ERP without the admin SDK, use an email containing a role keyword: `formen`, `guven`, `kamp`, `depo`, `lojistik`, or `sofor` (e.g. `formen.test@kibritci.com`) → active role (`durum: AKTİF`).

### Optional secrets (core ERP works without them)
- `GEMINI_API_KEY` — enables AI features (document parsing under `/api/parse-*`, chat, and `/api/gemini-health`). Missing key only disables AI; `gemini-health` returns `success:false`.
- `FIREBASE_SERVICE_ACCOUNT_JSON` — only needed for founder/admin/role endpoints (`/api/auth/*`, custom claims).
- Put these in `.env.local` (loaded by `server.ts`). `.env*` is gitignored.
