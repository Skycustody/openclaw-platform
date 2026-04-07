# Fix: Discord gateway unreachable from NemoClaw sandbox

**Tags:** network-policies, discord, openshell

## The Problem

After setting up NemoClaw and loading the Discord policy preset, the OpenClaw agent inside the sandbox can't reach Discord's WebSocket gateway (`gateway.discord.gg`). The bot token, permissions, and shared secret are all correct, but connections to Discord time out or get refused.

The AI agent itself can't fix this — network policies are enforced outside the sandbox by OpenShell.

## The Cause

NemoClaw's sandbox uses a deny-by-default network policy. Even after selecting "Discord" during onboard, the policy might not have been applied correctly. Common reasons:

1. **Policy application failed silently during onboard** — if the sandbox wasn't fully ready when policies were applied (step 7/7), the preset gets skipped
2. **Policy was applied but missing the `access: full` flag** on `gateway.discord.gg` — Discord's WebSocket needs a CONNECT tunnel, not a REST proxy. The REST proxy's HTTP idle timeout (~2 min) kills the long-lived WebSocket connection
3. **UTM/VM networking adds an extra layer** — the sandbox is inside a k3d cluster, inside Docker, inside a VM. DNS resolution for `gateway.discord.gg` may fail if CoreDNS inside k3d isn't forwarding correctly

## The Fix

### Step 1: Check if the Discord policy is actually applied

```bash
openshell policy get --gateway nemoclaw <your-sandbox-name>
```

Look for `gateway.discord.gg` in the output. If it's missing, the preset wasn't applied.

### Step 2: Apply the Discord preset manually

Create or verify your Discord policy file. The correct policy needs these endpoints:

```yaml
network_policies:
  discord:
    name: discord
    endpoints:
      - host: discord.com
        port: 443
        protocol: rest
        enforcement: enforce
        tls: terminate
        rules:
          - allow: { method: GET, path: "/**" }
          - allow: { method: POST, path: "/**" }
          - allow: { method: PUT, path: "/**" }
          - allow: { method: PATCH, path: "/**" }
          - allow: { method: DELETE, path: "/**" }
      # IMPORTANT: WebSocket gateway MUST use access: full (CONNECT tunnel)
      # The REST proxy has a ~2 min idle timeout that kills WebSocket connections
      - host: gateway.discord.gg
        port: 443
        access: full
      - host: cdn.discordapp.com
        port: 443
        protocol: rest
        enforcement: enforce
        tls: terminate
        rules:
          - allow: { method: GET, path: "/**" }
      - host: media.discordapp.net
        port: 443
        protocol: rest
        enforcement: enforce
        tls: terminate
        rules:
          - allow: { method: GET, path: "/**" }
    binaries:
      - { path: /usr/local/bin/node }
```

Save this as `discord-policy.yaml` and apply it:

```bash
openshell policy set --gateway nemoclaw --policy discord-policy.yaml <your-sandbox-name> --wait --timeout 30
```

### Step 3: Verify DNS resolution inside the sandbox

```bash
openshell ssh <your-sandbox-name> --gateway nemoclaw -- nslookup gateway.discord.gg
```

If DNS fails, CoreDNS inside k3d might need patching (this is done automatically during onboard but can break on VMs):

```bash
openshell ssh <your-sandbox-name> --gateway nemoclaw -- cat /etc/resolv.conf
```

Make sure it points to a working nameserver. On UTM VMs, you may need to ensure the VM's DNS is forwarding to the host.

### Step 4: Test the connection

```bash
openshell ssh <your-sandbox-name> --gateway nemoclaw -- curl -sI https://discord.com/api/v10/gateway
```

You should get a JSON response with a `url` field pointing to `wss://gateway.discord.gg`.

## How to Verify

Once the policy is applied and DNS works:
- The Discord bot should connect and show as online in your server
- Check the agent logs: `openshell ssh <sandbox> --gateway nemoclaw -- cat /sandbox/.openclaw/logs/openclaw.log | tail -50`

## Environment

- **OS:** Any (Ubuntu server VM via UTM in this case)
- **Architecture:** Any
- **Key detail:** UTM VM adds extra network layer — DNS and Docker networking need to pass through correctly
- **NemoClaw version:** Any with OpenShell 0.0.10+
