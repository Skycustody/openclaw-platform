# Admin Panel — Control Plane Only

The admin panel (dashboard `/admin` and API `/admin/*`) is **only available from the control plane**. It is not exposed to the public internet by default.

## How it works

- **Default:** Admin API accepts requests only from **localhost** (`127.0.0.1`, `::1`).
- **Optional:** Set `ADMIN_ALLOWED_IPS` in `.env` to allow specific IPs (e.g. your VPN or office). When set, localhost is not added automatically; include `127.0.0.1,::1` if you need local access too.
- Access still requires: valid JWT (logged-in user), `is_admin = true` in the database, and the `ADMIN_PASSWORD` header (dashboard sends it after you enter it).

## Get access

### 1. Set env on the control plane

In `.env` on the **API server** (control plane):

```bash
# Required. Generate with: openssl rand -hex 16
ADMIN_PASSWORD=your-secure-admin-password

# Optional: allow from more IPs (comma-separated)
# ADMIN_ALLOWED_IPS=127.0.0.1,::1,10.0.0.5
```

### 2. Grant your user admin

From the repo root (with `DATABASE_URL` in `.env` or `api/.env`):

```bash
npm run set-admin -- your@email.com
```

This sets `is_admin = true` for that user in the database.

### 3. Open the admin panel

**Option A — SSH port-forward (recommended)**  
From your laptop:

```bash
ssh -L 3000:localhost:3000 -L 4000:localhost:4000 user@your-control-plane-host
```

Then open `http://localhost:3000`, log in with your user, go to **Admin** in the sidebar, and enter `ADMIN_PASSWORD` when prompted.

**Option B — Allow your IP**  
Add your IP to `.env` on the control plane:

```bash
ADMIN_ALLOWED_IPS=87.94.147.214,213.28.231.105,127.0.0.1,::1
```

Restart the API, then open the dashboard from that IP and go to `/admin`.

**Details:** See **RUN.md** → “Admin panel — allowed IPs” for step-by-step (finding your IP, multiple IPs, restart).

## Summary

| Step | Action |
|------|--------|
| 1 | Set `ADMIN_PASSWORD` in `.env` on the control plane |
| 2 | Run `npm run set-admin -- your@email.com` |
| 3 | Use SSH port-forward to localhost, or set `ADMIN_ALLOWED_IPS` |
| 4 | Log in to the dashboard → Admin → enter admin password when prompted |

The Admin link in the sidebar is only visible to users with `is_admin = true`.
