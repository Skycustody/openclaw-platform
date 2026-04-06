# CLAUDE.md — OpenClaw Platform

---

## NON-NEGOTIABLE RULES — READ BEFORE ANYTHING ELSE

> These rules apply to every task, every file, every change. No exceptions.

### RULE 1 — Logs before code. Always.

**Never write a fix before reading evidence from logs.**

- Find the exact error, stack trace, or unexpected value in the logs first
- Log files: `~/.openclaw-desktop/logs/openclaw.log` (agent) and `app.log` (Valnaa diagnostics)
- If logs don't surface the problem, add temporary logging, read the output, then fix
- Guessing what the bug is and writing a fix is not allowed — the fix must be traceable to a specific log line or observed value

**No log evidence → no code change.**

### RULE 2 — Every change must answer: does this break anything?

**Before making any edit, ask:**
1. What evidence (log, error, observed behavior) proves this change is needed?
2. What existing functionality could this change break?
3. What is the minimum edit that solves the confirmed problem?

If you cannot answer all three, do not make the change. Ask first.

**A change that fixes one thing but silently breaks another is worse than no change.**

### RULE 3 — Fixes belong in the app, not in the terminal.

**This is a consumer product. Users are not developers.**

- Every fix must be implemented **in the app code** — never as a manual terminal command or workaround the user has to run themselves
- If something can fail (Docker not running, port conflict, missing binary, bad config), the app must detect it, handle it, and either self-repair or show the user a clear actionable message in the UI
- Setup steps, retries, fallbacks, error recovery — all must be automated inside Valnaa
- "Open a terminal and run X" is never an acceptable solution for end users
- When debugging, we read logs to understand the problem — but the fix goes into `desktop/src/` so the app handles it for every user automatically

**If a user needs to touch a terminal to fix it, we failed.**

### RULE 4 — Dev machine ≠ user machine. Know the difference.

**This dev machine has accumulated state from many OpenClaw/NemoClaw builds and test runs.**

- Leftover Docker containers, stale k3d clusters, orphaned port bindings, old configs, and duplicate binaries can cause errors that a fresh user install would never see
- Before fixing an error, always ask: **would a user with a clean computer hit this?**
- If the error is caused by dirty dev state (stale containers, conflicting ports from old runs, leftover config files), clean up the dev environment — do not add defensive code to the app for a problem only we have
- If the error IS something a real user could hit (first install, upgrade, network issue, Docker not running), then fix it in the app
- When in doubt, ask — do not waste time building app-level fixes for dev-only problems

### RULE 5 — Desktop and API are independent. Do not cross the boundary.

**The desktop app (Valnaa) only talks to the API for auth, billing, and gateway tokens. That's it.**

- A desktop bug is never fixed in the API, and an API bug is never fixed in the desktop
- Do not add API calls to solve local problems (Docker, ports, setup, agent lifecycle)
- Do not add desktop logic to handle server-side concerns (provisioning, billing logic, user management)
- `session.ts` → `api.valnaa.com` is the only bridge — auth, subscription check, gateway token rotation
- Everything else in the desktop app is local: process spawning, Docker orchestration, port management, config files

### RULE 6 — The app runs everything locally. There is no VPS involved.

**OpenClaw and NemoClaw run entirely on the user's machine.**

- OpenClaw: spawns a local gateway process (`openclaw gateway --port 18789`)
- NemoClaw: runs a local k3d cluster inside Docker, with SSH tunneling via openshell
- All containers, ports, binaries, configs, and logs live on the user's machine
- The only remote call is to `api.valnaa.com` for auth and billing — never assume a remote server, SSH to a VPS, or cloud infrastructure is part of the desktop app's operation

### RULE 7 — Never fix problems manually. Always fix them in app code.

**When debugging and you find a problem, NEVER run manual commands to fix it.**

