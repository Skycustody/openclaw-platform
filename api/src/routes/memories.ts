import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authenticate, requireActiveSubscription } from '../middleware/auth';
import { memorySystem } from '../services/memory';
import { MemoryType } from '../types';

const router = Router();
router.use(authenticate);
router.use(requireActiveSubscription);

// List memories with search/filter
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { type, search, limit, offset } = req.query;
    const result = await memorySystem.getAllMemories(req.userId!, {
      type: type as MemoryType | undefined,
      search: search as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Add a memory
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { content, type, importance, tags } = req.body;
    if (!content) return res.status(400).json({ error: 'Content required' });

    const id = await memorySystem.remember(
      req.userId!,
      content,
      type || 'fact',
      importance || 0.5,
      tags || []
    );

    res.json({ id });
  } catch (err) {
    next(err);
  }
});

// Delete a memory
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await memorySystem.deleteMemory(req.userId!, req.params.id as string);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Clear all memories
router.delete('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await memorySystem.clearAllMemories(req.userId!);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Export memories
router.get('/export', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const memories = await memorySystem.exportMemories(req.userId!);
    res.json({ memories });
  } catch (err) {
    next(err);
  }
});

export default router;
