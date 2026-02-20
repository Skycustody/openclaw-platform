# Worker Server Setup — Hetzner Cloud Auto-Provisioning

**Architecture:** Your **control plane** (API, dashboard, database) runs on your **Hostinger** VPS. **Workers** (user agent containers) are **auto-created on Hetzner Cloud** when capacity runs low. You only use Hetzner for worker VPSes; Hostinger stays the main server.

This guide explains how to set up **fully automatic** worker provisioning: when a user pays, the platform creates a Hetzner Cloud VPS, installs Docker + Traefik, registers it with your API, and deploys the user's agent container — all without manual intervention.

---

## Does Hetzner support auto-create VPS + run script?

**Yes.** Hetzner Cloud API supports both:

1. **Create server via API** — `POST https://api.hetzner.cloud/v1/servers` with `name`, `server_type`, `image`, `location`. The server is created in about 60 seconds and you get the server ID and public IP in the response.

2. **Run a script on first boot** — Pass `user_data` in the same request. Hetzner uses **cloud-init** on Ubuntu images. You can send:
   - A **bash script** (first line `#!/bin/bash`) — cloud-init runs it once on first boot.
   - Or **cloud-config YAML** (first line `#cloud-config`) for package installs, users, etc.

Our code sends a single bash script in `user_data` that installs Docker, Traefik, and registers the new server with your API. No manual steps.

**References:** [Hetzner Cloud API – Servers](https://docs.hetzner.cloud/reference/cloud#tag/Servers) · [Basic Cloud Config (Hetzner)](https://community.hetzner.com/tutorials/basic-cloud-config) · [Cloud-init formats](https://cloudinit.readthedocs.io/en/stable/explanation/format.html) (including shell scripts).

---

## 1. Create a Hetzner Cloud Account + API Token

1. Sign up at **https://console.hetzner.cloud**
2. Create a project (or use the default one)
3. Go to **Security → API tokens → Generate API token**
4. Select **Read & Write** permissions
5. Copy the token

In your `.env`:
```bash
HETZNER_API_TOKEN=your_token_here
```

**Cost:** Servers start at **~€4.35/month** (cx22 = 2 vCPU, 4GB RAM). Billing is hourly — you only pay for what you use.

---

## 2. Choose Server Type and Location (optional)

Defaults are already set (`cx22` in `ash` = Ashburn, Virginia). Override if needed:

```bash
# In .env (optional)
HETZNER_SERVER_TYPE=cx22    # cx22=4GB, cx32=8GB, cx42=16GB
HETZNER_LOCATION=ash        # ash, hil (US), nbg1, fsn1, hel1 (EU), sin (SG)
```

To see all options:
```bash
# List server types
curl -sS "https://api.hetzner.cloud/v1/server_types" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq '.server_types[] | {name, description, cores, memory, disk, prices}'

# List locations
curl -sS "https://api.hetzner.cloud/v1/locations" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq '.locations[] | {name, city, country}'
```

---

## 3. SSH Keys (for API → worker access)

The API server needs to SSH into workers to run `docker` commands.

**On your API server (srv1402168):**

```bash
# Generate key pair (skip if you already have one)
ssh-keygen -t ed25519 -f ~/.ssh/openclaw_worker -N ""

# Base64-encode the private key for .env
base64 -w0 ~/.ssh/openclaw_worker
```

In your `.env`:
```bash
SSH_PRIVATE_KEY=<paste the base64 output>
WORKER_SSH_PUBLIC_KEY=<paste contents of ~/.ssh/openclaw_worker.pub>
```

The public key is automatically injected into new Hetzner servers via cloud-init, so SSH access works immediately.

---

## 4. Wildcard DNS

In your DNS provider (Cloudflare):

| Type | Name | Value | Proxy |
|------|------|-------|-------|
| A | `*` | Worker server IP (auto-assigned by Hetzner) | Orange cloud ON |

**Note:** When running on the main server, point `*` to `72.62.1.134`. When Hetzner workers are created, each new worker gets its own IP — you'll need to add A records for the user subdomains pointing to the worker IPs. The provisioning code handles subdomain assignment; you just need the wildcard DNS to route traffic.

---

## 5. How It Works (fully automatic)

1. User pays via Stripe
2. `provisionUser()` calls `findBestServer()` in `serverRegistry.ts`
3. If no server has capacity → `cloudProvider.provisionNewServer()` is called
4. Hetzner creates a VPS with Ubuntu 22.04 + cloud-init user-data script
5. Cloud-init installs Docker, Traefik, builds the openclaw image, and registers with your API
6. Registration creates a row in `servers` table with status `active`
7. `waitForNewServer()` polls until the new server appears (~3-5 minutes)
8. User container is created on the new server via SSH

---

## 6. INTERNAL_SECRET

A shared secret for worker → API communication (server registration).

```bash
openssl rand -hex 32
```

Set in `.env`:
```bash
INTERNAL_SECRET=your_hex_here
```

This is automatically baked into the cloud-init script that runs on new workers.

---

## Quick Checklist

| Item | Where to get it |
|------|-----------------|
| **HETZNER_API_TOKEN** | Hetzner Console → Security → API tokens |
| **HETZNER_SERVER_TYPE** (optional) | Default `cx22` (4GB). See server types API |
| **HETZNER_LOCATION** (optional) | Default `ash` (US). See locations API |
| **SSH_PRIVATE_KEY** | `ssh-keygen` → base64 encode → `.env` |
| **WORKER_SSH_PUBLIC_KEY** | Contents of `.pub` file → `.env` |
| **INTERNAL_SECRET** | `openssl rand -hex 32` → `.env` |
| **Wildcard DNS** | Cloudflare → A record `*` → worker IP |

For full deployment steps (main server, DB, Stripe, etc.), see **SETUP_GUIDE.md**.


CLOUDFLARE_API_TOKEN=<your-cloudflare-token>curl "https://api.cloudflare.com/client/v4/user/tokens/verify" \
-H "Authorization: Bearer 9f4M2vBERSikKWXgRqDTGiXtYZe5beFdjGcLyQ1k"
CLOUDFLARE_ZONE_ID=your-zone-id>ee006c60cbb84510e7c6a2bbf1b39bfb

CLOUDFLARE_API_TOKEN=9f4M2vBERSikKWXgRqDTGiXtYZe5beFdjGcLyQ1k
CLOUDFLARE_ZONE_ID=ee006c60cbb84510e7c6a2bbf1b39bfb