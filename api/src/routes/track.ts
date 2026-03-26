import { Router, Request, Response, NextFunction } from 'express';
import db from '../lib/db';
import { rateLimitTrack } from '../middleware/rateLimit';

const router = Router();

const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MAX_PATH = 512;
const MAX_REF = 2048;

function parseUserAgent(ua: string | undefined): { device: string; browser: string; os: string } {
  const s = (ua || '').slice(0, 500);
  const mobile = /Mobile|Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(s);
  const tablet = /iPad|Tablet|PlayBook|Silk/i.test(s);
  let device = 'desktop';
  if (tablet) device = 'tablet';
  else if (mobile) device = 'mobile';

  let browser = 'other';
  if (/Edg\//i.test(s)) browser = 'edge';
  else if (/Chrome\//i.test(s) && !/Edg/i.test(s)) browser = 'chrome';
  else if (/Safari/i.test(s) && !/Chrome/i.test(s)) browser = 'safari';
  else if (/Firefox/i.test(s)) browser = 'firefox';

  let os = 'other';
  if (/Windows NT/i.test(s)) os = 'windows';
  else if (/Mac OS X|Macintosh/i.test(s)) os = 'macos';
  else if (/Linux/i.test(s) && !/Android/i.test(s)) os = 'linux';
  else if (/Android/i.test(s)) os = 'android';
  else if (/iPhone|iPad|iPod/i.test(s)) os = 'ios';

  return { device, browser, os };
}

function sanitizePath(p: unknown): string {
  if (typeof p !== 'string') return '/';
  const t = p.trim().slice(0, MAX_PATH);
  if (!t.startsWith('/')) return '/' + t.replace(/^\/+/, '');
  return t || '/';
}

function sanitizeRef(r: unknown): string | null {
  if (typeof r !== 'string') return null;
  return r.slice(0, MAX_REF) || null;
}

function sanitizeUtm(v: unknown, max = 200): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().slice(0, max);
  return t || null;
}

router.use(rateLimitTrack);

router.post('/pageview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { visitorId, path, referrer, utm_source, utm_medium, utm_campaign } = req.body || {};
    if (!visitorId || typeof visitorId !== 'string' || !UUID_RE.test(visitorId)) {
      return res.status(400).json({ error: { message: 'Invalid visitorId' } });
    }

    const p = sanitizePath(path);
    const ref = sanitizeRef(referrer);
    const { device, browser, os } = parseUserAgent(req.headers['user-agent']);
    const country =
      (req.headers['cf-ipcountry'] as string | undefined)?.slice(0, 8) ||
      (req.headers['x-country'] as string | undefined)?.slice(0, 8) ||
      null;

    await db.query(
      `INSERT INTO page_views (visitor_id, path, referrer, utm_source, utm_medium, utm_campaign, country, device, browser, os)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        visitorId,
        p,
        ref,
        sanitizeUtm(utm_source),
        sanitizeUtm(utm_medium),
        sanitizeUtm(utm_campaign),
        country,
        device,
        browser,
        os,
      ]
    );

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/event', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { visitorId, event, path, meta } = req.body || {};
    if (!visitorId || typeof visitorId !== 'string' || !UUID_RE.test(visitorId)) {
      return res.status(400).json({ error: { message: 'Invalid visitorId' } });
    }
    if (!event || typeof event !== 'string' || event.length > 128 || !/^[a-zA-Z0-9_.:-]+$/.test(event)) {
      return res.status(400).json({ error: { message: 'Invalid event' } });
    }

    const p = path != null ? sanitizePath(path) : null;
    const metaObj = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};

    await db.query(
      `INSERT INTO track_events (visitor_id, event, path, meta) VALUES ($1::uuid, $2, $3, $4::jsonb)`,
      [visitorId, event, p, JSON.stringify(metaObj)]
    );

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