- Do not manually edit configs inside the sandbox, Docker containers, or the filesystem to "test" a fix
- Do not run openshell/docker/kubectl commands to patch state — if the app can't do it, add the code so the app does it
- Manual fixes prove the fix works but help zero users — the app must do it automatically
- The correct flow is: find the problem → write the fix in `desktop/src/` → build → test via the app
- If you manually fix something to unblock testing, you MUST immediately add that same fix to the app code before moving on

**A manual fix is not a fix. It's a TODO.**

### RULE 8 — We facilitate NemoClaw, we don't modify it.

**Valnaa is a GUI wrapper around NemoClaw's existing functionality. Nothing more.**

- Only surface features that already exist in NemoClaw/OpenShell CLI as GUI elements
- Do not add custom networking, DNS fixes, policy logic, or agent behavior that NemoClaw doesn't already support
- Permission popups trigger from NemoClaw's own `action=deny` logs — we don't create new permission rules
- Model switching uses `openshell inference set` — we don't modify the inference routing ourselves
- If something is broken in NemoClaw (DNS, proxy, sandbox), that's a NemoClaw issue — don't hack around it in the app
- The app's job: make NemoClaw's CLI accessible to users who can't use a terminal

---

## Project Overview

OpenClaw is a SaaS platform that provisions personal AI agent containers (OpenClaw) for users. This repo is a monorepo with three services plus the Valnaa desktop client.

---

## Monorepo Structure

```
openclaw-platform-main/
├── desktop/        # Electron app (Valnaa) — TypeScript + xterm + node-pty
├── dashboard/      # Next.js 16 + React 19 + Tailwind 4 — landing page + user dashboard
├── api/            # Express.js — SaaS control plane, auth, billing, provisioning
├── migrations/     # PostgreSQL schema (29 migrations, run in order)
└── docker/         # docker-compose for local dev
```

### Ports
| Service | Port |
|---------|------|
| dashboard (Next.js) | 3000 |
| api (Express) | 4000 |
| container gateway (worker servers) | 18789 |

---

## Architecture

```
[Browser / Valnaa Desktop]
        │ HTTPS / WebSocket
[Dashboard (Next.js)] ←→ [API (Express)]
                               │ SSH / Docker API
                     [Worker Servers]
                       └── One Docker container per user (OpenClaw)
                             └── All AI calls go through platform proxy
```

- The control plane (api/) NEVER runs user containers — only worker servers do.
- Container config (`openclaw.json`) is the source of truth for skills, channels, model preferences.
- Chat UI is the OpenClaw Control UI embedded via iframe — never build a parallel chat implementation.

---

## Model to Use

- **Opus 4.6** — for cross-stack work, debugging, new features, anything spanning more than one service
- **Sonnet 4.6** — for isolated, simple edits (copy, styles, single-function fixes)

---

## Core Development Rules

### 1. No Guessing — Debug Through Logs First

**Before touching any code, find evidence of the problem.**

- Read the relevant logs: API logs, browser console, Electron main process logs, container gateway logs
- Identify the exact error message, stack trace, or unexpected value
- Confirm the root cause from log output before writing a single line of fix
- If logs are insufficient, add temporary logging to surface the real state — then read those logs before fixing

**A fix without log evidence is a guess. Guesses are not allowed.**

### 2. Every Code Change Must Justify Itself

Before making any change, answer:
- What specific log or error proves this change is needed?
- Does this change risk breaking existing functionality?
- What is the minimal change that fixes the confirmed problem?

If a change cannot be justified by evidence from logs or observed behavior, do not make it.

### 3. Preserve Functionality — Question Every Edit

- Never refactor, clean up, or reorganize code unless explicitly asked
- Never add features, error handling, or abstractions beyond what the task requires
- After any change, consider: what user-facing behavior could this break?
- If a change touches a shared utility, route, or component — trace all callers before editing
- When in doubt, ask before modifying

### 4. Minimal Surface Area

