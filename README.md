# OpenClaw Hosting Platform

A complete OpenClaw-as-a-Service platform. Users sign up, pay, and get a fully working personal AI agent within 60 seconds — zero technical knowledge required.

## Architecture

The **recommended setup** (see `SETUP_GUIDE.md`): one **control plane** server (e.g. Hetzner) runs the API, dashboard, PostgreSQL, and Redis; **workers** are created automatically on Hostinger (one Docker container per user).

```
User Browser ──> Your domain (e.g. yourdomain.com)
                        │
                        ├── Dashboard (Next.js on control plane, or Vercel if you prefer)
                        └── API (Express on control plane)
                                 ├── Stripe (payments)
                                 ├── PostgreSQL + pgvector (auth + DB)
                                 ├── Google OAuth (login)
                                 ├── Redis (cache + queues)
                                 └── Resend (email)
                        │
                        ▼
                 Worker servers (Hostinger, auto-created)
                 ├── Docker (one container per user)
                 ├── Traefik (routing user.yourdomain.com → container)
                 ├── AWS S3 (user data persistence)
                 └── Browserless (headless browser)
```

**Core principle:** Every user gets their own isolated Docker container running OpenClaw. Never shared.

## Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Frontend | Next.js + Tailwind | Dashboard + marketing site |
| API | Express + TypeScript | Control plane |
| Database | PostgreSQL + pgvector | Data + AI memory |
| Cache | Redis | Token tracking, queues, caching |
| Payments | Stripe | Subscriptions + token purchases |
| Email | Resend | Transactional emails |
| Containers | Docker + Traefik | User isolation + routing |
| Hosting | Hostinger VPS | Server infrastructure |
| Storage | AWS S3 | Persistent user data |
| Browser | Browserless | Headless browser service |

## Project Structure

```
openclaw-platform/
├── api/                    # Control Plane API (Express + TypeScript)
│   └── src/
│       ├── index.ts        # Express server entry point
│       ├── routes/         # 16 route modules
│       ├── services/       # Business logic
│       ├── middleware/      # Auth, rate limiting, errors
│       ├── lib/            # DB, Redis, encryption
│       ├── jobs/           # Scheduled jobs
│       └── types/          # TypeScript types
├── dashboard/              # Next.js Frontend (22 pages)
│   └── src/
│       ├── app/            # App router pages
│       ├── components/     # UI components + dashboard
│       ├── lib/            # API client, store, utilities
│       └── hooks/          # React hooks
├── scripts/                # Server management scripts
├── migrations/             # SQL database migrations
├── docker/                 # Dockerfiles + compose
└── .env.example            # Environment variables template
```

## Quick Start (Development)

### Prerequisites
- Node.js 20+
- Docker + Docker Compose
- PostgreSQL with pgvector (or use docker-compose)
- Redis

### 1. Clone and install

```bash
git clone <repo> openclaw-platform
cd openclaw-platform
cp .env.example .env
# Fill in your .env values
```

### 2. Start infrastructure

```bash
docker-compose -f docker/docker-compose.dev.yml up -d
```

### 3. Run migrations

```bash
npm run migrate
```

### 4. Start API

```bash
cd api && npm install && npm run dev
```

### 5. Start Dashboard

```bash
cd dashboard && npm install && npm run dev
```

The dashboard will be at `http://localhost:3000` and API at `http://localhost:4000`.

## Dashboard Pages (17 total)

1. **Agent Control Center** — Status, start/stop/restart, quick stats
2. **Activity Feed** — Real-time feed of agent actions
3. **Channel Manager** — Connect Telegram, Discord, Slack, WhatsApp
4. **Skills Marketplace** — Enable/disable 53 OpenClaw skills
5. **Memory Manager** — View, search, add, delete agent memories
6. **Cron Scheduler** — Schedule recurring automated tasks
7. **Browser Agent Viewer** — Live browser preview (Browserless)
8. **Token Analytics** — Usage charts, balance, purchase tokens
9. **Smart Router** — Auto/manual AI model selection
10. **Personality Editor** — Name, tone, language, instructions
11. **Token Protection** — Budgets, loop detection, quiet hours
12. **File Manager** — Browse, upload, download agent files
13. **Security Center** — 2FA, sessions, API keys
14. **Conversation History** — Searchable message log
15. **Billing** — Plan management, invoices, Stripe portal
16. **Referral System** — Referral links, earnings tracking
17. **Agent Templates** — Community-built agent configurations

## Key Features

### Sleep/Wake System
Containers idle for 30+ minutes are automatically stopped (freeing RAM) and their data synced to S3. When a user sends a message, the container wakes in ~10 seconds. This reduces server costs by 60-70%.

### Smart Router
AI classifies each task and picks the cheapest model that can handle it. Simple tasks use gpt-4o-mini ($0.15/1M), complex analysis uses Claude Opus ($15/1M). Saves users 80-95% on token costs.

### Token Protection
- Per-message token budgets by complexity
- Loop detection (kills stuck agents)
- Quiet hours (no background tasks at night)
- Auto top-up with configurable thresholds
- Single-pass execution for background tasks

### Auto-Scaling
When servers hit 85% RAM capacity, the system automatically provisions new Hostinger VPS instances via API. The new server self-configures via a post-install script and registers with the control plane.

## Revenue Model

1. **Subscriptions:** $10-50/month per user
2. **Token sales:** Buy wholesale from OpenAI/Anthropic, sell at 100-233% markup
3. **Plan upgrades:** More RAM, tokens, features, skills

## Environment Variables

See `.env.example` for the complete list. Key ones:

- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `STRIPE_SECRET_KEY` — Stripe API key
- `OPENAI_API_KEY` — For smart router + embeddings
- `ANTHROPIC_API_KEY` — For Claude models
- `HOSTINGER_API_KEY` — For auto server provisioning
- `ENCRYPTION_KEY` — 32-byte hex for AES-256 encryption

## Deployment

**Full step-by-step:** See **`SETUP_GUIDE.md`** for the recommended production setup (Hetzner control plane + Hostinger workers).

- **Control plane (one server):** API (port 4000) + Dashboard (port 3000) + PostgreSQL + Redis, behind Nginx + SSL. No Vercel or Supabase required.
- **Dashboard:** Can run on the same server as the API, or optionally deploy to Vercel with `cd dashboard && vercel deploy`.
- **Workers:** Hostinger creates them automatically via API; each runs `scripts/server-setup.sh` as a post-install script (see SETUP_GUIDE section 3b).
