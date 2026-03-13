import { sshExec } from './ssh';
import db from '../lib/db';

const OPENCLAW_IMAGE = `${process.env.DOCKER_REGISTRY || 'openclaw/openclaw'}:latest`;

function getDockerfile(): string {
  return [
    'FROM node:22-slim',
    'RUN apt-get update && apt-get install -y ca-certificates curl git python3 make g++ chromium libopus-dev --no-install-recommends && rm -rf /var/lib/apt/lists/*',
    'RUN git config --global url.https://github.com/.insteadOf ssh://git@github.com/ && git config --global --add url.https://github.com/.insteadOf git@github.com: && npm install -g openclaw@latest',
    'WORKDIR /data',
    'EXPOSE 18789',
    'CMD ["sh", "-c", "exec openclaw gateway --port 18789 --bind lan --allow-unconfigured run"]',
  ].join('\n');
}

/**
 * Ensure the OpenClaw Docker image exists on a worker.
 * Only builds if the image is missing — fast for normal provisioning.
 */
export async function ensureDockerImage(serverIp: string): Promise<void> {
  if (process.env.DOCKER_REGISTRY) {
    const pullResult = await sshExec(serverIp, `docker pull ${OPENCLAW_IMAGE}`);
    if (pullResult.code === 0) return;
    console.warn(`[ensureDockerImage] pull failed, will try local build`);
  }

  const imageCheck = await sshExec(serverIp, `docker image inspect ${OPENCLAW_IMAGE} > /dev/null 2>&1 && echo OK || echo MISSING`);
  if (!imageCheck.stdout.includes('MISSING')) return;

  console.log(`[ensureDockerImage] Building ${OPENCLAW_IMAGE} on ${serverIp}...`);
  await buildImage(serverIp, false);
}

/**
 * Force-rebuild the image with --no-cache on a specific worker.
 * Used by admin "Update OpenClaw" action to get the latest version.
 */
export async function forceUpdateImage(serverIp: string): Promise<void> {
  console.log(`[forceUpdateImage] Rebuilding ${OPENCLAW_IMAGE} on ${serverIp} with --no-cache...`);
  await buildImage(serverIp, true);
}

/**
 * Force-rebuild the image on ALL active workers, then restart every running container.
 */
export async function updateImageOnAllWorkers(): Promise<{ updated: string[]; failed: string[] }> {
  const servers = await db.getMany<{ ip: string }>(
    `SELECT ip FROM servers WHERE status = 'active'`
  );

  const updated: string[] = [];
  const failed: string[] = [];

  for (const s of servers) {
    try {
      await forceUpdateImage(s.ip);

      const containers = await sshExec(s.ip,
        `docker ps --filter name=openclaw- --format '{{.Names}}' | grep -v traefik`
      );
      const names = containers.stdout.trim().split('\n').filter(Boolean);
      if (names.length > 0) {
        const restartCmd = names.map(n => `docker restart ${n}`).join(' && ');
        await sshExec(s.ip, restartCmd);
        console.log(`[updateImage] Restarted ${names.length} containers on ${s.ip}`);
      }

      updated.push(s.ip);
    } catch (err: any) {
      console.error(`[updateImage] Failed on ${s.ip}:`, err.message);
      failed.push(s.ip);
    }
  }

  return { updated, failed };
}

async function buildImage(serverIp: string, noCache: boolean): Promise<void> {
  const dockerfileB64 = Buffer.from(getDockerfile()).toString('base64');
  const cacheFlag = noCache ? ' --no-cache' : '';
  const buildCmd = [
    `mkdir -p /tmp/oc-build`,
    `echo '${dockerfileB64}' | base64 -d > /tmp/oc-build/Dockerfile`,
    `docker build${cacheFlag} -t ${OPENCLAW_IMAGE} /tmp/oc-build`,
    `rm -rf /tmp/oc-build`,
  ].join(' && ');
  const buildResult = await sshExec(serverIp, buildCmd);
  if (buildResult.code !== 0) {
    throw new Error(`Docker image build failed on ${serverIp}: ${buildResult.stderr}`);
  }
  console.log(`[buildImage] ${OPENCLAW_IMAGE} built on ${serverIp}`);
}
