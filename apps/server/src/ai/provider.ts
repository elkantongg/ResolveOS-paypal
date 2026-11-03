import { aiConfigured, config } from '../config.js';

/**
 * The model behind the agents, behind one small interface so it can be swapped without touching
 * the negotiation code. `OpenAICompatibleProvider` talks to any OpenAI-style
 * `/chat/completions` endpoint (Groq, OpenAI, a local server) and asks for a JSON object.
 *
 * Providers return raw text only. Turning it into a validated agent turn is the orchestrator's
 * job, so nothing a model writes is trusted until it has passed the schema and the server checks.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiProvider {
  /** `live` for a real model, `demo` for the labelled deterministic negotiator. */
  readonly kind: 'live' | 'demo';
  readonly model: string;
  completeJson(messages: ChatMessage[]): Promise<string>;
}

export class AiError extends Error {
  constructor(
    readonly kind: 'not_configured' | 'timeout' | 'provider_error' | 'empty',
    message: string,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

export class OpenAICompatibleProvider implements AiProvider {
  readonly kind = 'live' as const;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    readonly model: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 45_000,
  ) {}

  async completeJson(messages: ChatMessage[]): Promise<string> {
    // Free tiers limit tokens per minute. On a 429 we wait the time the provider asks for (up to
    // 25 s, twice) instead of failing, and never suggest a paid upgrade to the person.
    for (let attempt = 0; ; attempt += 1) {
      const { response, body } = await this.request(messages);
      if (response.status === 429 && attempt < 2) {
        const wait = retryAfterMs(response, body.error?.message);
        if (wait <= 25_000) {
          await new Promise((resolve) => setTimeout(resolve, wait));
          continue;
        }
      }
      return this.contentOf(response, body);
    }
  }

  private async request(messages: ChatMessage[]) {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.3,
          max_tokens: 900,
          // Reasoning models (gpt-oss) spend fewer tokens thinking; ignored by others that accept it.
          ...(this.model.includes('gpt-oss') ? { reasoning_effort: 'low' } : {}),
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new AiError('timeout', 'The AI provider did not answer in time.');
    }
    const body = (await response.json().catch(() => ({}))) as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
    };
    return { response, body };
  }

  private contentOf(
    response: Response,
    body: { choices?: { message?: { content?: string } }[]; error?: { message?: string } },
  ): string {
    if (response.status === 429) {
      throw new AiError('provider_error', 'The free AI tier is busy (rate limited). Wait about a minute, then retry.');
    }
    if (response.status === 401 || response.status === 403) {
      throw new AiError('provider_error', 'The AI provider rejected the API key. Check AI_API_KEY in .env.');
    }
    if (!response.ok) {
      // Provider messages can include account ids; keep them out of the UI.
      throw new AiError('provider_error', `The AI provider returned an error (${response.status}).`);
    }
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new AiError('empty', 'The AI provider returned an empty answer.');
    return content;
  }
}

/** How long a 429 asks us to wait: `Retry-After`, else "try again in 10.4s" in the message. */
export function retryAfterMs(response: Response, message?: string): number {
  const header = Number(response.headers.get('retry-after'));
  if (Number.isFinite(header) && header > 0) return Math.ceil(header * 1000) + 250;
  const match = message?.match(/try again in ([\d.]+)s/i);
  if (match?.[1]) return Math.ceil(Number(match[1]) * 1000) + 250;
  return 10_000;
}

/** The configured live provider, or null when AI is not set up. */
export function liveProviderFromEnv(): AiProvider | null {
  const c = config();
  if (!aiConfigured(c)) return null;
  return new OpenAICompatibleProvider(c.AI_API_BASE_URL as string, c.AI_API_KEY as string, c.AI_MODEL as string);
}
