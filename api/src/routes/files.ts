/**
 * Files routes — manages files in the user's OpenClaw container workspace.
 *
 * This wraps the container's workspace directory (~/.openclaw/workspace)
 * which is mounted at /opt/openclaw/instances/<userId>/workspace on the host.
 * Files placed here are accessible to the agent via its file tools.
 */
import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authenticate, requireActiveSubscription } from '../middleware/auth';
import { getUserContainer } from '../services/containerConfig';
import { sshExec } from '../services/ssh';

const router = Router();
router.use(authenticate);
router.use(requireActiveSubscription);

const INSTANCE_DIR = '/opt/openclaw/instances';

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
    const wsDir = `${INSTANCE_DIR}/${req.userId}/workspace`;

    // Ensure workspace exists
    await sshExec(serverIp, `mkdir -p ${wsDir}`);

    // List files with size and modification time
    const result = await sshExec(
      serverIp,
      `find ${wsDir} -maxdepth 2 -not -path '*/\\.*' -not -name '.*' -printf '%y %s %T@ %P\\n' 2>/dev/null | head -200`
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

    // Sort: directories first, then by modified time descending
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

// Download / read file content
router.get('/:fileName/download', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { serverIp } = await getUserContainer(req.userId!);
    const fileName = decodeURIComponent(req.params.fileName);
    const safeFile = fileName.replace(/\.\./g, '').replace(/^\//, '');
    const filePath = `${INSTANCE_DIR}/${req.userId}/workspace/${safeFile}`;

    const result = await sshExec(
      serverIp,
      `test -f '${filePath}' && base64 '${filePath}' || echo 'FILE_NOT_FOUND'`
    );

    if (result.stdout.trim() === 'FILE_NOT_FOUND') {
      return res.status(404).json({ error: 'File not found in workspace' });
    }

    const content = Buffer.from(result.stdout.trim(), 'base64');
    const mime = guessMimeType(fileName);

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFile.split('/').pop()}"`);
    res.send(content);
  } catch (err) {
    next(err);
  }
});

// Upload file to workspace
router.post('/upload', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { serverIp } = await getUserContainer(req.userId!);
    const { filename, content } = req.body;

    if (!filename || !content) {
      return res.status(400).json({ error: 'filename and content (base64) are required' });
    }

    const safeFilename = filename.replace(/\.\./g, '').replace(/^\//, '').replace(/[^a-zA-Z0-9._\-\/]/g, '_');
    const wsDir = `${INSTANCE_DIR}/${req.userId}/workspace`;
    const filePath = `${wsDir}/${safeFilename}`;

    // Ensure parent directory exists
    const parentDir = filePath.substring(0, filePath.lastIndexOf('/'));
    await sshExec(serverIp, `mkdir -p '${parentDir}'`);

    // Write file
    const result = await sshExec(
      serverIp,
      `echo '${content}' | base64 -d > '${filePath}'`
    );

    if (result.code !== 0) {
      return res.status(500).json({ error: `Failed to write file: ${result.stderr}` });
    }

    // Get file info
    const stat = await sshExec(serverIp, `stat -c '%s %Y' '${filePath}' 2>/dev/null`);
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
  } catch (err) {
    next(err);
  }
});

// Delete file from workspace
router.delete('/:fileName', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { serverIp } = await getUserContainer(req.userId!);
    const fileName = decodeURIComponent(req.params.fileName);
    const safeFile = fileName.replace(/\.\./g, '').replace(/^\//, '');

    // Prevent deleting critical OpenClaw files
    const protected_files = ['SOUL.md', 'AGENTS.md', 'USER.md', 'IDENTITY.md'];
    if (protected_files.includes(safeFile)) {
      return res.status(403).json({ error: 'Cannot delete OpenClaw system files' });
    }

    const filePath = `${INSTANCE_DIR}/${req.userId}/workspace/${safeFile}`;
    await sshExec(serverIp, `rm -f '${filePath}'`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Workspace storage usage
router.get('/usage', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { serverIp } = await getUserContainer(req.userId!);
    const wsDir = `${INSTANCE_DIR}/${req.userId}/workspace`;

    const result = await sshExec(serverIp, `du -sb ${wsDir} 2>/dev/null || echo '0'`);
    const usedBytes = parseInt(result.stdout.split('\t')[0]) || 0;

    res.json({ usedBytes });
  } catch (err) {
    next(err);
  }
});

export default router;
