# 💍 SAS Wedding Studio

A complete wedding-invitation platform: a public invitation website, an admin login, a content management system, a guest list with QR invitation passes, live QR check-in and an analytics dashboard.

Built with plain HTML, CSS and JavaScript on the front end (Bootstrap 5, Font Awesome, Cormorant Garamond, Josefin Sans) and a dependency-light Node.js API with a JSON data store. No build framework, no database server - clone it, run it, and you have a working invitation studio.

```
Admin login  ->  http://localhost:3000/login.html
Dashboard    ->  http://localhost:3000/admin.html
Invitation   ->  http://localhost:3000/invite.html
```

Demo account: **admin@saswedding.id / wedding123**

---

## ✨ Features

### 1. Admin login
- Email + password sign-in with scrypt-hashed passwords.
- Signed HMAC session tokens (12 hours, or 30 days with "keep me signed in"), delivered as an `HttpOnly`, `SameSite=Lax` cookie and a Bearer token.
- Login rate limiting, session restore, password change and profile editing.

### 2. Dashboard
- Welcome hero with the couple's names, wedding date, live countdown and one-click invitation link.
- KPI cards: total guests, attending, awaiting reply and checked in (with seat counts).
- RSVP split bar, 14-day response chart, guest-composition donut and invitation status.
- Latest RSVPs, recent activity feed and quick actions.

### 3. Invitation CMS
- Seven editor sections: hero & couple, love story, events, gallery, gifts, RSVP/dress code and metadata/music.
- Repeatable timeline entries, events, gallery items and gift accounts.
- Image uploads (PNG/JPG/WEBP/GIF up to 4 MB) stored under `data/uploads`.
- Live theme palette, publish/draft switch and slug control in Settings.
- Unsaved-changes indicator and sticky save bar.

### 4. Guest list with QR codes
- Search, filter by RSVP status, category or check-in state, and sort.
- Add, edit and remove guests; private notes and seat allocation per party.
- Every guest receives a unique invitation code (e.g. `SAS-7KQ4M`).
- QR pass modal with copy link, download PNG and print-ready pass cards.
- Bulk CSV import (paste or upload) with duplicate detection, plus CSV export.

### 5. QR check-in
- Camera scanning through the browser's `BarcodeDetector` (Chrome/Edge) - no app required.
- Manual code entry fallback, duplicate-scan warnings, undo check-in.
- Live arrival stats and recent check-ins.
- Guests can also show their QR pass directly from their personalised invitation.

### 6. Public invitation
- Personalised greeting from the guest code (`?code=SAS-...`) or `?to=Name`.
- English and French language switch that remembers each guest's choice on their browser. Add `lang=en` or `lang=fr` to a shared link to open it in that language.
- Cover with monogram, quote, couple profiles, countdown, calendar link, events with maps, love story, gallery lightbox, dress code, gifts with copy buttons, RSVP form and QR pass.
- Background music with a mute control, scroll reveals and a fully responsive layout.
- RSVP responses update the guest record, dashboard and RSVP page instantly.

### 7. RSVP management
- Every response with seats, message, timestamp and guest code.
- Filter/search, edit a response, delete a response, export to CSV.

---

## 🚀 Quick start

Requirements: **Node.js 20+**.

```bash
npm install
npm run dev
```

`npm run dev` bundles the front-end entries into `dist/` and starts the server on `http://localhost:3000`.

Then:

1. Open `http://localhost:3000/login.html` and sign in with the demo account.
2. Edit the invitation in **Invitation CMS**, then press **Save changes**.
3. Open **Guests**, add a guest, click the QR icon and copy the invitation link.
4. Open that link in a new tab - it greets the guest by name, shows their QR pass and lets them RSVP.
5. Open **QR check-in** to scan the pass (or type the code) and watch the dashboard update.

### Invitation languages

In **Invitation CMS**, use **Invitation content language** to edit and preview the English and French invitation text. Save changes to update both versions. Photos, event times, guest codes and RSVP settings are shared. If a French translation is missing, the invitation uses the English text for that field.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Build bundles, then start the API + static server |
| `npm start` | Start the server (expects bundles in `dist/`) |
| `npm run build` | Bundle and minify every entry in `js/*.js` into `dist/` |
| `npm run watch` | Rebuild bundles on change |
| `npm run seed` | **Destructive:** reset `data/db.json` to the demo wedding |
| `npm run lint:js` / `lint:server` / `lint:css` / `lint:html` | Linters |
| `npm run build:public` | Copy front-end assets into `public/` for static hosting |

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `SAS_SECRET` | generated in `data/.secret` | Token signing secret (set this in production) |
| `SAS_DATA_DIR` | `./data` | Database + uploads directory |
| `NODE_ENV` | - | `production` marks the session cookie `Secure` |

---

## 🗂 Project structure

```
login.html            Admin sign-in page
admin.html            Dashboard shell (views rendered by JS)
invite.html           Public invitation page
404.html              Styled not-found page
index.html            Original static template (kept for reference)
dashboard.html        Original static template dashboard (kept for reference)

css/
  saas.css            Design tokens, buttons, forms, tables, modals, toasts
  saas-login.css      Login layout
  saas-admin.css      Dashboard shell, stats, CMS, scanner
  saas-invite.css     Public invitation
  common.css, guest.css, admin.css   Legacy template styles

js/
  saas-auth.js        Entry -> js/saas/login.js
  saas-admin.js       Entry -> js/saas/admin/index.js (overview, guests, cms, rsvp, checkin, settings)
  saas-invite.js      Entry -> js/saas/invite.js
  saas/api.js         Fetch client, token storage, error handling
  saas/ui.js          Escaping, formatting, toasts, modals, CSV parsing
  app/, common/, connection/, libs/, admin.js, guest.js   Legacy template modules

server/
  index.js            HTTP server: static files, API dispatch, auth context
  seed.js             Demo wedding, guests, RSVPs and check-ins
  lib/                store, security, HTTP helpers, QR generator, router
  routes/             auth, guests, content, rsvps, dashboard, public

data/                 Created at runtime (gitignored)
  db.json             The whole database
  uploads/            Uploaded images
  .secret             Generated signing secret

assets/images/sas/    Original SVG artwork used by the demo content
```

