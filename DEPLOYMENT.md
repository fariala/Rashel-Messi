# Hosting & deployment guide

This project is a **single Node.js service** that serves the HTML/CSS/JS front end, the admin API and the public invitation API. There is no external database server: all data lives in `data/db.json`, uploads live in `data/uploads`, and sessions are signed with `SAS_SECRET`.

That makes hosting simple, but it also dictates two rules:

1. **Persist the `data/` directory.** If the container/filesystem is rebuilt without it, guests, RSVPs and uploads disappear.
2. **Run exactly one instance.** The JSON store is cached in memory and is not safe for multiple replicas writing the same file.

**Fastest production path:** a small Ubuntu VPS, `docker compose up -d --build` (section 4), Caddy for automatic HTTPS (section 5.6), then finish the first-run checklist (section 8). For the absolute minimum, run the app directly with systemd and put Nginx + Certbot in front (section 5).

---

## 1. Choose a hosting model

| Model | Best for | Effort | Notes |
| --- | --- | --- | --- |
| Docker Compose on a VPS | Most real deployments | Low | Reproducible, easy updates and backups |
| Node + systemd + Nginx on Ubuntu | Full control, no Docker | Medium | Classic VPS setup, documented below |
| Render / Railway / Fly.io | Quick managed deploys | Low | Must attach a persistent volume |
| Plesk / cPanel Node.js app | Existing shared hosting | Medium | Works, but persistent storage and proxy setup vary |
| Static hosts (Vercel, Netlify, GitHub Pages) | Not supported | - | They cannot run the admin API, RSVP writes or QR check-in |

**HTTPS is required** for the QR camera scanner (`getUserMedia` + `BarcodeDetector`), the clipboard copy button and secure admin cookies. `http://localhost` is the only exception. Managed platforms provide HTTPS; on a VPS use Caddy or Certbot.

---

## 2. Environment variables

| Variable | Required | Example | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | Yes (prod) | `production` | Marks the session cookie `Secure`; keep production behind HTTPS |
| `PORT` | No | `3000` | HTTP port |
| `HOST` | No | `127.0.0.1` (behind a local proxy) or `0.0.0.0` | Bind address |
| `SAS_SECRET` | Recommended | 96 hex chars | Signs admin session tokens; if empty, `data/.secret` is generated. Changing it logs admins out |
| `SAS_DATA_DIR` | No | `/app/data` / `/var/data` | Directory for `db.json`, uploads and `.secret` |

Generate a secret with:

```bash
openssl rand -hex 48
```

Never commit `.env`. A template is provided in `.env.example`.

---

## 3. Pre-flight checklist

```bash
npm ci
npm run build       # creates the dist/*.js bundles used by the pages
npm run lint:js
npm run lint:server
```

Manual smoke test locally:

1. `npm start` (or `PORT=3000 node server/index.js`).
2. Open `/login.html`, sign in with the demo account.
3. Open `/invite.html?code=SAS-7KQ4M` and submit an RSVP.
4. Open `/admin.html#/checkin`, check the guest in, confirm the dashboard updates.
5. Re-run `npm run build` before packaging.

Decide before deploying:

- Your domain (e.g. `invitations.example.com`).
- The admin password you will use in production.
- Whether the uploaded photos and music are cleared for public use.

---

## 4. Option A - Docker Compose on a VPS (recommended)

The repository includes `Dockerfile`, `.dockerignore` and `docker-compose.yml`. The image builds the front end, keeps only production dependencies, runs as the unprivileged `node` user and stores data in the `/app/data` volume.

### 4.1 Prepare the server

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"   # log out and back in afterwards
```

### 4.2 Get the project

```bash
git clone <your-repository-url> /opt/sas-wedding
cd /opt/sas-wedding
```

### 4.3 Configure

```bash
cp .env.example .env
nano .env
```

Set at minimum:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
SAS_SECRET=<output of: openssl rand -hex 48>
```

