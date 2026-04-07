Read the OpenClaw desktop logs and API logs to diagnose the current issue.

1. Read `~/.openclaw-desktop/logs/openclaw.log` (last 100 lines)
2. Read `~/.openclaw-desktop/logs/app.log` (last 100 lines)
3. Check if the agent process is running: `ps aux | grep openclaw`
4. Check if Docker is running: `docker ps`
5. Check gateway port status: `lsof -i :18789`

Summarize what you find — identify errors, warnings, and unexpected state. Do NOT suggest fixes yet, just report the evidence.
