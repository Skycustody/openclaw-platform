import { Request, Response, NextFunction } from 'express';

function redactSecrets(text: string): string {
  if (!text) return text;
  return text
    .replace(/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED]')
    .replace(/val_sk_[a-zA-Z0-9]+/g, '[REDACTED]')
    .replace(/INTERNAL_SECRET=[^\s]+/g, 'INTERNAL_SECRET=[REDACTED]')
    .replace(/CONTAINER_SECRET=[^\s]+/g, 'CONTAINER_SECRET=[REDACTED]')
    .replace(/GATEWAY_TOKEN=[^\s]+/g, 'GATEWAY_TOKEN=[REDACTED]')
    .replace(/OPENROUTER_API_KEY=[^\s]+/g, 'OPENROUTER_API_KEY=[REDACTED]')
    .replace(/BROWSERLESS_TOKEN=[^\s]+/g, 'BROWSERLESS_TOKEN=[REDACTED]')
    .replace(/token=[a-zA-Z0-9_-]{20,}/gi, 'token=[REDACTED]');
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const statusCode = err.statusCode || err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';

  if (statusCode >= 500) {
    console.error('Server error:', redactSecrets(err.message || ''), redactSecrets(err.stack || ''));
  }

  const isProd = process.env.NODE_ENV === 'production';

  res.status(statusCode).json({
    error: {
      code,
      message: statusCode >= 500 && isProd
        ? 'An unexpected error occurred'
        : err.message || 'Internal server error',
      ...(err.userStatus && { userStatus: err.userStatus }),
    },
  });
}