Fix the specific thing that is broken. Do not:
- Rewrite surrounding code
- Add comments to code you didn't change
- Rename variables for style
- Add logging that wasn't asked for (beyond temporary debug logs)
- Change imports, exports, or types unrelated to the fix

---

## Desktop App (Valnaa — `desktop/`)

### Build & Dev
- After any TypeScript or renderer change: `cd desktop && npm run build`
- Dev mode with watch: `npm run dev:watch` (loads from `desktop/dist/`)
- `node-pty` is a native module — after any dependency change run Electron rebuild or the PTY will fail silently
- Distribution: `npm run dist:mac` (DMG arm64+x64) / `npm run dist:win` (NSIS x64)
- Auto-updates: GitHub releases at `Skycustody/valnaa-desktop`

### Icons
- `npm run icons:round` — tray: `npm run icons:tray`
- Restore `icon.png` from git **before** re-running (script modifies the file in place)
- macOS tray: `iconTemplate.png` + `iconTemplate@2x.png` — black on transparent, NOT white on black

### Key Files
| File | Purpose |
|------|---------|
| `src/main.ts` | Main process — all IPC handlers, agent lifecycle, setup orchestration (~2,740 lines) |
| `src/preload.ts` | Context-isolated IPC bridge — only safe APIs exposed to renderer |
| `src/lib/runtime.ts` | Docker/NemoClaw sandbox orchestration, port management |
| `src/lib/session.ts` | Auth, subscription check, offline grace period, trial tracking |
| `src/lib/browserSetup.ts` | Chrome extension installation and distribution |
| `src/lib/ports.ts` | Port allocation, conflict resolution, Docker container port freeing |
| `src/openclaw/manager.ts` | OpenClaw/NemoClaw agent process lifecycle + state machine |
| `src/openclaw/installer.ts` | Binary detection and install script execution |
| `src/openclaw/health.ts` | HTTP health polling every 5s on gateway port |
| `src/openclaw/logger.ts` | Dual log system: `openclaw.log` + `app.log` (10MB, 5 rotating files) |

### Two Runtimes
1. **OpenClaw** (cloud): spawns `openclaw gateway --port 18789 --bind loopback` locally, auth via gateway token from API
2. **NemoClaw** (local sandbox): k3d cluster in Docker, SSH tunneling via openshell, NVIDIA inference

### Ports & Constants
- Gateway default: `18789` — relay port: `18792` (gateway + 3)
- Fallback scan: `18790–18799` for free pairs
- Offline grace: **24 hours** from `lastVerifiedAt`
- Subscription recheck: every **2 hours** — rotates gateway token
- Health poll: every **5s**, unhealthy threshold: **30s** → triggers restart
- Max restart attempts: **3** with backoff 2s → 5s → 10s

### IPC Map (renderer ↔ main)
```
agent:status / agent:start / agent:stop / agent:restart / agent:logs / agent:log-path
auth:get-session / auth:start / auth:logout / auth:check-subscription / auth:start-desktop-trial
runtime:get / runtime:set / runtime:clear / runtime:sandbox-name
terminal:spawn / terminal:input / terminal:resize / terminal:kill
openshell:spawn / openshell:input / openshell:resize / openshell:kill
browser:get-chrome-extension-info / browser:reveal-extension-folder / browser:copy-gateway-token
setup:needs-setup / setup:submit-api-key / setup:open-external-task
data:get-paths / data:open-folder / data:delete-agent
settings:set-optional-model-keys
```

### Auth & Session
- Deep link scheme: `valnaa://auth-callback?token=...&email=...`
- Session stored at: `~/.openclaw-desktop/session.json`
- Gateway token written to: `~/.openclaw/openclaw.json` (gateway.auth.token)
- Trial flag (one per machine): `~/.openclaw-desktop/trial-claimed`
- Encrypted API key (NemoClaw): `~/.openclaw-desktop/inference-key.enc` (AES-256-CBC, host-derived key)
- API base: `https://api.valnaa.com` (override: `VALNAA_API_URL` env var)