If you leave `SAS_SECRET` empty, the app creates `data/.secret` on first start. That works, but keeping the secret in the environment makes restores and server moves easier.

Compose also overrides `SAS_DATA_DIR` to `/app/data`, matching the `sas-data` volume; keep those two paths in sync if you customise the Compose file.

### 4.4 Build and start

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f --tail=100
curl http://127.0.0.1:3000/api/public/health
```

The Compose file binds the app to `127.0.0.1:3000`, so only the host reverse proxy can reach it. For a direct LAN demo, change the port mapping to `"3000:3000"`.

### 4.5 Put TLS in front

Use `deploy/Caddyfile` (automatic certificates) or `deploy/nginx.conf` + Certbot - see section 7.

### 4.6 Update

```bash
cd /opt/sas-wedding
docker compose exec -T sas tar -czf - -C /app/data . > "sas-backup-$(date +%F).tar.gz"
git pull
docker compose up -d --build
docker compose logs --tail=50
```

### 4.7 Backup / restore with Docker

```bash
# Backup (writes a tarball on the host)
docker compose exec -T sas tar -czf - -C /app/data . > "sas-backup-$(date +%F).tar.gz"

# Restore (stop the app first). The volume is normally <folder>_sas-data.
VOLUME="$(basename "$PWD")_sas-data"
docker compose stop sas
docker run --rm -i -v "$VOLUME":/data alpine sh -c "cd /data && tar -xzf -" < sas-backup-YYYY-MM-DD.tar.gz
docker run --rm -v "$VOLUME":/data alpine chown -R 1000:1000 /data
docker compose start sas
```

The Compose project name (and therefore the volume prefix) is shown by `docker volume ls`; it can also be pinned with `COMPOSE_PROJECT_NAME` in `.env`.

---

## 5. Option B - Ubuntu VPS with Node, systemd and Nginx

Tested layout:

- App: `/var/www/sas`
- Service user: `sas`
- Data: `/var/www/sas/data`
- Proxy: Nginx on 80/443 -> Node on `127.0.0.1:3000`

### 5.1 Install runtime and proxy

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git nginx certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # should be v22.x
```

### 5.2 Create the service user and deploy

```bash
sudo adduser --system --group --home /var/www/sas --shell /bin/bash sas
sudo mkdir -p /var/www/sas
sudo chown -R sas:sas /var/www/sas
sudo -u sas git clone <your-repository-url> /var/www/sas
cd /var/www/sas
sudo -u sas npm ci --no-audit --no-fund
sudo -u sas npm run build
```

If you upload files with `rsync` instead of Git, include `package-lock.json`, then run the same install/build commands.

### 5.3 Configure the environment

```bash
sudo -u sas cp .env.example .env
sudo -u sas nano .env
```

For a local Nginx proxy set `HOST=127.0.0.1`. Keep `NODE_ENV=production` and a fresh `SAS_SECRET`.

```bash
sudo -u sas mkdir -p data
sudo chmod 600 .env
```

### 5.4 Install the systemd service

```bash
sudo cp deploy/sas-wedding.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now sas-wedding
sudo systemctl status sas-wedding --no-pager
curl http://127.0.0.1:3000/api/public/health
```

Logs: `sudo journalctl -u sas-wedding -f`.

