import { Router, Request, Response, NextFunction } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { rateLimitSensitive } from '../middleware/rateLimit';

const router = Router();

const BLAND_API = 'https://api.bland.ai/v1';

function getBlandKey(): string | null {
  return process.env.BLAND_API_KEY || null;
}

// Make an outbound AI call
router.post('/make', rateLimitSensitive, authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const key = getBlandKey();
    if (!key) return res.status(503).json({ error: 'Calling not configured. Set BLAND_API_KEY.' });

    const { phone, task, firstSentence, voice, maxDuration } = req.body;
    if (!phone || !task) return res.status(400).json({ error: 'phone and task are required' });

    const resp = await fetch(`${BLAND_API}/calls`, {
      method: 'POST',
      headers: { 'authorization': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone_number: phone,
        task,
        first_sentence: firstSentence || 'Hi, this is Alex from Valnaa. Do you have a quick minute?',
        voice: voice || 'josh',
        wait_for_greeting: true,
        model: 'base',
        max_duration: maxDuration || 180,
        record: true,
      }),
    });

    const data = await resp.json() as any;
    res.json({ ok: true, callId: data.call_id, status: data.status });
  } catch (err) {
    next(err);
  }
});

// Get call status + transcript
router.get('/:callId', rateLimitSensitive, authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const key = getBlandKey();
    if (!key) return res.status(503).json({ error: 'Calling not configured' });

    const resp = await fetch(`${BLAND_API}/calls/${req.params.callId}`, {
      headers: { 'authorization': key },
    });

    const data = await resp.json() as any;
    res.json({
      callId: data.call_id,
      status: data.status,
      duration: data.call_length,
      answeredBy: data.answered_by,
      endedBy: data.call_ended_by,
      cost: data.price,
      transcript: data.concatenated_transcript,
      summary: data.summary,
      recordingUrl: data.recording_url,
    });
  } catch (err) {
    next(err);
  }
});

// List recent calls
router.get('/', rateLimitSensitive, authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const key = getBlandKey();
    if (!key) return res.status(503).json({ error: 'Calling not configured' });

    const resp = await fetch(`${BLAND_API}/calls`, {
      headers: { 'authorization': key },
    });

    const data = await resp.json() as any;
    res.json({ calls: data.calls || data });
  } catch (err) {
    next(err);
  }
});

// Check balance
router.get('/account/balance', rateLimitSensitive, authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const key = getBlandKey();
    if (!key) return res.status(503).json({ error: 'Calling not configured' });

    const resp = await fetch(`${BLAND_API}/me`, {
      headers: { 'authorization': key },
    });

    const data = await resp.json() as any;
    res.json({ balance: data.billing?.current_balance, totalCalls: data.total_calls });
  } catch (err) {
    next(err);
  }
});

export default router;
