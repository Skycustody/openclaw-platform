import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authenticate, requireActiveSubscription } from '../middleware/auth';
import {
  connectTelegram, disconnectTelegram,
  connectDiscord, disconnectDiscord,
  connectSlack, disconnectSlack,
  initiateWhatsAppPairing, checkWhatsAppStatus, disconnectWhatsApp,
  getWhatsAppQr,
  getChannelStatuses, getMessageCounts,
} from '../services/messaging';

const router = Router();
router.use(authenticate);
router.use(requireActiveSubscription);

// Get all channel statuses
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const [statuses, messageCounts] = await Promise.all([
      getChannelStatuses(req.userId!),
      getMessageCounts(req.userId!),
    ]);
    res.json({ channels: statuses, messageCounts });
  } catch (err) {
    next(err);
  }
});

// ── Telegram ──
router.post('/telegram/connect', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { botToken } = req.body;
    if (!botToken) return res.status(400).json({ error: 'Bot token required' });
    await connectTelegram(req.userId!, botToken);
    res.json({ connected: true });
  } catch (err) {
    next(err);
  }
});

router.post('/telegram/disconnect', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await disconnectTelegram(req.userId!);
    res.json({ disconnected: true });
  } catch (err) {
    next(err);
  }
});

// ── Discord ──
router.post('/discord/connect', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { botToken, guildId } = req.body;
    if (!botToken) return res.status(400).json({ error: 'Bot token required' });
    await connectDiscord(req.userId!, botToken, guildId);
    res.json({ connected: true });
  } catch (err) {
    next(err);
  }
});

router.post('/discord/disconnect', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await disconnectDiscord(req.userId!);
    res.json({ disconnected: true });
  } catch (err) {
    next(err);
  }
});

// ── Slack ──
router.post('/slack/connect', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { accessToken, teamId } = req.body;
    if (!accessToken || !teamId) return res.status(400).json({ error: 'Access token and team ID required' });
    await connectSlack(req.userId!, accessToken, teamId);
    res.json({ connected: true });
  } catch (err) {
    next(err);
  }
});

router.post('/slack/disconnect', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await disconnectSlack(req.userId!);
    res.json({ disconnected: true });
  } catch (err) {
    next(err);
  }
});

// ── WhatsApp ──
router.post('/whatsapp/pair', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await initiateWhatsAppPairing(req.userId!);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/whatsapp/qr', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await getWhatsAppQr(req.userId!);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/whatsapp/status', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const status = await checkWhatsAppStatus(req.userId!);
    res.json(status);
  } catch (err) {
    next(err);
  }
});

router.post('/whatsapp/disconnect', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await disconnectWhatsApp(req.userId!);
    res.json({ disconnected: true });
  } catch (err) {
    next(err);
  }
});

export default router;