### 5.5 Nginx + HTTPS

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/sas-wedding
sudo sed -i 's/invitations.example.com/your-domain.com/g' /etc/nginx/sites-available/sas-wedding
sudo ln -s /etc/nginx/sites-available/sas-wedding /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.com
```

Certbot adds the TLS block and the HTTP-to-HTTPS redirect. Verify:

```bash
curl -I https://your-domain.com/login.html
```

Then configure the firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

### 5.6 Prefer Caddy?

Caddy obtains certificates automatically and can replace Nginx + Certbot:

```bash
# Install Caddy for your distribution: https://caddyserver.com/docs/install
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile   # replace the domain
sudo systemctl reload caddy
```

Stop/disable Nginx first if Caddy will own ports 80/443.

---

## 6. Option C - Managed platforms

### Render

1. **New → Web Service**, connect the repository.
2. Runtime: **Node**.
3. Build command: `npm ci && npm run build`.
4. Start command: `npm start`.
5. Add environment variables:
   - `NODE_ENV=production`
   - `SAS_SECRET=<long random value>`
   - `SAS_DATA_DIR=/var/data`
6. **Add a Disk**, mount path `/var/data`, size 1 GB+ (disks require a paid instance).
7. Health check path: `/api/public/health`.
8. Deploy, open the `.onrender.com` URL, sign in and change the admin password.

Without the disk, Render's filesystem is ephemeral - guests and uploads will reset on every deploy.

### Railway

1. **New Project → Deploy from GitHub repo**.
2. Build: `npm ci && npm run build`; start: `npm start`.
3. **Variables**: `NODE_ENV=production`, `SAS_SECRET=...`, `SAS_DATA_DIR=/data`.
4. **Volumes**: add a volume mounted at `/data`.
5. Generate a public domain, then set `Settings → Public base URL` in the app to that HTTPS URL (or rely on proxy headers).

### Fly.io

Fly uses the included `Dockerfile`.

```bash
fly launch --no-deploy          # keep the existing Dockerfile
fly volumes create sas_data --size 1 --region <your-region>
```

Add to `fly.toml`:

```toml
[mounts]
  source = "sas_data"
  destination = "/app/data"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

  [[http_service.checks]]
    grace_period = "10s"
    interval = "30s"
    method = "GET"
    path = "/api/public/health"
    timeout = "5s"
