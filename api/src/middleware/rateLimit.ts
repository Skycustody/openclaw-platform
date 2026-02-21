import { Request, Response, NextFunction } from 'express';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import redis from '../lib/redis';

const generalLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:general',
  points: 100,
  duration: 60,
});

const authLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:auth',
  points: 10,
  duration: 60,
});

const webhookLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:webhook',
  points: 200,
  duration: 60,
});

export function rateLimitGeneral(req: Request, res: Response, next: NextFunction) {
  const key = req.ip || 'unknown';
  generalLimiter
    .consume(key)
    .then(() => next())
    .catch(() => {
      res.status(429).json({ error: { code: 'RATE_LIMIT', message: 'Too many requests' } });
    });
}

export function rateLimitAuth(req: Request, res: Response, next: NextFunction) {
  const key = req.ip || 'unknown';
  authLimiter
    .consume(key)
    .then(() => next())
    .catch(() => {
      res.status(429).json({ error: { code: 'RATE_LIMIT', message: 'Too many login attempts' } });
    });
}

export function rateLimitWebhook(req: Request, res: Response, next: NextFunction) {
  const key = 'webhook';
  webhookLimiter
    .consume(key)
    .then(() => next())
    .catch(() => {
      res.status(429).json({ error: { code: 'RATE_LIMIT', message: 'Too many webhooks' } });
    });
}
