/**
 * Agent Marketplace — cloud-hosted agent catalog.
 * Desktop app fetches agents from here instead of the local encrypted file.
 * Agents can be updated server-side without app releases.
 */
import { Router, Request, Response } from 'express';
import db from '../lib/db';

const router = Router();

// Public — no auth required for browsing the catalog
router.get('/catalog', async (_req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT id, name, nickname, description, role, category, skills, cron, required_keys, version, downloads
       FROM marketplace_agents
       WHERE published = true
       ORDER BY downloads DESC`
    );
    res.json({ ok: true, agents: result.rows, total: result.rows.length });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Public — get a single agent's full data (including soul)
router.get('/catalog/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT * FROM marketplace_agents WHERE id = $1 AND published = true`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Agent not found' });
    }
    // Increment download count
    await db.query(`UPDATE marketplace_agents SET downloads = downloads + 1 WHERE id = $1`, [id]);
    res.json({ ok: true, agent: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Public — get catalog version (for cache checking)
router.get('/version', async (_req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT MAX(updated_at) as last_updated, COUNT(*) as total FROM marketplace_agents WHERE published = true`
    );
    res.json({ ok: true, ...result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
