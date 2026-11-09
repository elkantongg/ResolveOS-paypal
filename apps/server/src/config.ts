import { z } from 'zod';

/**
 * Server configuration, read once from the environment. Secrets (PayPal client secret, AI key,
 * session secret) live only here and are never sent to the browser or written to logs.
 *
 * Optional integrations stay optional: with no PayPal or AI credentials the app still starts, and
 * the features that need them report "not configured" instead of pretending to work.
 */
const optional = z
  .string()
  .trim()
  .transform((value) => (value === '' ? undefined : value))
  .optional();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  FRONTEND_URL: z.string().url().default('http://localhost:5180'),
  BACKEND_PORT: z.coerce.number().int().positive().default(5001),

  PAYPAL_ENV: z.literal('sandbox').default('sandbox'),
  PAYPAL_CLIENT_ID: optional,
  PAYPAL_CLIENT_SECRET: optional,
  PAYPAL_WEBHOOK_ID: optional,
  /** `http` = the real PayPal sandbox. `mock` = deterministic fake for automated tests only. */
  PAYPAL_ADAPTER: z.enum(['http', 'mock']).default('http'),

  AI_API_BASE_URL: optional,
  AI_API_KEY: optional,
  AI_MODEL: optional,
  /** The neutral analysts (investigator, reviewer). Defaults to AI_MODEL. */
  AI_MODEL_ANALYST: optional,
  /** Used when the main model's free allowance runs out. Empty switches fallback off. */
  AI_MODEL_FALLBACK: z.string().trim().default('openai/gpt-oss-20b'),
  /** Classifier that flags text written to manipulate an AI. Empty switches the screen off. */
  AI_MODEL_GUARD: z.string().trim().default('meta-llama/llama-prompt-guard-2-86m'),
  /** `live` calls the configured model; `demo` uses the labelled deterministic negotiator. */
  AI_MODE: z.enum(['live', 'demo']).default('live'),

  /** Shared code in front of a public deployment (demo sign-in has no passwords). Production only. */
  DEMO_ACCESS_CODE: optional,
  /** Overrides the per-minute limit on payment, AI and sign-in routes. */
  RATE_LIMIT_MAX: z.coerce.number().int().positive().optional(),
});

export type Config = z.infer<typeof schema>;

let cached: Config | null = null;

export function config(): Config {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid configuration:\n  ${problems.join('\n  ')}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.PAYPAL_ADAPTER === 'mock') {
    throw new Error('Invalid configuration: PAYPAL_ADAPTER=mock is for automated tests only.');
  }
  if (parsed.data.NODE_ENV === 'production') {
    if (!parsed.data.DEMO_ACCESS_CODE || parsed.data.DEMO_ACCESS_CODE.length < 16) {
      throw new Error(
        'Invalid configuration: production needs DEMO_ACCESS_CODE (16+ characters). Demo sign-in has no passwords, so a public instance must not be open.',
      );
    }
    const frontend = new URL(parsed.data.FRONTEND_URL);
    if (frontend.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(frontend.hostname)) {
      throw new Error('Invalid configuration: FRONTEND_URL must use https in production.');
    }
  }
  cached = parsed.data;
  return cached;
}

/** For tests that change the environment. */
export function resetConfig(): void {
  cached = null;
}

export const PAYPAL_SANDBOX_API = 'https://api-m.sandbox.paypal.com';

export function paypalConfigured(c: Config = config()): boolean {
  if (c.PAYPAL_ADAPTER === 'mock') return true;
  return Boolean(c.PAYPAL_CLIENT_ID && c.PAYPAL_CLIENT_SECRET);
}

export function aiConfigured(c: Config = config()): boolean {
  return Boolean(c.AI_API_BASE_URL && c.AI_API_KEY && c.AI_MODEL);
}
