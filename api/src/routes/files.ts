import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authenticate, requireActiveSubscription } from '../middleware/auth';
import db from '../lib/db';
import { listUserFiles, getPresignedUrl, getUploadUrl, getBucketName } from '../services/s3';

const router = Router();
router.use(authenticate);
router.use(requireActiveSubscription);

// List files
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const files = await listUserFiles(req.userId!);

    // Also get DB records for metadata
    const dbFiles = await db.getMany(
      'SELECT * FROM user_files WHERE user_id = $1 ORDER BY created_at DESC',
      [req.userId]
    );

    res.json({ files: dbFiles.length ? dbFiles : files });
  } catch (err) {
    next(err);
  }
});

// Get download URL
router.get('/:fileId/download', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const file = await db.getOne<any>(
      'SELECT * FROM user_files WHERE id = $1 AND user_id = $2',
      [req.params.fileId, req.userId]
    );

    if (!file) return res.status(404).json({ error: 'File not found' });

    const url = await getPresignedUrl(req.userId!, file.s3_key);
    res.json({ url });
  } catch (err) {
    next(err);
  }
});

// Get upload URL
router.post('/upload', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { filename, contentType } = req.body;
    if (!filename) return res.status(400).json({ error: 'Filename required' });

    const key = `uploads/${Date.now()}-${filename}`;
    const url = await getUploadUrl(req.userId!, key, contentType || 'application/octet-stream');

    await db.query(
      `INSERT INTO user_files (user_id, filename, s3_key, mime_type) VALUES ($1, $2, $3, $4)`,
      [req.userId, filename, key, contentType]
    );

    res.json({ uploadUrl: url, key });
  } catch (err) {
    next(err);
  }
});

// Delete file
router.delete('/:fileId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await db.query(
      'DELETE FROM user_files WHERE id = $1 AND user_id = $2',
      [req.params.fileId, req.userId]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Storage usage
router.get('/usage', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await db.getOne<{ total: string }>(
      'SELECT COALESCE(SUM(size_bytes), 0) as total FROM user_files WHERE user_id = $1',
      [req.userId]
    );
    res.json({ usedBytes: parseInt(result?.total || '0') });
  } catch (err) {
    next(err);
  }
});

export default router;
