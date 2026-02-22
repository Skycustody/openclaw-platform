# OpenClaw Platform — Agent Instructions

## Mission

**OpenClaw SaaS = a web UI layer around OpenClaw.**

This platform provisions OpenClaw containers for users and wraps every OpenClaw
CLI capability in a dashboard UI. The platform does NOT implement its own AI
logic, chat pipeline, or skill system. Everything goes through the user's
OpenClaw container.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Dashboard (Next.js)                                     │
│  - Embeds OpenClaw Control UI via iframe for chat       │
│  - Shows container status, skills, channels, settings   │
│  - Manages tokens, billing, admin                       │
└────────────────────┬────────────────────────────────────┘
                     │ REST API
┌────────────────────▼────────────────────────────────────┐
│ Platform API (Express)                                  │
│  - Auth, billing, token management                      │
│  - Provisioning: creates containers on worker servers   │
│  - Proxy: forwards AI calls from containers, tracks     │
│    token usage (val_sk_xxx keys)                        │
│  - Settings/skills/channels: writes openclaw.json to    │
│    host volume via SSH, restarts container               │
└────────────────────┬────────────────────────────────────┘
                     │ SSH / Docker
┌────────────────────▼────────────────────────────────────┐
│ Worker Servers (Hetzner)                                │
│  - Traefik reverse proxy                                │
│  - One Docker container per user running OpenClaw       │
│  - Container gateway on port 18789                      │
│  - WebSocket for Control UI, channel adapters           │
│  - All AI calls go through the platform proxy           │
└─────────────────────────────────────────────────────────┘
```

## Rules for any AI agent modifying this codebase

1. **Never call OpenAI/Anthropic directly for user tasks.** All AI interactions
   go through the user's OpenClaw container, which calls the platform proxy.
2. **Never build features that bypass the container.** If you need the agent to
   do something, send it through the container (via `openclaw run`, the gateway
   WebSocket, or the container's channel adapters).
3. **Container config (`openclaw.json`) is the source of truth** for skills,
   channels, model preferences, and personality. Always sync platform DB
   changes to the container config via SSH.
4. **The control plane server never runs user containers.** Only dedicated
   worker servers run containers.
5. **The `/auto/run` endpoint exists for legacy/internal use only.** Do not use
   it for new features. It will be deprecated.
6. **Skills = OpenClaw tools.** Read them from the container, toggle them in
   `openclaw.json`. Do not hardcode fake skill lists.
7. **Chat = OpenClaw Control UI embedded in an iframe.** Do not build a custom
   chat UI that calls the API directly.
