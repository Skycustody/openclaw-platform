# Worker Server Setup — Where to Find Everything

This guide tells you **how to set up** auto-provisioned worker servers and **where to find** each value. After setup, when a user pays, the platform can create new Hostinger VPSes, run a post-install script (Docker, Traefik, register with API), and then run their agent container so "Open Agent" works.

---

## 1. HOSTINGER_API_KEY

**What it is:** A token that lets your API create and manage VPSes on your Hostinger account.

**Where to find it:**

1. Log in at **https://hostinger.com**
2. In the left sidebar or top search, look for **"API"** or **"API Access"**
3. Click **Generate API Key** / **Create New Token**
4. Name it (e.g. "OpenClaw platform"), set expiration if you want
5. **Copy the key and save it** — this is `HOSTINGER_API_KEY`

**Docs:** [Hostinger API](https://support.hostinger.com/en/articles/10840865-what-is-hostinger-api) · Developer portal: **https://developers.hostinger.com**

**Put it in:** `.env`:
```bash
HOSTINGER_API_KEY=your_key_here
```

---

## 2. HOSTINGER_ITEM_ID, HOSTINGER_TEMPLATE_ID, HOSTINGER_DATA_CENTER_ID (optional)

**What they are:** The catalog item ID for the VPS plan, the OS template ID (e.g. Ubuntu 22.04), and the data center ID.

**You don’t have to set these.** If they’re missing from `.env`, the API will **auto-discover** them from Hostinger the first time it provisions a server (it picks the first VPS plan, first Ubuntu 22.04 template, and first data center). Check your API logs to see which IDs were used; you can then add them to `.env` to lock in specific plan/region.

To **override** and choose a specific plan/OS/region, discover the IDs and set them:

```bash
# List VPS plans (copy a price id for HOSTINGER_ITEM_ID)
curl -sS "https://developers.hostinger.com/api/billing/v1/catalog?category=vps" -H "Authorization: Bearer YOUR_KEY"

# List OS templates (copy id for Ubuntu 22.04 → HOSTINGER_TEMPLATE_ID)
curl -sS "https://developers.hostinger.com/api/vps/v1/os-templates" -H "Authorization: Bearer YOUR_KEY"

# List data centers (copy id → HOSTINGER_DATA_CENTER_ID)
curl -sS "https://developers.hostinger.com/api/vps/v1/data-centers" -H "Authorization: Bearer YOUR_KEY"
```

---

## 3. HOSTINGER_SCRIPT_ID (post-install script)

**What it is:** The ID of a **post-install script** stored in Hostinger. When a new VPS is created, Hostinger runs this script on it (install Docker, Traefik, then call your API to register the server).

**If you already created it**, list your scripts and grab the ID:

```bash
curl -sS "https://developers.hostinger.com/api/vps/v1/post-install-scripts" \
  -H "Authorization: Bearer YOUR_KEY"
```

**If you need to create it:**

**Step 1 — Customize the script.** Edit `scripts/server-setup.sh` and **bake in your real values** before uploading. Hostinger does NOT pass environment variables to post-install scripts — the defaults in the script (`https://api.yourdomain.com` and `changeme`) will be used as-is. You MUST replace them:

- Replace `${PLATFORM_API:-https://api.yourdomain.com}` with your real API URL (e.g. `https://api.valnaa.com`)
- Replace `${INTERNAL_SECRET:-changeme}` with your real `INTERNAL_SECRET` from `.env`
- Replace `${ADMIN_EMAIL:-...}` with your email (for Let's Encrypt)

**Step 2 — Upload to Hostinger and get the ID:**

```bash
curl -sS -X POST "https://developers.hostinger.com/api/vps/v1/post-install-scripts" \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"OpenClaw worker setup\", \"content\": $(jq -Rs . scripts/server-setup.sh)}"
```

The response contains `id` — that's **HOSTINGER_SCRIPT_ID**.

**Put it in:** `.env`:
```bash
HOSTINGER_SCRIPT_ID=2830
```

> **Important:** If you already uploaded the script but left the placeholder values (`yourdomain.com`, `changeme`), you need to **update it** with the correct values. Use `PUT /api/vps/v1/post-install-scripts/{id}` with the corrected content.

---

## 4. DOMAIN and wildcard DNS

- **DOMAIN** — Your main domain (e.g. `yourdomain.com`). In `.env`: `DOMAIN=yourdomain.com`
- **Wildcard DNS** — In your DNS provider (e.g. Cloudflare):
  - Type: **A**
  - Name: **\***
  - Value: IP of the worker server that runs Traefik

---

## 5. INTERNAL_SECRET

A shared secret so workers can call internal endpoints like `/webhooks/servers/register`.

```bash
openssl rand -hex 32
```

Set it in:
- API `.env`: `INTERNAL_SECRET=that_hex_string`
- Post-install script (baked in before upload — see step 5 above)

---

## 6. SSH from API server to workers

The API SSHs into workers as **root** using `SSH_PRIVATE_KEY` (base64-encoded).

1. Generate a key:
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/openclaw_worker -N ""
   ```

2. Base64-encode the private key for `.env`:
   ```bash
   base64 -w0 ~/.ssh/openclaw_worker    # Linux
   base64 -i ~/.ssh/openclaw_worker | tr -d '\n'   # macOS
   ```
   In `.env`:
   ```bash
   SSH_PRIVATE_KEY=<paste_base64_output>
   ```

3. (Optional) Set `WORKER_SSH_PUBLIC_KEY` in `.env` to the contents of `~/.ssh/openclaw_worker.pub`. The Hostinger API will inject it into new VPSes automatically at creation time.

4. Or, in the post-install script, append the public key to `/root/.ssh/authorized_keys`.

5. Firewall: workers must allow **inbound SSH (port 22)** from the API server's IP.

---

## 7. Docker image

The worker containers use `openclaw/openclaw:latest` (or whatever `DOCKER_REGISTRY` is set to in `.env`). You need to build and push this image so workers can pull it:

```bash
cd docker
docker build -t openclaw/openclaw:latest -f Dockerfile.openclaw .
docker push openclaw/openclaw:latest
```

If you use a private registry, set `DOCKER_REGISTRY=your-registry.com/openclaw` in `.env`.

---

## Quick checklist

| Item | Where to find / set |
|------|----------------------|
| **HOSTINGER_API_KEY** | Hostinger → API → Generate token |
| **HOSTINGER_ITEM_ID** (optional) | Auto-discovered if unset; or set from catalog API |
| **HOSTINGER_TEMPLATE_ID** (optional) | Auto-discovered if unset; or set from os-templates API |
| **HOSTINGER_DATA_CENTER_ID** (optional) | Auto-discovered if unset; or set from data-centers API |
| **HOSTINGER_SCRIPT_ID** | Create post-install script → use returned `id` |
| **DOMAIN** | Your domain (e.g. `yourdomain.com`) → `.env` |
| **Wildcard DNS** | DNS provider → A record `*` → worker/Traefik IP |
| **INTERNAL_SECRET** | `openssl rand -hex 32` → `.env` + baked into post-install script |
| **SSH_PRIVATE_KEY** | Base64-encoded private key → `.env` |
| **WORKER_SSH_PUBLIC_KEY** | Public key contents → `.env` (optional, auto-injected at VPS creation) |
| **Docker image** | Build + push `openclaw/openclaw:latest` |

For full deployment steps (main server, DB, Stripe, etc.), see **SETUP_GUIDE.md**.
   curl -sS "https://developers.hostinger.com/api/billing/v1/catalog?category=vps" \
     -H "Authorization: Bearer rnEHbnDC8uI2GTiFu14OukiFiLtIy4btY3rbpa8uc34dbb16"
        curl -sS "https://developers.hostinger.com/api/vps/v1/os-templates" \
     -H "Authorization: Bearer rnEHbnDC8uI2GTiFu14OukiFiLtIy4btY3rbpa8uc34dbb16"