# Deploy Commands (Valnaa / OpenClaw Platform)

Use this after you push code changes. Assumes your server has the repo at `/opt/openclaw-platform` and PM2 is already set up.

---

## 1. Push code (on your Mac, from project root)

Repo: **https://github.com/Skycustody/openclaw-platform.git**

This folder may not have `.git` (e.g. if you downloaded ZIP). Connect it and push:

```bash
cd /Users/mac/Desktop/openclaw-platform-main

# One-time: init and add your existing remote
git init
git remote add origin https://github.com/Skycustody/openclaw-platform.git

git add .
git commit -m "Fix WhatsApp QR and Telegram token flow"
git branch -M main
git push -u origin main
```

If you get **rejected (non-fast-forward)** because the remote has commits this copy doesn’t have:

```bash
git pull origin main --rebase
git push origin main
```

Or, if this folder is your source of truth and you’re okay overwriting the remote:

```bash
git push -u origin main --force
```

If you already have git and remote in this folder:

```bash
cd /Users/mac/Desktop/openclaw-platform-main
git add .
git commit -m "Fix WhatsApp QR and Telegram token flow"
git push origin main
```

---

## 2. Deploy on server (SSH in, then run)

Replace `/opt/openclaw-platform` with your actual app path if different.

```bash
cd /opt/openclaw-platform
git pull origin main

# Install dependencies (if package.json changed)
npm install

# Build API
cd api && npm run build && cd ..

# Build dashboard
cd dashboard && npm run build && cd ..

# Run migrations (if any new SQL)
npm run migrate

# Restart apps with PM2
pm2 restart openclaw-api
pm2 restart openclaw-dashboard

# Optional: save PM2 process list (if you added new processes)
pm2 save
```

---

## 3. PM2 commands (reference)

| Command | Description |
|--------|-------------|
| `pm2 list` | See what's running |
| `pm2 logs` | Live logs (both API + dashboard) |
| `pm2 logs openclaw-api` | API logs only |
| `pm2 logs openclaw-dashboard` | Dashboard logs only |
| `pm2 restart all` | Restart API + dashboard |
| `pm2 restart openclaw-api` | Restart API only |
| `pm2 restart openclaw-dashboard` | Restart dashboard only |
| `pm2 stop all` | Stop everything |
| `pm2 monit` | Live monitoring |

---

## 4. Quick deploy (one-liner on server)

After your first deploy, you can use:

```bash
cd /opt/openclaw-platform && git pull origin main && npm install && (cd api && npm run build) && (cd dashboard && npm run build) && npm run migrate && pm2 restart all
```
