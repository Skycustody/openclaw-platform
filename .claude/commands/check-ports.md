Check for port conflicts on OpenClaw/NemoClaw ports.

1. Check gateway port range: `lsof -i :18789-18799 2>/dev/null`
2. Check dashboard port: `lsof -i :3000 2>/dev/null`
3. Check API port: `lsof -i :4000 2>/dev/null`
4. Check Docker port mappings: `docker ps --format "{{.Ports}}" 2>/dev/null`

Report any conflicts or unexpected processes holding these ports.
