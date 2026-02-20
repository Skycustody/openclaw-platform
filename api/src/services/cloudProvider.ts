import axios, { AxiosInstance } from 'axios';

class CloudProvider {
  private client: AxiosInstance;

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

  async provisionNewServer(): Promise<string> {
    const token = process.env.HETZNER_API_TOKEN;
    if (!token) {
      throw new Error('HETZNER_API_TOKEN not set. Get one from https://console.hetzner.cloud → project → API tokens');
    }

    const serverType = process.env.HETZNER_SERVER_TYPE || 'cpx31';
    const location = process.env.HETZNER_LOCATION || 'ash';
    const hostname = `openclaw-worker-${Date.now()}`;

    const apiUrl = process.env.API_URL || 'https://api.yourdomain.com';
    const internalSecret = process.env.INTERNAL_SECRET || 'changeme';
    const adminEmail = process.env.EMAIL_FROM?.replace('noreply@', '') || 'admin@yourdomain.com';
    const sshPubKey = process.env.WORKER_SSH_PUBLIC_KEY || '';

    const userData = `#!/bin/bash
set -euo pipefail
exec > /var/log/openclaw-setup.log 2>&1

echo "=== OpenClaw Worker Setup ==="
echo "Starting at $(date)"

export DEBIAN_FRONTEND=noninteractive
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

# Traefik config — HTTP auto-redirects to HTTPS, Let's Encrypt for certs
cat > /opt/openclaw/config/traefik.yml <<'TEOF'
api:
  dashboard: false
entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
  websecure:
    address: ":443"
providers:
  docker:
    endpoint: "unix:///var/run/docker.sock"
    exposedByDefault: false
    network: openclaw-net
certificatesResolvers:
  letsencrypt:
    acme:
      email: ${adminEmail}
      storage: /opt/openclaw/traefik/acme.json
      httpChallenge:
        entryPoint: web
TEOF

touch /opt/openclaw/traefik/acme.json
chmod 600 /opt/openclaw/traefik/acme.json

# Start Traefik
docker run -d --name traefik --restart unless-stopped --network openclaw-net \\
  -p 80:80 -p 443:443 \\
  -v /var/run/docker.sock:/var/run/docker.sock:ro \\
  -v /opt/openclaw/config/traefik.yml:/traefik.yml:ro \\
  -v /opt/openclaw/traefik/acme.json:/opt/openclaw/traefik/acme.json \\
  traefik:v3.0

echo "Traefik started"

# Build the openclaw container image with full config (including webhook hooks)
mkdir -p /tmp/openclaw-build

cat > /tmp/openclaw-build/Dockerfile <<'DEOF'
FROM node:22-slim
RUN apt-get update && apt-get install -y curl git && rm -rf /var/lib/apt/lists/*
RUN npm install -g openclaw@latest
WORKDIR /data
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD openclaw health || exit 1
EXPOSE 18789
CMD ["openclaw", "gateway", "--port", "18789", "run"]
DEOF

cat > /tmp/openclaw-build/openclaw.default.json <<'JEOF'
{
  "server": {
    "port": 18789,
    "host": "0.0.0.0"
  },
  "browser": {
    "enabled": true,
    "defaultProfile": "browserless",
    "profiles": {
      "browserless": {
        "type": "cdp",
        "cdpUrl": "\${BROWSERLESS_URL}"
      }
    }
  },
  "memory": {
    "enabled": true,
    "maxItems": 2000
  },
  "hooks": {
    "onMessage": {
      "url": "\${PLATFORM_API}/webhooks/container/message",
      "headers": {
        "x-internal-secret": "\${INTERNAL_SECRET}"
      }
    }
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
      console.log(`[hetzner] Creating server: ${hostname} (${serverType} in ${location})`);

      const res = await this.client.post('/servers', {
        name: hostname,
        server_type: serverType,
        location,
        image: 'ubuntu-22.04',
        user_data: userData,
        labels: { managed: 'openclaw', role: 'worker' },
      });

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
