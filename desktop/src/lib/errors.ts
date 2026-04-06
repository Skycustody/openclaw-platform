/** User-facing error with a friendly message and optional technical details. */
export class AppError extends Error {
  public readonly userMessage: string;
  public readonly details: string;
  public readonly recoverable: boolean;

  constructor(userMessage: string, details: string = '', recoverable = true) {
    super(userMessage);
    this.name = 'AppError';
    this.userMessage = userMessage;
    this.details = details;
    this.recoverable = recoverable;
  }
}

export function classifyProcessError(code: number | null, signal: string | null, stderr: string): AppError {
  if (signal === 'SIGKILL') {
    return new AppError('OpenClaw was forcefully stopped.', `Signal: ${signal}`, true);
  }
  if (stderr.includes('EADDRINUSE')) {
    return new AppError(
      'Port is already in use. Another instance may be running.',
      stderr,
      true,
    );
  }
  if (stderr.includes('EACCES') || stderr.includes('permission denied')) {
    return new AppError(
      'Permission denied. Try restarting the app.',
      stderr,
      true,
    );
  }
  if (stderr.includes('Config invalid') || stderr.includes('Unrecognized key')) {
    return new AppError(
      'OpenClaw configuration error. Try resetting your config.',
      stderr,
      true,
    );
  }
  if (stderr.includes('ENOTFOUND') || stderr.includes('ETIMEDOUT') || stderr.includes('getaddrinfo')) {
    return new AppError(
      'Network error. Check your internet connection.',
      stderr,
      true,
    );
  }
  return new AppError(
    `OpenClaw stopped unexpectedly (code ${code}).`,
    stderr || 'No additional details.',
    true,
  );
}

export function classifyInstallError(stderr: string): AppError {
  if (stderr.includes('cannot find the path specified') || stderr.includes('is not recognized as an internal')) {
    return new AppError(
      'System shell not found. Ensure Windows system directories are in your PATH and try again.',
      stderr,
      true,
    );
  }
  if (stderr.includes('EACCES')) {
    return new AppError(
      'Permission error during installation. The app will try an alternative install path.',
      stderr,
      true,
    );
  }
  if (stderr.includes('ENOTFOUND') || stderr.includes('ETIMEDOUT') || stderr.includes('network')) {
    return new AppError(
      'Could not download OpenClaw. Check your internet connection and try again.',
      stderr,
      true,
    );
  }
  if (stderr.includes('ENOSPC')) {
    return new AppError(
      'Not enough disk space to install OpenClaw.',
      stderr,
      false,
    );
  }
  return new AppError(
    'Failed to install OpenClaw. Check the logs for details.',
    stderr,
    true,
  );
}
