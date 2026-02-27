import { sshExec } from './ssh';

/**
 * Ensure the OpenClaw Docker image exists on a worker.
 * Builds from scratch if missing (node:22-slim + openclaw + chromium).
 * Idempotent — safe to call multiple times.
 */
export async function ensureDockerImage(serverIp: string): Promise<void> {
  const image = `${process.env.DOCKER_REGISTRY || 'openclaw/openclaw'}:latest`;

  if (process.env.DOCKER_REGISTRY) {
    const pullResult = await sshExec(serverIp, `docker pull ${image}`);
    if (pullResult.code === 0) return;
    console.warn(`[ensureDockerImage] pull failed, will try local build`);
  }

  const imageCheck = await sshExec(serverIp, `docker image inspect ${image} > /dev/null 2>&1 && echo OK || echo MISSING`);
  if (!imageCheck.stdout.includes('MISSING')) return;

  console.log(`[ensureDockerImage] Building ${image} on ${serverIp}...`);
  const dockerfile = [
    'FROM node:22-slim',
    'RUN apt-get update && apt-get install -y curl git python3 make g++ chromium libopus-dev --no-install-recommends && rm -rf /var/lib/apt/lists/*',
    'RUN printf \'[url "https://github.com/"]\\n\\tinsteadOf = ssh://git@github.com/\\n\\tinsteadOf = git@github.com:\\n\' > /root/.gitconfig && npm install -g openclaw@latest',
    'WORKDIR /data',
    'EXPOSE 18789',
    'CMD ["sh", "-c", "exec openclaw gateway --port 18789 --bind lan --allow-unconfigured run"]',
  ].join('\n');
  const dockerfileB64 = Buffer.from(dockerfile).toString('base64');
  const buildCmd = [
    `mkdir -p /tmp/oc-build`,
    `echo '${dockerfileB64}' | base64 -d > /tmp/oc-build/Dockerfile`,
    `docker build -t ${image} /tmp/oc-build`,
    `rm -rf /tmp/oc-build`,
  ].join(' && ');
  const buildResult = await sshExec(serverIp, buildCmd);
  if (buildResult.code !== 0) {
    throw new Error(`Docker image build failed on ${serverIp}: ${buildResult.stderr}`);
  }
  console.log(`[ensureDockerImage] ${image} built successfully on ${serverIp}`);
}
