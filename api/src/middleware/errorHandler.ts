import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const statusCode = err.statusCode || err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';

  if (statusCode >= 500) {
    console.error('Server error:', err.message, err.stack);
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
