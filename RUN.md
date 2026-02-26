# How to Run OpenClaw Platform

## Prerequisites

- Node.js 20+
- PostgreSQL (with pgvector)
- Redis
- Docker (for dev compose and for workers)

---

## 1. First-time setup

```bash
git clone <your-repo> openclaw-platform
cd openclaw-platform
cp .env.example .env
```

Edit `.env` and set at least:

- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis URL (e.g. `redis://localhost:6379`)
- `JWT_SECRET` — e.g. `openssl rand -hex 32`
- `INTERNAL_SECRET` — e.g. `openssl rand -hex 32` (min 16 chars)
- `ENCRYPTION_KEY` — 64-char hex, e.g. `openssl rand -hex 32`
- `ADMIN_PASSWORD` — e.g. `openssl rand -hex 16`
- (Optional) `ADMIN_ALLOWED_IPS` — see [Admin panel IPs](#admin-panel-allowed-ips) below

Install and migrate:

```bash
npm install
npm run migrate
```

---

## 2. Run in development

**Terminal 1 — API**

```bash
npm run dev:api
```

API runs at `http://localhost:4000` (or the port in your config).

**Terminal 2 — Dashboard**

```bash
npm run dev:dashboard
```

Dashboard runs at `http://localhost:3000`.

**Optional — PostgreSQL + Redis via Docker**

```bash
docker-compose -f docker/docker-compose.dev.yml up -d
```

Then use `DATABASE_URL` and `REDIS_URL` pointing at those services.

---

## 3. Run in production (build)

```bash
npm run build:api
npm run build:dashboard
```

Then:

- **API:** `cd api && npm start` (or run `node dist/index.js` with the right env).
- **Dashboard:** `cd dashboard && npm start` (or use a process manager / reverse proxy).

Use a process manager (e.g. PM2) and put API and dashboard behind Nginx (or similar) with HTTPS. See `SETUP_GUIDE.md` for a full production layout.

---

## 4. Grant yourself admin access

After the app is running and you have a user account:

```bash
npm run set-admin -- your@email.com
```

Then log in to the dashboard with that email. The **Admin** link in the sidebar appears only for admin users. When you open it, enter the **admin password** (the value of `ADMIN_PASSWORD` in `.env`).

---

## Admin panel — allowed IPs

By default, the **admin API** only accepts requests from **localhost** (`127.0.0.1`, `::1`). To allow access from your machine, office, or VPN, add your IP(s) to `.env`.

### 1. Add the variable in `.env`

On the **control plane** server (where the API runs), edit `.env`:

```bash
# Comma-separated. Include 127.0.0.1 and ::1 if you also want localhost.
ADMIN_ALLOWED_IPS=127.0.0.1,::1,YOUR_IP_HERE
```

Replace `YOUR_IP_HERE` with the IP that will access the admin panel (your office, VPN, or home IP).

**Examples:**

```bash
# Only localhost (default behaviour when this is not set)
# ADMIN_ALLOWED_IPS=

# Localhost + one office IP
ADMIN_ALLOWED_IPS=127.0.0.1,::1,203.0.113.50

# Localhost + several IPs (office, VPN, home)
ADMIN_ALLOWED_IPS=127.0.0.1,::1,203.0.113.50,198.51.100.22,192.0.2.100
```

No spaces between IPs; only commas.

### 2. Find your IP

- From the machine/browser you’ll use to open the dashboard:
  - Visit [https://ifconfig.me](https://ifconfig.me) or [https://whatismyip.com](https://whatismyip.com), or
  - Run `curl -s ifconfig.me`.
- Use that IP in `ADMIN_ALLOWED_IPS`. If your IP changes (e.g. home broadband), update `.env` and restart the API.

### 3. Restart the API

After changing `.env`:

```bash
# If using PM2
pm2 restart openclaw-api

# If running manually
# Stop the API (Ctrl+C) and start again: cd api && npm start
```

### 4. Use the admin panel

1. Open the dashboard from an allowed IP (e.g. `https://yourdomain.com`).
2. Log in with a user that has admin (`npm run set-admin -- your@email.com`).
3. Click **Admin** in the sidebar.
4. When prompted, enter the **admin password** (same as `ADMIN_PASSWORD` in `.env`).

If your IP is not in `ADMIN_ALLOWED_IPS`, you’ll see: *"Admin panel is only available from the control plane. Use SSH port-forward or set ADMIN_ALLOWED_IPS."*

---

## Quick reference

| Task              | Command / action |
|-------------------|------------------|
| Install           | `npm install` |
| Migrate DB        | `npm run migrate` |
| Dev API           | `npm run dev:api` |
| Dev Dashboard     | `npm run dev:dashboard` |
| Build API         | `npm run build:api` |
| Build Dashboard   | `npm run build:dashboard` |
| Grant admin       | `npm run set-admin -- your@email.com` |
| Admin IPs         | In `.env`: `ADMIN_ALLOWED_IPS=127.0.0.1,::1,YOUR_IP` then restart API |