### Log Locations
```
~/.openclaw-desktop/logs/openclaw.log   — agent stdout/stderr (last 200 lines shown in UI)
~/.openclaw-desktop/logs/app.log        — Valnaa diagnostics (IPC, PTY, setup errors)
```
- Tokens redacted in logs: `--token <redacted>`
- Read logs before any fix — do not guess from code alone

### Agent State Machine
```
stopped → starting → running → (health fails 30s) → crashed
running → stopping → stopped
crashed → starting (auto-restart, max 3)
* → restart → stopping → stopped → starting
```

### Setup Flow (NemoClaw first install, in order)
1. WSL setup (Windows only)
2. Homebrew install (macOS only)
3. Docker install
4. Docker start (auto-launch, wait up to 120s)
5. OpenShell sidecar (Intel Mac only — Docker container `openshell-cli`)
6. Collect API key (NVIDIA/OpenAI/Anthropic — encrypted at rest)
7. NemoClaw install
8. NemoClaw onboard (30–60 min on Intel Mac — do NOT interrupt)
9. Start

**Intel Mac caveat:** `openshell` runs inside a Docker sidecar (`openshell-cli` container). The wrapper script at `~/.local/bin/openshell` calls `docker exec`. If you break the sidecar or the wrapper, NemoClaw setup fails entirely.

### URL Allowlist (open-external — do not open URLs outside this list)
`valnaa.com`, `api.valnaa.com`, `docker.com`, `nvidia.com`, `github.com/NVIDIA`, `platform.openai.com`, `console.anthropic.com`, `stripe.com`, `t.me`, `discord.com`, `docs.openclaw.ai`

### Known Incomplete Areas
- `taskRunsInExternalTerminal()` always returns false — stub, not implemented
- `buildBrowserSetupClipboardBlock()` defined but never called
- No UI to modify inference keys after initial setup (`setOptionalModelKeys` IPC exists but no UI)
- Signal channel: declared in types, zero implementation
- WSL bash sidecar: legacy code paths remain but no longer used

## Dashboard + Landing Page (`dashboard/`)

- Framework: Next.js 16 App Router (not Pages Router) + React 19 + Tailwind 4
- 3D / animations: Three.js + React Three Fiber + Framer Motion
- State: Zustand
- API client: `dashboard/src/lib/api.ts`
- Real-time: Socket.io-client
- Key pages: `/desktop` (Valnaa landing), `/dashboard/*` (17 user dashboard pages), `/pricing`, `/auth`

## API / Control Plane (`api/`)

- Framework: Express.js + TypeScript (tsx for dev, tsc for build)
- Database: PostgreSQL + pgvector
- Cache / queues: Redis + BullMQ
- Payments: Stripe
- Email: Resend
- AI SDKs: `@anthropic-ai/sdk` (Claude) + `openai` (GPT, smart router)
- Provisioning: SSH2 + Hostinger API → creates Docker containers per user
- Token tracking proxy: all user AI calls go through `api/src/routes/proxy.ts`

---

## Hard Rules (from AGENTS.md — never violate)

1. Never call OpenAI/Anthropic directly for user tasks — all AI goes through the container proxy
2. Never build features that bypass the container — use `openclaw run`, gateway WebSocket, or channel adapters
3. `openclaw.json` is the source of truth — always sync DB changes to container config via SSH
4. The control plane never runs user containers — only worker servers do
5. `/auto/run` is legacy/internal only — do not use for new features
6. Skills = OpenClaw tools from the container — do not hardcode skill lists
7. Chat = Control UI iframe — do not build a custom chat UI that calls the API directly

---

## Before Every Fix — Checklist

- [ ] I have read the logs and found the exact error or unexpected value
- [ ] I know which file and line is the root cause
- [ ] My change is the minimum needed to fix the confirmed problem
- [ ] I have considered what existing functionality this change could break
- [ ] If this touches a shared module, I have traced all callers
