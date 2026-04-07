Check the full NemoClaw local setup status and report what's working and what's not.

1. Check Docker is running: `docker ps -a`
2. Check k3d clusters: `k3d cluster list 2>/dev/null || echo "k3d not installed"`
3. Check openshell sidecar: `docker ps -a | grep openshell`
4. Check openshell wrapper: `cat ~/.local/bin/openshell 2>/dev/null || echo "no openshell wrapper"`
5. Check NemoClaw binary: `which nemoclaw 2>/dev/null; nemoclaw --version 2>/dev/null`
6. Check config: `cat ~/.openclaw/openclaw.json 2>/dev/null`
7. Check encrypted inference key: `ls -la ~/.openclaw-desktop/inference-key.enc 2>/dev/null`
8. Read recent logs: last 50 lines of `~/.openclaw-desktop/logs/openclaw.log` and `~/.openclaw-desktop/logs/app.log`

Report a clear status for each component: OK, MISSING, or ERROR (with details).
