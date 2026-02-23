import { Client } from 'ssh2';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';

const SSH_TIMEOUT = 30000;

/** Resolve private key: SSH_PRIVATE_KEY (base64) or SSH_PRIVATE_KEY_PATH (file path). */
function getPrivateKey(): Buffer | string | undefined {
  const raw = process.env.SSH_PRIVATE_KEY;
  if (raw) {
    const b64 = raw.replace(/\s/g, '');
    try {
      return Buffer.from(b64, 'base64');
    } catch {
      // not valid base64, ignore
    }
  }
  const keyPath = process.env.SSH_PRIVATE_KEY_PATH?.trim();
  if (keyPath && fs.existsSync(keyPath)) {
    try {
      return fs.readFileSync(keyPath, 'utf8');
    } catch (e) {
      console.error('[SSH] Failed to read SSH_PRIVATE_KEY_PATH:', (e as Error).message);
    }
  }
  return undefined;
}
const MAX_RETRIES = 3;

interface SSHExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export async function sshExec(
  ip: string,
  command: string,
  retries = MAX_RETRIES
): Promise<SSHExecResult> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await execOnce(ip, command);
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(`SSH attempt ${attempt} failed for ${ip}, retrying...`);
      await sleep(1000 * attempt);
    }
  }
  throw new Error('SSH exec failed after retries');
}

function execOnce(ip: string, command: string): Promise<SSHExecResult> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timeout = setTimeout(() => {
      conn.end();
      reject(new Error(`SSH timeout connecting to ${ip}`));
    }, SSH_TIMEOUT);

    // When the target is the control plane (this host), SSH to 127.0.0.1 so auth works
    const controlPlaneIp = process.env.CONTROL_PLANE_IP?.trim();
    const host = controlPlaneIp && ip === controlPlaneIp ? '127.0.0.1' : ip;
    if (host !== ip) {
      console.log(`[SSH] Target ${ip} is control plane, using 127.0.0.1`);
    }

    conn
      .on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timeout);
            conn.end();
            reject(err);
            return;
          }

          let stdout = '';
          let stderr = '';

          stream
            .on('data', (data: Buffer) => {
              stdout += data.toString();
            })
            .stderr.on('data', (data: Buffer) => {
              stderr += data.toString();
            });

          stream.on('close', (code: number) => {
            clearTimeout(timeout);
            conn.end();
            resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code });
          });
        });
      })
      .on('error', (err) => {
        clearTimeout(timeout);
        console.error(`[SSH] ${host} error:`, err.message);
        reject(err);
      })
      .connect({
        host,
        port: 22,
        username: 'root',
        privateKey: getPrivateKey(),
        readyTimeout: SSH_TIMEOUT,
      });
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export interface SSHStream extends EventEmitter {
  /** Write data to stdin of the remote command */
  write(data: string): void;
  /** Close stdin and let the command finish */
  closeStdin(): void;
  /** Kill the SSH connection */
  kill(): void;
}

/**
 * Execute a command over SSH and stream stdout/stderr chunks as they arrive.
 * Returns an EventEmitter that fires:
 *   'data'  (chunk: string) — stdout chunk
 *   'error' (err: Error)    — connection or exec error
 *   'close' (code: number)  — command finished
 *
 * Also exposes write() to send data to the remote command's stdin.
 */
export function sshExecStream(ip: string, command: string, stdinData?: string): SSHStream {
  const emitter = new EventEmitter() as SSHStream;
  const conn = new Client();

  const STREAM_TIMEOUT = 180_000;
  const timeout = setTimeout(() => {
    conn.end();
    emitter.emit('error', new Error(`SSH stream timeout for ${ip}`));
  }, STREAM_TIMEOUT);

  const controlPlaneIp = process.env.CONTROL_PLANE_IP?.trim();
  const host = controlPlaneIp && ip === controlPlaneIp ? '127.0.0.1' : ip;

  conn
    .on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          conn.end();
          emitter.emit('error', err);
          return;
        }

        emitter.write = (data: string) => {
          stream.write(data);
        };
        emitter.closeStdin = () => {
          stream.end();
        };
        emitter.kill = () => {
          clearTimeout(timeout);
          stream.close();
          conn.end();
        };

        stream.on('data', (data: Buffer) => {
          emitter.emit('data', data.toString());
        });
        stream.stderr.on('data', (data: Buffer) => {
          emitter.emit('data', data.toString());
        });
        stream.on('close', (code: number) => {
          clearTimeout(timeout);
          conn.end();
          emitter.emit('close', code);
        });

        if (stdinData) {
          stream.write(stdinData);
          stream.end();
        }
      });
    })
    .on('error', (err) => {
      clearTimeout(timeout);
      emitter.emit('error', err);
    })
    .connect({
      host,
      port: 22,
      username: 'root',
      privateKey: getPrivateKey(),
      readyTimeout: SSH_TIMEOUT,
    });

  emitter.write = () => {};
  emitter.closeStdin = () => {};
  emitter.kill = () => { conn.end(); };

  return emitter;
}

