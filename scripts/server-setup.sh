#!/bin/bash
# OpenClaw Server Post-Install Script
# Runs automatically on every new Hostinger VPS via post-install hook
set -euo pipefail

echo "=== OpenClaw Server Setup ==="
echo "Starting at $(date)"

# ── System Updates ──
apt update && apt upgrade -y

# ── Install Docker ──
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  usermod -aG docker root
  systemctl enable docker
  systemctl start docker
  echo "Docker installed"
fi

# ── Install Docker Compose ──
if ! command -v docker-compose &> /dev/null; then
  apt install -y docker-compose
  echo "Docker Compose installed"
fi

# ── Install Node.js 20 ──
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
  echo "Node.js installed: $(node -v)"
fi

# ── Install system monitoring ──
apt install -y htop iotop curl jq

# ── Create directory structure ──
mkdir -p /opt/openclaw/{instances,scripts,logs,config,traefik}

# ── Configure Traefik ──
cat > /opt/openclaw/config/traefik.yml <<'TRAEFIK'
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
      email: "${ADMIN_EMAIL:-nanamacbride59@gmail.com}"
      storage: /opt/openclaw/traefik/acme.json
      httpChallenge:
        entryPoint: web
TRAEFIK

touch /opt/openclaw/traefik/acme.json
chmod 600 /opt/openclaw/traefik/acme.json

# ── Create Docker network ──
docker network create openclaw-net 2>/dev/null || true

# ── Start Traefik reverse proxy ──
docker rm -f traefik 2>/dev/null || true
docker run -d \
  --name traefik \
  --restart unless-stopped \
  --network openclaw-net \
  -p 80:80 -p 443:443 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v /opt/openclaw/config/traefik.yml:/traefik.yml:ro \
  -v /opt/openclaw/traefik/acme.json:/opt/openclaw/traefik/acme.json \
  traefik:v3.0

echo "Traefik started"

# ── Configure system limits ──
cat >> /etc/sysctl.conf <<'SYSCTL'
net.core.somaxconn=65535
net.ipv4.tcp_max_syn_backlog=65535
vm.overcommit_memory=1
SYSCTL
sysctl -p

# ── Configure logrotate for container logs ──
cat > /etc/logrotate.d/docker-containers <<'LOGROTATE'
/var/lib/docker/containers/*/*.log {
  rotate 7
  daily
  compress
  size=10M
  missingok
  delaycompress
  copytruncate
}
LOGROTATE

# ── Register with control plane ──
SERVER_IP=$(curl -sf ifconfig.me)
TOTAL_RAM=$(free -m | awk '/^Mem:/{print $2}')

echo "Registering server: IP=$SERVER_IP RAM=${TOTAL_RAM}MB"

curl -sf -X POST "${PLATFORM_API:-https://api.yourdomain.com}/webhooks/servers/register" \
  -H "Content-Type: application/json" \
  -H "x-internal-secret: ${INTERNAL_SECRET:-changeme}" \
  -d "{
    \"ip\": \"$SERVER_IP\",
    \"ram\": $TOTAL_RAM,
    \"hostname\": \"$(hostname)\"
  }" || echo "WARNING: Failed to register with control plane"

echo "=== Server Setup Complete ==="
echo "Finished at $(date)"
