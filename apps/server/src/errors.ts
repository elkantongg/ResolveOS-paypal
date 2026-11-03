/**
 * The one error shape the API returns: `{ error: { code, message, details? } }`. `message` is
 * written for the person using the app; `code` is stable for the frontend to branch on.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what = 'Not found') => new AppError(404, 'not_found', what);
export const forbidden = (message = 'You do not have access to this.') =>
  new AppError(403, 'forbidden', message);
export const conflict = (code: string, message: string, details?: Record<string, unknown>) =>
  new AppError(409, code, message, details);
export const badRequest = (code: string, message: string, details?: Record<string, unknown>) =>
  new AppError(400, code, message, details);