const SFTP_TIMEOUT = 120_000;

/**
 * Upload a local directory to the remote host over SFTP.
 * Used to copy verified skills from the control plane to a worker.
 */
export async function sshUploadDir(
  ip: string,
  localDir: string,
  remoteDir: string
): Promise<void> {
  if (!fs.existsSync(localDir) || !fs.statSync(localDir).isDirectory()) {
    throw new Error(`Local path is not a directory: ${localDir}`);
  }

  const controlPlaneIp = process.env.CONTROL_PLANE_IP?.trim();
  const host = controlPlaneIp && ip === controlPlaneIp ? '127.0.0.1' : ip;

  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timeout = setTimeout(() => {
      conn.end();
      reject(new Error(`SFTP timeout for ${ip}`));
    }, SFTP_TIMEOUT);

    conn
      .on('ready', () => {
        conn.sftp((err, sftp) => {
          if (err) {
            clearTimeout(timeout);
            conn.end();
            reject(err);
            return;
          }

          function ensureRemoteDir(remotePath: string): Promise<void> {
            const parts = remotePath.split('/').filter(Boolean);
            let p = '';
            const chain: Promise<void>[] = [];
            for (const part of parts) {
              p += '/' + part;
              chain.push(
                new Promise((res, rej) => {
                  sftp.mkdir(p, { mode: 0o755 }, (e) => {
                    if (e && e.code !== 4) res(undefined); // 4 = already exists
                    else if (e) rej(e);
                    else res(undefined);
                  });
                })
              );
            }
            return Promise.all(chain).then(() => undefined);
          }

          function uploadFile(localPath: string, remotePath: string): Promise<void> {
            return new Promise((res, rej) => {
              const remoteDirPath = path.dirname(remotePath);
              ensureRemoteDir(remoteDirPath)
                .then(() => {
                  const readStream = fs.createReadStream(localPath);
                  const writeStream = sftp.createWriteStream(remotePath, { mode: 0o644 });
                  readStream.pipe(writeStream);
                  writeStream.on('close', () => res(undefined));
                  writeStream.on('error', rej);
                  readStream.on('error', rej);
                })
                .catch(rej);
            });
          }

          function walk(dir: string, base = ''): string[] {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            const files: string[] = [];
            for (const e of entries) {
              const rel = path.join(base, e.name);
              const full = path.join(dir, e.name);
              if (e.isDirectory()) {
                files.push(...walk(full, rel));
              } else {
                files.push(rel);
              }
            }
            return files;
          }

          const relFiles = walk(localDir);
          if (relFiles.length === 0) {
            clearTimeout(timeout);
            conn.end();
            resolve();
            return;
          }

          Promise.all(
            relFiles.map((rel) => {
              const localPath = path.join(localDir, rel);
              const remotePath = path.join(remoteDir, rel).replace(/\\/g, '/');
              return uploadFile(localPath, remotePath);
            })
          )
            .then(() => {
              clearTimeout(timeout);
              conn.end();
              resolve();
            })
            .catch((e) => {
              clearTimeout(timeout);
              conn.end();
              reject(e);
            });
        });
      })
      .on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      })
      .connect({
        host,
        port: 22,
        username: 'root',
        privateKey: getPrivateKey(),
        readyTimeout: SSH_TIMEOUT,
      });
  });
}

export async function waitForReady(ip: string, containerName: string, timeoutMs = 60000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const result = await sshExec(ip, `docker inspect --format='{{.State.Health.Status}}' ${containerName}`);
      if (result.stdout.includes('healthy')) return;
      if (result.code === 0 && !result.stdout.includes('unhealthy')) {
        const portCheck = await sshExec(ip, `docker exec ${containerName} openclaw health 2>/dev/null`);
        if (portCheck.code === 0) return;
      }
    } catch {
      // Container not ready yet
    }
    await sleep(2000);
  }
  throw new Error(`Container ${containerName} did not become ready within ${timeoutMs}ms`);
}
