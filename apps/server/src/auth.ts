import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { and, eq, gt, lt } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';

import { type Db } from './db/index.js';
import { sessions, users } from './db/schema.js';
import { AppError } from './errors.js';

/**
 * Demo authentication with real separation between people.
 *
 * Signing in creates a server-side session; the browser holds only a random token in an
 * HTTP-only, SameSite=Strict cookie. Every state-changing request must also send the session's
 * CSRF token in `X-CSRF-Token` (double submit against the stored value). Roles come from the
 * users table, never from the request, so the buyer can never act as the merchant or vice versa.
 *
 * Demo accounts sign in by picking one (no passwords): this is a sandbox demo with seeded people,
 * and the "switch person" control in the UI is a real sign-out + sign-in, not a role toggle.
 */

export const SESSION_COOKIE = 'resolve_session';
const SESSION_DAYS = 7;

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: 'BUYER' | 'MERCHANT' | 'OPERATOR';
  csrfToken: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(database: Db, userId: string) {
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(24).toString('base64url');
  await database.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  await database.insert(sessions).values({
    id: hash(token),
    userId,
    csrfToken,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000),
  });
  return { token, csrfToken };
}

export async function destroySession(database: Db, token: string | undefined): Promise<void> {
  if (token) await database.delete(sessions).where(eq(sessions.id, hash(token)));
}

export function setSessionCookie(res: Response, token: string, secure: boolean): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: '/',
    maxAge: SESSION_DAYS * 86_400_000,
  });
}

/** Attaches `req.user` when the cookie names a live session. Never fails the request. */
export function loadSession(database: Db) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (!token) return next();
    try {
      const [row] = await database
        .select({ user: users, csrfToken: sessions.csrfToken })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(and(eq(sessions.id, hash(token)), gt(sessions.expiresAt, new Date())))
        .limit(1);
      if (row) {
        req.user = {
          id: row.user.id,
          name: row.user.name,
          email: row.user.email,
          role: row.user.role,
          csrfToken: row.csrfToken,
        };
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * The door in front of a public deployment. Demo sign-in has no passwords, so anything reachable
 * from the internet sits behind this shared access code (HTTP Basic: the browser asks once, and the
 * page and its API calls then carry it). Required in production; see config.ts.
 */
export function accessGate(code: string) {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  const expected = digest(code);
  return (req: Request, res: Response, next: NextFunction) => {
    const [scheme, value] = (req.get('authorization') ?? '').split(' ');
    const supplied =
      scheme?.toLowerCase() === 'basic' && value
        ? Buffer.from(value, 'base64').toString('utf8').split(':').slice(1).join(':')
        : '';
    if (timingSafeEqual(digest(supplied), expected)) return next();
    res
      .set('WWW-Authenticate', 'Basic realm="ResolveOS demo", charset="UTF-8"')
      .status(401)
      .json({ error: { code: 'access_code_required', message: 'This demo needs an access code.' } });
  };
}

export function requireUser(req: Request): SessionUser {
  if (!req.user) throw new AppError(401, 'unauthenticated', 'Please sign in first.');
  return req.user;
}

export function requireRole(req: Request, ...roles: SessionUser['role'][]): SessionUser {
  const user = requireUser(req);
  if (!roles.includes(user.role)) {
    throw new AppError(403, 'forbidden', 'Your account cannot do this.');
  }
  return user;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** CSRF check for signed-in, state-changing requests (the webhook path is exempt: it has no session). */
export function csrfGuard(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method) || !req.user) return next();
  const sent = req.get('x-csrf-token') ?? '';
  const expected = req.user.csrfToken;
  const ok =
    sent.length === expected.length && timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
  if (!ok) return next(new AppError(403, 'csrf_failed', 'Your session check failed. Reload the page.'));
  next();
}
