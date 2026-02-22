/**
 * Files routes — manages files in the user's OpenClaw container workspace.
 *
 * This wraps the container's workspace directory (~/.openclaw/workspace)
 * which is mounted at /opt/openclaw/instances/<userId>/workspace on the host.
 * Files placed here are accessible to the agent via its file tools.
 */
import { Router, Response, NextFunction } from 'express';
import path from 'path';
import { AuthRequest, authenticate, requireActiveSubscription } from '../middleware/auth';
import { getUserContainer } from '../services/containerConfig';
import { sshExec } from '../services/ssh';

const router = Router();
router.use(authenticate);
router.use(requireActiveSubscription);

const INSTANCE_DIR = '/opt/openclaw/instances';
const MAX_UPLOAD_SIZE_B64 = 10_000_000; // ~7.5MB decoded
const MAX_FILENAME_LENGTH = 255;
const BASE64_RE = /^[A-Za-z0-9+/\n\r]+=*$/;
const UUID_RE = /^[a-f0-9\-]{36}$/;

/** Escape a string for safe use inside single-quoted shell arguments. */
function shellEscape(s: string): string {
  return s.replace(/'/g, "'\\''");
}

/**
 * Resolve and validate a filename within the user's workspace.
 * Prevents path traversal by resolving to an absolute path and
 * confirming it stays within the workspace directory.
 */
function resolveWorkspacePath(userId: string, fileName: string): string {
  if (!UUID_RE.test(userId)) throw new Error('Invalid user ID');

  const wsDir = `${INSTANCE_DIR}/${userId}/workspace`;
  const decoded = decodeURIComponent(fileName);
  const resolved = path.resolve(wsDir, decoded);

  if (!resolved.startsWith(wsDir + '/') && resolved !== wsDir) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

interface WorkspaceFile {
  name: string;
  size: number;
  modified: string;
  type: 'file' | 'directory';
}

function guessMimeType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    txt: 'text/plain', md: 'text/markdown', json: 'application/json',
    js: 'text/javascript', ts: 'text/typescript', py: 'text/x-python',
    html: 'text/html', css: 'text/css', csv: 'text/csv',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    pdf: 'application/pdf', xml: 'application/xml', yaml: 'application/yaml',
    yml: 'application/yaml', sh: 'text/x-shellscript',
  };
  return map[ext] || 'application/octet-stream';
}

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { serverIp } = await getUserContainer(req.userId!);
    const wsDir = shellEscape(`${INSTANCE_DIR}/${req.userId}/workspace`);

    await sshExec(serverIp, `mkdir -p '${wsDir}'`);

    const result = await sshExec(
      serverIp,
      `find '${wsDir}' -maxdepth 2 -not -path '*/\\.*' -not -name '.*' -printf '%y %s %T@ %P\\n' 2>/dev/null | head -200`
    );

    const files: WorkspaceFile[] = [];
    for (const line of result.stdout.split('\n').filter(Boolean)) {
      const parts = line.split(' ');
      if (parts.length < 4) continue;
      const [typeChar, sizeStr, timestampStr, ...nameParts] = parts;
      const name = nameParts.join(' ');
      if (!name) continue;
      files.push({
        name,
        size: parseInt(sizeStr) || 0,
        modified: new Date(parseFloat(timestampStr) * 1000).toISOString(),
        type: typeChar === 'd' ? 'directory' : 'file',
      });
    }

    files.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return new Date(b.modified).getTime() - new Date(a.modified).getTime();
    });

    res.json({
      files: files.map(f => ({
        id: f.name,
        name: f.name,
        size: f.size,
        createdAt: f.modified,
        mimeType: f.type === 'directory' ? 'inode/directory' : guessMimeType(f.name),
        isDirectory: f.type === 'directory',
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:fileName/download', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { serverIp } = await getUserContainer(req.userId!);
    const filePath = resolveWorkspacePath(req.userId!, req.params.fileName as string);
    const escaped = shellEscape(filePath);

    const result = await sshExec(
      serverIp,
      `test -f '${escaped}' && base64 '${escaped}' || echo 'FILE_NOT_FOUND'`
    );

    if (result.stdout.trim() === 'FILE_NOT_FOUND') {
      return res.status(404).json({ error: 'File not found in workspace' });
    }

    const content = Buffer.from(result.stdout.trim(), 'base64');
    const safeName = path.basename(filePath).replace(/[^a-zA-Z0-9._\-]/g, '_');

    res.setHeader('Content-Type', guessMimeType(filePath));
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.send(content);
  } catch (err: any) {
    if (err.message === 'Path traversal detected') {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    next(err);
  }
});

router.post('/upload', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { serverIp } = await getUserContainer(req.userId!);
    const { filename, content } = req.body;

    if (!filename || !content) {
      return res.status(400).json({ error: 'filename and content (base64) are required' });
    }
    if (typeof filename !== 'string' || filename.length > MAX_FILENAME_LENGTH) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    if (typeof content !== 'string' || content.length > MAX_UPLOAD_SIZE_B64) {
      return res.status(400).json({ error: 'File too large (max ~7.5MB)' });
    }
    if (!BASE64_RE.test(content.replace(/\s/g, ''))) {
      return res.status(400).json({ error: 'Content must be valid base64' });
    }

    const safeFilename = filename.replace(/\.\./g, '').replace(/^\//, '').replace(/[^a-zA-Z0-9._\-\/]/g, '_');
    const filePath = resolveWorkspacePath(req.userId!, safeFilename);
    const escaped = shellEscape(filePath);
    const parentDir = shellEscape(path.dirname(filePath));
    const escapedContent = shellEscape(content);

    await sshExec(serverIp, `mkdir -p '${parentDir}'`);

    const result = await sshExec(
      serverIp,
      `echo '${escapedContent}' | base64 -d > '${escaped}'`
    );

    if (result.code !== 0) {
      return res.status(500).json({ error: `Failed to write file: ${result.stderr}` });
    }

    const stat = await sshExec(serverIp, `stat -c '%s %Y' '${escaped}' 2>/dev/null`);
    const [sizeStr, mtimeStr] = (stat.stdout.trim() || '0 0').split(' ');

    res.json({
      file: {
        id: safeFilename,
        name: safeFilename,
        size: parseInt(sizeStr) || 0,
        createdAt: new Date(parseInt(mtimeStr) * 1000).toISOString(),
        mimeType: guessMimeType(safeFilename),
      },
      message: 'File uploaded to your agent workspace. The agent can now access it.',
    });
  } catch (err: any) {
    if (err.message === 'Path traversal detected') {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    next(err);
  }
});

router.delete('/:fileName', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { serverIp } = await getUserContainer(req.userId!);
    const filePath = resolveWorkspacePath(req.userId!, req.params.fileName as string);
    const baseName = path.basename(filePath);

    const protectedFiles = ['SOUL.md', 'AGENTS.md', 'USER.md', 'IDENTITY.md'];
    if (protectedFiles.includes(baseName)) {
      return res.status(403).json({ error: 'Cannot delete OpenClaw system files' });
    }

    const escaped = shellEscape(filePath);
    await sshExec(serverIp, `rm -f '${escaped}'`);
    res.json({ ok: true });
  } catch (err: any) {
    if (err.message === 'Path traversal detected') {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    next(err);
  }
});

router.get('/usage', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { serverIp } = await getUserContainer(req.userId!);
    const wsDir = shellEscape(`${INSTANCE_DIR}/${req.userId}/workspace`);

    const result = await sshExec(serverIp, `du -sb '${wsDir}' 2>/dev/null || echo '0'`);
    const usedBytes = parseInt(result.stdout.split('\t')[0]) || 0;

    res.json({ usedBytes });
  } catch (err) {
    next(err);
  }
});

export default router;
