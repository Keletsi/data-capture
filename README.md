# Salon Cards

An authenticated salon capture desk. Log a salon's **name**, **owner**, **contact number**,
**email** and **address** once; each entry becomes a card saved to the signed-in user's profile.
Copy a card as text, copy the whole set, or download a spreadsheet (CSV) that opens in Excel or
Google Sheets.

Built as a separate app with the same authentication method and `secrets.json` shape as the
current Sales Trail app, plus Firebase Firestore persistence for accounts and cards.

---

## What it does

| Area | Detail |
| --- | --- |
| **Capture form** | Salon name, owner name, contact number, email, address, optional notes. Server-side validation. |
| **Cards** | Every card shows the five fields, notes, who captured it and when. Search across all fields. |
| **Send as text** | Copy one card or the filtered set as clean text blocks. Download the set as `.txt`. |
| **Send as spreadsheet** | Download CSV (`Salon Name, Owner Name, Contact Number, Email, Address, Notes, Captured By, Captured At`) with a UTF-8 BOM for Excel. |
| **Ownership** | Cards are saved against the logged-in user. Capturers see their own cards; admins see the whole desk and can filter to *All cards* or *Mine*. |
| **Profile** | Edit name, phone and avatar colour; change password; see capture totals, storage mode, last sync and `secrets.json` status. |

---

## Authentication (same method as Sales Trail)

- Passwords hashed with **scrypt** and a per-user salt.
- Sessions are **HMAC-SHA256 signed tokens** in an **HttpOnly, SameSite=Lax cookie**, valid 7 days.
- Signing key generated once in `data/session.key`.
- Login rate limiting (12 attempts / 15 minutes per address).
- First-run bootstrap admin and an idempotent developer super admin.
- All `/api/salons*`, `/api/bootstrap`, `/api/auth/profile`, `/api/auth/password` and export routes
  require a session.

`server/auth.mjs` is a direct adaptation of the current app's auth module.

---

## Firebase persistence

- `server/firebase.mjs` signs a service-account JWT (RS256), exchanges it for an OAuth token and
  talks to **Firestore over REST** — no SDK and no browser credentials.
- Firestore is the source of truth for the `users` and `salons` collections. A local JSON mirror in
  `data/cache/` keeps the app usable if Firebase is temporarily unreachable; writes are attempted
  again on the next change and failures are visible in Profile → Data & persistence.
- The service account lives in `secrets/serviceAccount.json` (copied from the current app) and is
  **git-ignored**. It is never served over HTTP.
- `firestore.rules` keeps client access closed; only the server's admin credentials can read or
  write. Deploy them with:

```bash
firebase deploy --only firestore:rules
```

---

## Quick start

```bash
pnpm install
pnpm dev            # API on 5194, UI on 5195
```

Production:

```bash
pnpm build          # tsc + vite build -> dist/
pnpm start          # server + UI on http://localhost:5194
```

First boot creates an admin (`admin@saloncards.app` / `salon1234`) unless accounts already exist in
Firestore, and always ensures the developer super admin
(`thabisokeletsi@gmail.com` / `trail1234`). The server prints whichever accounts it created; the
login screen shows first-run credentials too.

Environment overrides: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`,
`PORT`, `FIREBASE_SERVICE_ACCOUNT`.

---

## Data

```
data/
  secrets.json        # copied SMTP config (git-ignored)
  session.key         # generated session signing key (git-ignored)
  cache/
    users.json        # local mirror of the Firestore users collection
    salons.json       # local mirror of the Firestore salons collection
secrets/
  serviceAccount.json # Firebase admin credentials (git-ignored)
```

Firestore collections:

- `users` — id, name, email, salt, passwordHash, role, phone, colour, active, timestamps.
- `salons` — id, salonName, ownerName, contactNumber, email, address, notes, capturedById,
  capturedBy, timestamps.

---

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Status, counts, secrets flags, Firebase store status |
| GET | `/api/auth/status` | Bootstrap state + first-run credentials |
| POST | `/api/auth/login` | Email/password sign-in; sets the session cookie |
| POST | `/api/auth/logout` | Clears the session cookie |
| GET | `/api/auth/me` | Current session user |
| PATCH | `/api/auth/profile` | Name, phone, avatar colour |
| POST | `/api/auth/password` | Change password |
| GET | `/api/bootstrap` | Session, visible cards, stats, users, store/secrets status |
| GET | `/api/salons` | List visible cards (`q`, `scope=mine`) |
| POST | `/api/salons` | Create a card owned by the session user |
| PATCH | `/api/salons/:id` | Edit your card (admins may edit any) |
| DELETE | `/api/salons/:id` | Delete your card (admins may delete any) |
| GET | `/api/export.csv` | CSV of the visible/filtered set |
| GET | `/api/export.txt` | Text blocks of the visible/filtered set |

---

## Project layout

```
server/
  index.mjs       # HTTP server, routing, static app
  auth.mjs        # scrypt + HMAC sessions (copied method)
  store.mjs       # Firestore-first store with local mirror
  firebase.mjs    # service-account JWT + Firestore REST
  export.mjs      # text blocks + CSV
src/
  api/            # types + typed client
  store/          # zustand session/cards store
  components/     # Login, TopBar, Dashboard, SalonCard, SalonForm, Profile
  lib/            # client-side card text
scripts/dev.mjs   # one-command dev launcher (Windows-safe)
firestore.rules   # deny-all client rules
firebase.json
```

---

## Security notes

- `secrets/`, `data/`, `node_modules/` and `dist/` are git-ignored. Service-account and SMTP
  credentials must never be committed.
- CORS is not enabled; the app is same-origin and the API is intended to run beside the UI.
- IDs and session checks are enforced server-side; the client's scope filter is convenience only.