---

## 🧠 How it works

**Storage.** Everything lives in `data/db.json` (users, settings, CMS content, guests, RSVPs, activity). Writes are atomic (temporary file + rename) and the in-memory copy is the source of truth. Uploaded media goes to `data/uploads` and is served from `/uploads/...`.

**Auth.** Passwords use scrypt with a 16-byte salt. Sessions are HMAC-SHA256 signed tokens with `sub`, `iat`, `exp` and a random `jti`. The server accepts the token from `Authorization: Bearer ...` or the `sas_token` cookie; the cookie lets QR downloads and CSV exports work with plain links.

**Guest codes.** Codes are generated from an unambiguous 32-character alphabet (`SAS-XXXXX`) and are unique per guest. The QR encodes `{publicUrl}/invite.html?code=SAS-XXXXX`, so scanning it opens the guest's personalised invitation. Codes act as door passes - treat them like tickets.

**Check-in.** `POST /api/admin/checkin` resolves a code, records `checkedInAt`, updates the RSVP to attending if the guest had not replied, and writes an activity entry. A second scan returns `already: true` instead of overwriting the timestamp.

**RSVP.** Public replies are validated (deadline, seat limit, attendance) and update both the guest record and the RSVP collection, so the dashboard, RSVP page and invitation stay consistent.

---

## 🔌 API overview

All admin endpoints require a session. Public endpoints are open by design.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Sign in, returns token + user |
| `GET` | `/api/auth/me` | Current user |
| `PATCH` | `/api/auth/me` | Update name/email |
| `POST` | `/api/auth/password` | Change password |
| `POST` | `/api/auth/logout` | Clear the session cookie |
| `GET` | `/api/admin/dashboard` | Stats, chart series, activity |
| `GET` | `/api/admin/guests` | Paginated, filtered guest list |
| `POST` | `/api/admin/guests` | Create guest + invitation code |
| `PATCH` | `/api/admin/guests/:id` | Update guest |
| `DELETE` | `/api/admin/guests/:id` | Remove guest |
| `POST` | `/api/admin/guests/import` | Import rows from CSV |
| `GET` | `/api/admin/guests/export` | Download CSV |
| `GET` | `/api/admin/guests/:id/qr` | QR as JSON / PNG / SVG |
| `POST` | `/api/admin/guests/:id/checkin` | Check in a guest |
| `POST` | `/api/admin/guests/:id/checkout` | Undo check-in |
| `POST` | `/api/admin/checkin` | Check in by scanned code |
| `GET` | `/api/admin/rsvps` | RSVP responses |
| `PATCH` | `/api/admin/rsvps/:id` | Edit a response |
| `DELETE` | `/api/admin/rsvps/:id` | Delete a response |
| `GET` | `/api/admin/content` | CMS content + settings |
| `PUT` | `/api/admin/content` | Save CMS content |
| `PUT` | `/api/admin/settings` | Publication, branding, theme |
| `POST` | `/api/admin/media` | Upload an image (data URL) |
| `GET` | `/api/admin/backup` | Download a JSON backup |
| `GET` | `/api/public/invitation` | Public invitation data (`?code=`, `?to=`, `?lang=fr`) |
| `POST` | `/api/public/rsvp` | Submit or update an RSVP |
| `GET` | `/api/public/pass/:code` | QR pass (JSON or PNG) |

Example:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@saswedding.id","password":"wedding123"}'
```

---

## 🚢 Deployment

Full hosting instructions live in **[DEPLOYMENT.md](./DEPLOYMENT.md)** - copy-paste steps for:

- Docker Compose on a VPS (included `Dockerfile` + `docker-compose.yml`)
- Ubuntu + systemd + Nginx/Caddy + Let's Encrypt
- Render, Railway and Fly.io (with persistent volumes)
- Plesk/cPanel Node.js hosting

Production in short:

```bash
npm ci
npm run build
NODE_ENV=production SAS_SECRET="$(openssl rand -hex 48)" npm start
```

- Persist the `data/` directory (database, uploads, secret) on a volume/disk.
- Set a stable `SAS_SECRET`; the session cookie is only marked `Secure` when `NODE_ENV=production` (HTTPS required).
- Back up `data/` regularly; restore both `db.json` and `uploads/` together.
- Run **one** instance - the JSON store is not safe for multiple replicas.
- `npm run build:public` produces static front-end files only; the admin dashboard, RSVP and QR check-in need the Node API.

## 🔒 Security notes

- CMS values are escaped on render; content is sanitised and size-capped server-side.
- Uploads are limited to images under 4 MB and stored with generated filenames.
- Login attempts are rate limited per IP + email (8 per 10 minutes).
- The API is same-origin only by default; there is no public CORS header.
- Invitation codes are bearer passes. Share an individual link only with that guest.

## 🎨 Credits

- Demo content, guest names and story are fictional.
- SVG artwork (cover, couple medallions, gallery) was created for this project.
- Original template inspiration and legacy assets: [dewanakl/undangan](https://github.com/dewanakl/undangan). Visual assets in `assets/images` and `assets/music` originate from that template / Pixabay.
- Fonts: Cormorant Garamond and Josefin Sans (Google Fonts). Icons: Font Awesome. UI framework: Bootstrap.

## 📜 License

MIT - see [LICENSE](./LICENSE).
