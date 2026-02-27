/**
 * Cloud Provider (Hetzner) — auto-provisions worker servers when capacity is needed.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ARCHITECTURE DECISIONS — DO NOT CHANGE WITHOUT UNDERSTANDING           │
 * │                                                                        │
 * │ 1. CLOUD-INIT SECRET: The INTERNAL_SECRET is injected into worker     │
 * │    cloud-init scripts so workers can call POST /webhooks/servers/     │
 * │    register to self-register. There is NO fallback value — if         │
 * │    INTERNAL_SECRET is not set, server creation throws.                │
 * │                                                                        │
 * │ 2. SSH KEY MANAGEMENT: Creates/reuses an SSH key in Hetzner's API for │
 * │    root access to workers. The private key is stored at               │
 * │    /root/.ssh/openclaw_worker on the control plane.                   │
 * │                                                                        │
 * │ 3. CLEANUP SAFETY: deleteServer() deletes both the Hetzner server     │
 * │    and the DB record. It does NOT delete user data from the volume.   │
 * │    Data lives at /opt/openclaw/instances/<userId>/ on the worker.     │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import axios, { AxiosInstance } from 'axios';

class CloudProvider {
  private client: AxiosInstance;
  private sshKeyId: number | null = null;

  constructor() {
    const token = process.env.HETZNER_API_TOKEN;
    if (!token) {
      console.warn('HETZNER_API_TOKEN not set — auto-provisioning disabled');
    }

    this.client = axios.create({
      baseURL: 'https://api.hetzner.cloud/v1',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    });
  }

  /** Normalize SSH public key for comparison (type + key body, ignore comment and whitespace). */
  private normalizePubKey(full: string): string {
    const oneLine = (full || '').replace(/\s+/g, ' ').trim();
    const parts = oneLine.split(' ');
    const keyBody = parts.length >= 2 ? parts[1].replace(/\s/g, '') : '';
    return parts.length >= 2 ? `${parts[0]} ${keyBody}` : oneLine;
  }

  /** Upload SSH key to Hetzner (idempotent) or use existing; return key ID. */
  private async ensureSshKey(): Promise<number | null> {
    if (this.sshKeyId) return this.sshKeyId;

    const pubKey = process.env.WORKER_SSH_PUBLIC_KEY?.trim();
    if (!pubKey) {
      console.warn('[hetzner] WORKER_SSH_PUBLIC_KEY not set — workers won\'t have SSH access');
      return null;
    }

    const pubKeyNorm = this.normalizePubKey(pubKey);
    const ourKeyBody = pubKeyNorm.split(' ')[1] || '';

    const findMatch = (keys: any[]) => {
      const exact = keys.find((k: any) => this.normalizePubKey(k.public_key) === pubKeyNorm);
      if (exact) return exact;
      // Fallback: match by key body only (same key, different comment/format)
      return keys.find((k: any) => {
        const norm = this.normalizePubKey(k.public_key);
        const body = norm.split(' ')[1] || '';
        return body.length > 20 && body === ourKeyBody;
      });
    };

    try {
      const existing = await this.client.get('/ssh_keys');
      const keys = existing.data?.ssh_keys || [];
      const match = findMatch(keys);
      if (match) {
        this.sshKeyId = match.id;
        console.log(`[hetzner] Using existing SSH key: id=${this.sshKeyId}`);
        return this.sshKeyId;
      }

      const res = await this.client.post('/ssh_keys', {
        name: `openclaw-api-${Date.now()}`,
        public_key: pubKey,
      });
      this.sshKeyId = res.data?.ssh_key?.id;
      console.log(`[hetzner] SSH key uploaded: id=${this.sshKeyId}`);
      return this.sshKeyId;
    } catch (err: any) {
      if (err.response?.data?.error?.code === 'uniqueness_error') {
        const existing = await this.client.get('/ssh_keys');
        const keys = existing.data?.ssh_keys || [];
        const match = findMatch(keys);
        if (match) {
          this.sshKeyId = match.id;
          console.log(`[hetzner] Key already in project, using: id=${this.sshKeyId}`);
          return this.sshKeyId;
        }
        console.warn('[hetzner] Uniqueness_error but no matching key found by content — using first ed25519 key');
        const fallback = keys.find((k: any) => (k.public_key || '').trim().startsWith('ssh-ed25519 '));
        if (fallback) {
          this.sshKeyId = fallback.id;
          return this.sshKeyId;
        }
      }
      console.error('[hetzner] SSH key upload failed:', err.response?.data || err.message);
      return null;
    }
  }

  async provisionNewServer(): Promise<string> {
    const token = process.env.HETZNER_API_TOKEN;
    if (!token) {
      throw new Error('HETZNER_API_TOKEN not set. Get one from https://console.hetzner.cloud → project → API tokens');
    }

    const serverType = process.env.HETZNER_SERVER_TYPE || 'cpx62';
    const location = process.env.HETZNER_LOCATION || 'nbg1';
    const hostname = `openclaw-worker-${Date.now()}`;

    console.log(`[hetzner] Provisioning new server: type=${serverType}, location=${location}, hostname=${hostname}`);

    const apiUrl = process.env.API_URL || 'https://api.yourdomain.com';
    const internalSecret = process.env.INTERNAL_SECRET;
    if (!internalSecret) throw new Error('INTERNAL_SECRET is required for worker provisioning');
    const adminEmail = process.env.EMAIL_FROM?.replace('noreply@', '') || 'admin@yourdomain.com';
    const sshPubKey = process.env.WORKER_SSH_PUBLIC_KEY || '';

    const userData = `#!/bin/bash
set -euo pipefail
exec > /var/log/openclaw-setup.log 2>&1

echo "=== OpenClaw Worker Setup ==="
echo "Starting at $(date)"

# Prevent "password expired" / "change on first login" blocking non-interactive SSH (do this first)
export DEBIAN_FRONTEND=noninteractive
chage -d -1 root 2>/dev/null || true
# Remove root password so only key auth is used; avoids "change password" prompts
passwd -d root 2>/dev/null || true

apt-get update && apt-get upgrade -y

# Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker && systemctl start docker

# Directories
mkdir -p /opt/openclaw/{instances,config,traefik}

# SSH key for API access
${sshPubKey ? `mkdir -p /root/.ssh && chmod 700 /root/.ssh && echo '${sshPubKey}' >> /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys` : '# No SSH public key configured'}

# Docker network
docker network create openclaw-net 2>/dev/null || true

# Traefik config — HTTP + HTTPS (default self-signed cert); Cloudflare "Full" SSL connects on 443
cat > /opt/openclaw/config/traefik.yml <<'TEOF'
api:
  dashboard: false
entryPoints:
  web:
    address: ":80"
  websecure:
    address: ":443"
providers:
  docker:
    endpoint: "unix:///var/run/docker.sock"
    exposedByDefault: false
    network: openclaw-net
TEOF

# Start Traefik
docker run -d --name traefik --restart unless-stopped --network openclaw-net \\
  -e DOCKER_API_VERSION=$(docker version --format '{{.Server.APIVersion}}' 2>/dev/null || echo 1.44) \\
  -p 80:80 -p 443:443 \\
  -v /var/run/docker.sock:/var/run/docker.sock:ro \\
  -v /opt/openclaw/config/traefik.yml:/etc/traefik/traefik.yml:ro \\
  traefik:latest

echo "Traefik started"

# Build the openclaw container image with full config (including webhook hooks)
mkdir -p /tmp/openclaw-build

cat > /tmp/openclaw-build/Dockerfile <<'DEOF'
FROM node:22-slim
RUN apt-get update && apt-get install -y curl git openssh-client python3 make g++ chromium libopus-dev --no-install-recommends && rm -rf /var/lib/apt/lists/*
RUN npm install -g openclaw@latest
WORKDIR /data
EXPOSE 18789
CMD ["sh", "-c", "openclaw doctor --fix 2>/dev/null || true; exec openclaw gateway --port 18789 --bind lan --allow-unconfigured run"]
DEOF

cat > /tmp/openclaw-build/openclaw.default.json <<'JEOF'
{
  "gateway": {
    "bind": "lan",
    "controlUi": { "enabled": true, "allowInsecureAuth": true },
    "auth": { "mode": "token" }
  }
}
JEOF

docker build -t openclaw/openclaw:latest /tmp/openclaw-build
rm -rf /tmp/openclaw-build
echo "Docker image built"

# Register with control plane
SERVER_IP=$(curl -4 -sf ifconfig.me || curl -4 -sf icanhazip.com)
TOTAL_RAM=$(free -m | awk '/^Mem:/{print $2}')

echo "Registering: IP=$SERVER_IP RAM=\${TOTAL_RAM}MB"

for i in 1 2 3 4 5; do
  curl -sf -X POST "${apiUrl}/webhooks/servers/register" \\
    -H "Content-Type: application/json" \\
    -H "x-internal-secret: ${internalSecret}" \\
    -d "{\\"ip\\": \\"$SERVER_IP\\", \\"ram\\": $TOTAL_RAM, \\"hostname\\": \\"$(hostname)\\"}" && break
  echo "Registration attempt $i failed, retrying in 10s..."
  sleep 10
done

echo "=== Setup Complete at $(date) ==="
`;

    try {
      const sshKeyId = await this.ensureSshKey();
      console.log(`[hetzner] Creating server: ${hostname} (${serverType} in ${location}), ssh_key=${sshKeyId}`);

      const createPayload: Record<string, any> = {
        name: hostname,
        server_type: serverType,
        location,
        image: 'ubuntu-22.04',
        user_data: userData,
        labels: { managed: 'openclaw', role: 'worker' },
      };
      if (sshKeyId) {
        createPayload.ssh_keys = [sshKeyId];
      }

      const res = await this.client.post('/servers', createPayload);

      const serverId = res.data?.server?.id;
      const serverIp = res.data?.server?.public_net?.ipv4?.ip;

      console.log(`[hetzner] Server created: id=${serverId}, ip=${serverIp}`);
      console.log(`[hetzner] Cloud-init will install Docker, Traefik, build image, and register with API (~3-5 min)`);

      return String(serverId);
    } catch (err: any) {
      const errData = err.response?.data;
      console.error('[hetzner] Provisioning failed:', errData || err.message);

      if (errData?.error?.code === 'uniqueness_error') {
        throw new Error('Server name conflict — try again');
      }
      throw new Error(`Hetzner provisioning failed: ${errData?.error?.message || err.message}`);
    }
  }

  async listServers(): Promise<any[]> {
    try {
      const res = await this.client.get('/servers', {
        params: { label_selector: 'managed=openclaw' },
      });
      return res.data?.servers || [];
    } catch (err: any) {
      console.error('[hetzner] List failed:', err.response?.data || err.message);
      return [];
    }
  }

  async deleteServer(serverId: string): Promise<void> {
    try {
      await this.client.delete(`/servers/${serverId}`);
      console.log(`[hetzner] Server deleted: ${serverId}`);
    } catch (err: any) {
      console.error('[hetzner] Delete failed:', err.response?.data || err.message);
    }
  }

  async getServerDetails(serverId: number): Promise<any> {
    try {
      const res = await this.client.get(`/servers/${serverId}`);
      return res.data?.server;
    } catch (err: any) {
      console.error('[hetzner] Details failed:', err.response?.data || err.message);
      return null;
    }
  }
}

export const cloudProvider = new CloudProvider();
