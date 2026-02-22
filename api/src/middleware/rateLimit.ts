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

const proxyLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:proxy',
  points: 60,
  duration: 60,
});

const sensitiveLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:sensitive',
  points: 30,
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

export function rateLimitProxy(req: Request, res: Response, next: NextFunction) {
  const key = req.ip || 'unknown';
  proxyLimiter
    .consume(key)
    .then(() => next())
    .catch(() => {
      res.status(429).json({ error: { code: 'RATE_LIMIT', message: 'Too many AI requests' } });
    });
}

export function rateLimitSensitive(req: Request, res: Response, next: NextFunction) {
  const key = req.ip || 'unknown';
  sensitiveLimiter
    .consume(key)
    .then(() => next())
    .catch(() => {
      res.status(429).json({ error: { code: 'RATE_LIMIT', message: 'Too many requests' } });
    });
}

const adminLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:admin',
  points: 5,
  duration: 60,
  blockDuration: 300,
});

export function rateLimitAdmin(req: Request, res: Response, next: NextFunction) {
  const key = req.ip || 'unknown';
  adminLimiter
    .consume(key)
    .then(() => next())
    .catch(() => {
      res.status(429).json({ error: { code: 'RATE_LIMIT', message: 'Too many admin requests. Locked for 5 minutes.' } });
    });
}
