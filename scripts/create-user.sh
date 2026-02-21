#!/bin/bash
# Creates an OpenClaw container for a new user
set -euo pipefail

USER_ID="${1:?Usage: create-user.sh USER_ID PLAN S3_BUCKET DOMAIN API_URL}"
PLAN="${2:-pro}"
S3_BUCKET="${3:-openclaw-default}"
DOMAIN="${4:-yourdomain.com}"
API_URL="${5:-https://api.yourdomain.com}"
BROWSERLESS_URL="${6:-}"

CONTAINER_NAME="openclaw-${USER_ID:0:12}"

# Set resource limits based on plan
case $PLAN in
  starter)  MEM='1g';  CPUS='0.25' ;;
  pro)      MEM='2g';  CPUS='0.5'  ;;
  business) MEM='4g';  CPUS='1.0'  ;;
  *)        MEM='2g';  CPUS='0.5'  ;;
esac

echo "Creating container: $CONTAINER_NAME (plan=$PLAN, mem=$MEM, cpus=$CPUS)"

# Create user data directory
mkdir -p "/opt/openclaw/instances/$USER_ID"

# Pull user config from API
curl -sf "$API_URL/users/$USER_ID/config" \
  -H "x-internal-secret: ${INTERNAL_SECRET:-changeme}" \
  > "/opt/openclaw/instances/$USER_ID/openclaw.json" 2>/dev/null || echo '{}' > "/opt/openclaw/instances/$USER_ID/openclaw.json"

# Stop existing container if any
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true

# Start the container
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --network openclaw-net \
  --memory "$MEM" \
  --cpus "$CPUS" \
  --memory-swap "${MEM}" \
  -e "USER_ID=$USER_ID" \
  -e "S3_BUCKET=$S3_BUCKET" \
  -e "PLATFORM_API=$API_URL" \
  -e "BROWSERLESS_URL=$BROWSERLESS_URL" \
  -v "/opt/openclaw/instances/$USER_ID:/data" \
  --label traefik.enable=true \
  --label "traefik.http.routers.${CONTAINER_NAME}.rule=Host(\`${USER_ID:0:12}.${DOMAIN}\`)" \
  --label "traefik.http.routers.${CONTAINER_NAME}.tls=true" \
  --label "traefik.http.routers.${CONTAINER_NAME}.tls.certresolver=letsencrypt" \
  --label "traefik.http.services.${CONTAINER_NAME}.loadbalancer.server.port=18789" \
  --health-cmd="curl -sf http://localhost:18789/health || exit 1" \
  --health-interval=30s \
  --health-timeout=10s \
  --health-retries=3 \
  "${DOCKER_REGISTRY:-openclaw/openclaw}:latest"

echo "Container started: $CONTAINER_NAME"
echo "URL: https://${USER_ID:0:12}.${DOMAIN}"

# Wait for health check
echo "Waiting for container to be ready..."
for i in $(seq 1 30); do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "starting")
  if [ "$STATUS" = "healthy" ]; then
    echo "Container is healthy!"
    exit 0
  fi
  sleep 2
done

echo "WARNING: Container did not become healthy within 60s (may still be starting)"
exit 0