```

Then:

```bash
fly secrets set NODE_ENV=production SAS_SECRET="$(openssl rand -hex 48)"
fly deploy
fly open
```

Keep **one machine** (`fly scale count 1`). Multiple machines would write the same JSON file concurrently.

### Plesk / cPanel (Node.js app)

1. Enable the **Node.js** extension and choose Node 20+.
2. Application root: the project folder; application startup file: `server/index.js`.
3. Run `npm ci` and `npm run build` via the panel (or SSH), then restart the app.
4. Add environment variables in the panel: `NODE_ENV=production`, `SAS_SECRET`, `SAS_DATA_DIR` (an absolute path outside `public_html`).
5. Enable the reverse proxy/HTTPS for the domain. The app must be reachable at `/` and `/api/*`.
6. Ensure the `data/` directory is writable by the app user and **not** served directly as static files.

Shared hosting can work, but Docker or a small VPS is more predictable for this stack.

---

## 7. Domain, DNS and reverse proxy

1. Point a DNS **A record** (or AAAA for IPv6) at the server IP. For managed platforms, use the target hostname they provide.
2. Wait for DNS propagation (`dig your-domain.com`).
3. Install TLS:
   - Caddy: automatic.
   - Nginx: `sudo certbot --nginx -d your-domain.com`.
   - Cloudflare: proxy enabled, SSL/TLS mode **Full (strict)**; never "Flexible" (it causes redirect loops with secure cookies).
4. Set the application's **Settings → Public base URL** to `https://your-domain.com`. Guest QR codes are generated from this value when present; otherwise the app uses the request host/proxy headers.
5. Verify `https://your-domain.com/api/public/health` returns `{"ok":true,...}`.

> Deploy at a **domain or subdomain root** (e.g. `wedding.example.com`). The app references assets and the API with absolute paths (`/assets`, `/dist`, `/api`), so a subfolder such as `example.com/wedding/` would break styling and requests.

Reverse-proxy requirements:

- Forward `Host`, `X-Forwarded-For`, `X-Forwarded-Proto` and `X-Forwarded-Host` (the provided configs do this).
- Allow request bodies up to at least 10 MB for image uploads.
- Do not cache `/api/*`, `/admin.html`, `/login.html` or `/uploads/*` responses at the CDN edge. Static assets already send caching headers.
- Keep WebSockets unnecessary; the app polls with normal requests.

---

## 8. First-run setup (do this before sharing the link)

1. Open `https://your-domain.com/login.html`.
2. Sign in with `admin@saswedding.id / wedding123`.
3. **Settings → Change password** immediately. There is a single admin account; keep the credentials in a password manager.
4. In **Settings**, verify:
   - Brand / studio name
   - Invitation slug
   - **Public base URL** (`https://your-domain.com`)
   - Timezone
   - Theme colours
   - **Invitation is published**
5. In **Invitation CMS**, replace the demo content: couple, date, venue, events, story, gallery, gifts, RSVP text, dress code, closing.
6. In **Guests**, remove the demo guests (open each guest → trash icon). Do **not** run `npm run seed` on production: it resets the database to the demo wedding.
7. Import the real list with **Import CSV**. Required column: `name`; optional: `phone,email,category,seats`. Categories: `Family`, `Friend`, `Colleague`, `VIP`, `Other`.
8. Open a guest's QR modal → **Copy link**, open it on a phone, submit an RSVP.
9. Open **QR check-in** on the phone, scan the guest pass, confirm the dashboard counts update.
10. Print passes from **Guests → Print QR passes** if you want physical cards.

### 8.1 Migrating your existing local data

The copy on your computer already contains your real content, photos and guests. Move it before inviting anyone:

```bash
# from your computer (stop the local server first)
rsync -av data/ user@your-server:/tmp/sas-data/
# Windows without rsync: scp -r data user@your-server:/tmp/sas-data

# on the server
sudo systemctl stop sas-wedding
sudo rsync -av /tmp/sas-data/ /var/www/sas/data/
sudo chown -R sas:sas /var/www/sas/data
sudo systemctl start sas-wedding
```

Docker:

```bash
docker compose up -d                      # container must be running for cp
docker compose cp ./data/. sas:/app/data
docker compose exec -u root sas chown -R node:node /app/data
docker compose restart sas
```

`data/db.json` and `data/uploads/` must move together. Keep the server's `SAS_SECRET` as configured; copying `.env` from your laptop is not recommended. After the migration, set **Public base URL** again and regenerate/send QR links if the domain changed.

Guest communication is manual: send each guest their personal `https://your-domain.com/invite.html?code=...` link via WhatsApp, SMS or email. The platform does not send emails.

---

## 9. Backups and restore

Everything that matters is in `data/`:

```
data/db.json        users, settings, CMS content, guests, RSVPs, activity
data/uploads/       uploaded photos (referenced by the CMS)
data/.secret        generated signing secret (if SAS_SECRET is not set)
```

### Automated backup (Ubuntu)

```bash
sudo install -m 755 deploy/backup.sh /usr/local/bin/sas-backup
sudo mkdir -p /var/backups/sas
sudo crontab -e
```

Add:

```cron
15 3 * * * APP_DIR=/var/www/sas /usr/local/bin/sas-backup >> /var/log/sas-backup.log 2>&1
```

Then copy archives off the server (rsync, S3, Backblaze, Google Drive...). Keep at least one copy outside the hosting account.

### Manual backup

```bash
sudo -u sas tar -czf /tmp/sas-data-$(date +%F).tar.gz -C /var/www/sas data
```

### Restore

```bash
sudo systemctl stop sas-wedding
sudo tar -xzf sas-data-YYYY-MM-DD.tar.gz -C /var/www/sas
sudo chown -R sas:sas /var/www/sas/data
sudo systemctl start sas-wedding
```

Test a restore **before** the wedding, not on the wedding day. Uploads and `db.json` must be restored together.

The admin UI also offers **Settings → Download full backup** (JSON of content, guests, RSVPs and activity, without uploaded files). Use the tarball for disaster recovery.

---

## 10. Updating the app

```bash
cd /var/www/sas
sudo -u sas tar -czf /tmp/pre-update-$(date +%F).tar.gz -C /var/www/sas data
sudo -u sas git pull
sudo -u sas npm ci --no-audit --no-fund
sudo -u sas npm run build
sudo systemctl restart sas-wedding
curl -fsS http://127.0.0.1:3000/api/public/health
```

Docker:

```bash
cd /opt/sas-wedding
git pull
docker compose up -d --build
```

After every update: sign in, open a guest link, submit a test RSVP, and check the dashboard. There are no database migrations - `db.json` remains compatible - but a backup is still the first step.

---

## 11. Security checklist

- [ ] Change the demo admin password immediately.
- [ ] Set a unique `SAS_SECRET` (96+ hex characters) and keep it stable.
- [ ] Serve only over HTTPS. `NODE_ENV=production` makes the session cookie `Secure`.
- [ ] Firewall: expose only 22, 80 and 443; keep Node bound to `127.0.0.1` behind the proxy.
- [ ] Run as a non-root user (`sas` in systemd, `node` in Docker).
- [ ] `chmod 600 .env`; never commit it.
- [ ] Restrict `data/` permissions (`chmod 700 data`, owner = app user). The app blocks `/data` and `/server` over HTTP, but the proxy must not serve them either.
- [ ] Keep one app instance. Do not enable PM2 cluster mode or multiple replicas.
- [ ] Back up automatically and store a copy off-site; encrypt archives because they contain guests' names, phone numbers and emails.
- [ ] Treat guest links as bearer passes. Anyone with a code can view that guest's pass and RSVP as them.
- [ ] Remove demo guests and demo content before going live.
- [ ] Set **Public base URL** so QR codes never encode `localhost`.
- [ ] Keep Node, the OS and dependencies patched: `npm audit --omit=dev`, rebuild, restart.
- [ ] Optional: protect `/login.html` and `/api/auth/*` with an IP allowlist, VPN or Cloudflare Access if the admin area does not need to be publicly reachable.
- [ ] If you collect EU guests' data, publish a privacy notice, define a retention period and delete the database after the event.

Optional login rate limit at the proxy (on top of the app's built-in limit):

```nginx
# http context
limit_req_zone $binary_remote_addr zone=sas_login:10m rate=20r/m;

# inside the server block
location = /api/auth/login {
    limit_req zone=sas_login burst=5 nodelay;
    proxy_pass http://127.0.0.1:3000;
}
```

---

## 12. Monitoring and operations

| What | How |
| --- | --- |
| Uptime | Monitor `GET /api/public/health` every 5 minutes (UptimeRobot, Better Stack, Pingdom) |
| App logs | `sudo journalctl -u sas-wedding -f` or `docker compose logs -f` |
| Proxy logs | `/var/log/nginx/access.log`, `/var/log/nginx/error.log`, `/var/log/caddy/...` |
| Disk | `df -h` and `du -sh /var/www/sas/data`; uploads grow over time |
| TLS expiry | Certbot/Caddy renew automatically; verify with `curl -vI https://your-domain.com` |
| Backups | Check the nightly archive exists and is recent (`ls -lh /var/backups/sas`) |
| Health after deploy | Login, open a guest link, submit a test RSVP, scan a QR pass |

Service commands:

```bash
sudo systemctl status sas-wedding
sudo systemctl restart sas-wedding
sudo systemctl stop sas-wedding
sudo journalctl -u sas-wedding --since "1 hour ago"
```

---

## 13. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `502 Bad Gateway` | Node process down or wrong port | `systemctl status sas-wedding`; check `PORT` and `proxy_pass` |
| `EADDRINUSE` on startup | Another instance is on port 3000 | `ss -ltnp \| grep 3000`, stop the duplicate |
| Login loops / session does not stick | `NODE_ENV=production` over HTTP (Secure cookie) | Use HTTPS, or `NODE_ENV=development` for a local test |
| QR code opens `localhost` | Wrong public URL | Set **Settings → Public base URL** to the real HTTPS domain, then reprint/send passes |
| Camera scanning unavailable | Missing HTTPS or unsupported browser | Use HTTPS + Chrome/Edge; type the guest code manually |
| Data disappears after deploy | No persistent volume/disk | Mount `SAS_DATA_DIR` on a volume and restore the last backup |
| Uploads return 413 | Proxy body limit too low | Set `client_max_body_size 10m` (app rejects images over 4 MB) |
| `Permission denied` writing `db.json` | `data/` not owned by the app user | `sudo chown -R sas:sas /var/www/sas/data` |
| Blank page / JS 404 | `dist/` not built or not copied | Run `npm run build`; confirm `/dist/saas-admin.js` exists |
| Assets 404 under a subfolder | App deployed at `example.com/wedding/` | Use a subdomain/root, or add a proxy rewrite and adjust absolute paths |
| Icons/fonts missing | CDN blocked on the network | Allow Google Fonts/jsDelivr, or self-host those assets |
| Invitation says "not live yet" | Draft mode | **Settings → Invitation is published** |
| RSVP returns 403 | RSVP disabled or deadline passed | **CMS → RSVP & details**; check the deadline |
| Invitation code not recognised | Typo or deleted guest | Copy the link from the guest's QR modal; deleting a guest invalidates the code |
| `npm ci` fails | Node too old or lockfile missing | Use Node 20+, commit `package-lock.json` |
| Docker volume permissions | Wrong UID | Recreate the volume with the image, or `chown -R 1000:1000` |
| Countdown/date looks wrong | Event time vs visitor timezone | Set the event date/time in the CMS; the countdown uses the visitor's local time |

---

## 14. Scaling limits and architecture notes

This build is intentionally a **single-tenant, single-process** app:

- `db.json` is cached in memory and written atomically; a second process could overwrite changes.
- Uploads are local files, not object storage.
- There is one admin account and no user management.
- Guest QR codes are unique per guest, not per event.

It is comfortable for a wedding with hundreds to a few thousand guests, printed passes and a check-in team using several phones pointed at the same server.

If you later need a real multi-tenant SaaS (many couples, separate domains), plan a refactor:

1. Move data to PostgreSQL (tenants, guests, RSVPs, sessions) with per-tenant scoping.
2. Move uploads to S3-compatible object storage and store URLs.
3. Add proper account management, roles and password reset.
4. Add per-tenant routing (subdomain or slug) and background jobs for email/WhatsApp delivery.
5. Deploy multiple replicas behind a load balancer only after the data layer is shared.

---

## 15. Quick reference

```bash
# local
npm ci && npm run build && npm start

# Docker
cp .env.example .env && docker compose up -d --build
docker compose logs -f

# VPS service
sudo systemctl status sas-wedding
sudo journalctl -u sas-wedding -f

# health
curl -fsS http://127.0.0.1:3000/api/public/health

# backup
sudo -u sas tar -czf /tmp/sas-$(date +%F).tar.gz -C /var/www/sas data
```

---

## 16. Local network demo (no server required)

To show the invitation to family on the same Wi-Fi before renting hosting:

```bash
npm ci
npm run build
HOST=0.0.0.0 PORT=3000 NODE_ENV=development npm start
```

Windows PowerShell:

```powershell
npm ci
npm run build
$env:HOST='0.0.0.0'; $env:PORT='3000'; $env:NODE_ENV='development'; npm start
```

Find the computer's LAN IP (`ipconfig` on Windows, `ip a` on Linux) and allow port 3000 in the firewall, then open `http://<LAN-IP>:3000/invite.html` on a phone.

- Use `NODE_ENV=development` for plain HTTP; production mode uses Secure cookies that browsers refuse over HTTP.
- Camera QR scanning and the clipboard button need HTTPS (or `localhost`). On a LAN, use the manual guest code field, or tunnel with Cloudflare Tunnel / ngrok / Caddy and a local certificate.
- Do not expose this demo directly to the internet without HTTPS and a changed admin password.







