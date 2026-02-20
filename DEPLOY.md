# Deployment

Builds are verified: `npm run build:dashboard` and `npm run build:api` both succeed.

---

## Go live on a server (recommended)

To run the full platform (API + dashboard + DB) on **your own server** and go live:

### First-time setup (do once)

1. **Server + domain + DNS** — Follow **SETUP_GUIDE.md** from the start through:
   - Step 2: Create VPS (e.g. Hostinger, Ubuntu 22.04)
   - Step 3: Point your domain at the server (Cloudflare DNS)
   - Step 4: SSH in and install Node 20, Docker, Nginx, git
   - Step 5: Clone or upload this repo (e.g. to `/opt/openclaw-platform`)
   - Step 6–7: Run PostgreSQL and Redis (Docker)
   - Step 8–14: Stripe, Google, AWS S3, Resend, AI keys, **and fill `api/.env`** (copy from `.env.example`)
   - Step 15: Run migrations
   - Step 18: Nginx config for your domain (dashboard + API)
   - Step 19: SSL with certbot

2. **On the server**, from the repo root, run:

```bash
chmod +x scripts/deploy-to-server.sh
./scripts/deploy-to-server.sh
```

The script installs deps, runs migrations, builds API and dashboard, and starts (or restarts) both with PM2. Then run the command that `pm2 startup` prints so the apps start on reboot.

### Later: deploy updates

After you pull new code on the server, run the same script again:

```bash
cd /opt/openclaw-platform   # or wherever the repo lives
git pull
./scripts/deploy-to-server.sh
```

---

## Option 1 — Dashboard only (Vercel)

Deploy the Next.js dashboard to Vercel. Best if your API is already hosted elsewhere.

```bash
cd dashboard
npx vercel
```

- First time: log in with Vercel and link the project.
- Set **Root Directory** to `dashboard` if you're deploying from the monorepo root in the Vercel UI.
- Add env vars in Vercel (e.g. `NEXT_PUBLIC_API_URL` pointing to your API).

Production deploy:

```bash
cd dashboard
npx vercel --prod
```

## Option 2 — Full stack (one server) — manual

If you prefer not to use the deploy script, follow **SETUP_GUIDE.md** and run things manually (install deps, migrate, build, then start API and dashboard with PM2 as in Step 16–17 and Step 22). The script `scripts/deploy-to-server.sh` automates the same steps.

## Option 3 — API with Docker

From the repo root, build and run the API container (database and Redis must be available):

```bash
docker build -f docker/Dockerfile.api -t openclaw-api ./api
docker run -d --name openclaw-api -p 4000:4000 --env-file api/.env openclaw-api
```

For the full control-plane setup (Postgres, Redis, API, dashboard), see **SETUP_GUIDE.md**.
