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

/** The extra calls the neutral analysts need, on top of plain JSON answers. */
export interface ToolModel {
  readonly model: string;
  completeJson(messages: ChatMessage[]): Promise<string>;
  completeText(messages: ChatMessage[]): Promise<string>;
  completeWithTools(messages: unknown[], tools: unknown[]): Promise<{ message: unknown; calls: { id: string; name: string }[] }>;
}

export class AiError extends Error {
  constructor(
    readonly kind: 'not_configured' | 'timeout' | 'provider_error' | 'rate_limited' | 'empty',
    message: string,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

export class OpenAICompatibleProvider implements AiProvider, ToolModel {
  readonly kind = 'live' as const;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    readonly model: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 45_000,
  ) {}

  async completeJson(messages: ChatMessage[]): Promise<string> {
    return this.contentOf(...(await this.withRetries({ messages, response_format: { type: 'json_object' } })));
  }

  async completeText(messages: ChatMessage[]): Promise<string> {
    return this.contentOf(...(await this.withRetries({ messages, max_tokens: 20 })));
  }

  async completeWithTools(messages: unknown[], tools: unknown[]) {
    const [response, body] = await this.withRetries({ messages, tools, tool_choice: 'auto' });
    if (!response.ok) this.contentOf(response, body);
    const message: CompletionMessage = body.choices?.[0]?.message ?? { content: '' };
    return {
      message,
      calls: (message.tool_calls ?? []).map((call) => ({ id: call.id, name: call.function.name })),
    };
  }

  private async withRetries(payload: Record<string, unknown>): Promise<[Response, CompletionBody]> {
    // Free tiers limit tokens per minute. On a 429 we wait the time the provider asks for (up to
    // 25 s, twice) instead of failing, and never suggest a paid upgrade to the person.
    for (let attempt = 0; ; attempt += 1) {
      const { response, body } = await this.request(payload);
      if (response.status === 429 && attempt < 2) {
        const wait = retryAfterMs(response, body.error?.message);
        if (wait <= 25_000) {
          await new Promise((resolve) => setTimeout(resolve, wait));
          continue;
        }
      }
      return [response, body];
    }
  }

  private async request(payload: Record<string, unknown>) {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.3,
          max_tokens: 900,
          // Reasoning models (gpt-oss) spend fewer tokens thinking; ignored by others that accept it.
          ...(this.model.includes('gpt-oss') ? { reasoning_effort: 'low' } : {}),
          ...payload,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new AiError('timeout', 'The AI provider did not answer in time.');
    }
    const body = (await response.json().catch(() => ({}))) as CompletionBody;
    return { response, body };
  }

  private contentOf(response: Response, body: CompletionBody): string {
    if (response.status === 429) {
      throw new AiError('rate_limited', 'The free AI tier is busy (rate limited). Wait about a minute, then retry.');
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

/**
 * Tries the next model when one has used up its free allowance. Each model on the free tier has its
 * own limit, so a demo keeps working. `model` always names the one that answered last.
 */
export class FallbackModel implements AiProvider, ToolModel {
  readonly kind = 'live' as const;
  private used: OpenAICompatibleProvider;

  constructor(private readonly models: OpenAICompatibleProvider[]) {
    this.used = models[0] as OpenAICompatibleProvider;
  }

  get model() {
    return this.used.model;
  }

  private async attempt<T>(call: (model: OpenAICompatibleProvider) => Promise<T>): Promise<T> {
    for (const [index, model] of this.models.entries()) {
      try {
        const result = await call(model);
        this.used = model;
        return result;
      } catch (error) {
        const last = index === this.models.length - 1;
        if (last || !(error instanceof AiError) || error.kind !== 'rate_limited') throw error;
      }
    }
    throw new AiError('empty', 'No AI model is configured.');
  }

  completeJson(messages: ChatMessage[]) {
    return this.attempt((model) => model.completeJson(messages));
  }

  completeText(messages: ChatMessage[]) {
    return this.attempt((model) => model.completeText(messages));
  }

  completeWithTools(messages: unknown[], tools: unknown[]) {
    return this.attempt((model) => model.completeWithTools(messages, tools));
  }
}

interface CompletionMessage {
  content?: string;
  tool_calls?: { id: string; function: { name: string } }[];
}

interface CompletionBody {
  choices?: { message?: CompletionMessage }[];
  error?: { message?: string };
}

/** How long a 429 asks us to wait: `Retry-After`, else "try again in 10.4s" in the message. */
export function retryAfterMs(response: Response, message?: string): number {
  const header = Number(response.headers.get('retry-after'));
  if (Number.isFinite(header) && header > 0) return Math.ceil(header * 1000) + 250;
  const match = message?.match(/try again in ([\d.]+)s/i);
  if (match?.[1]) return Math.ceil(Number(match[1]) * 1000) + 250;
  return 10_000;
}

/** Another model on the same account, for the analysts and the injection classifier. */
export function modelFromEnv(model: string | undefined): OpenAICompatibleProvider | null {
  const c = config();
  if (!aiConfigured(c) || !model) return null;
  return new OpenAICompatibleProvider(c.AI_API_BASE_URL as string, c.AI_API_KEY as string, model);
}

/** The app's models in order of preference: the configured one, then the free fallback. */
export function chainFromEnv(primary: string | undefined): FallbackModel | null {
  const c = config();
  const models = [...new Set([primary, c.AI_MODEL_FALLBACK].filter(Boolean))].map((name) => modelFromEnv(name) as OpenAICompatibleProvider);
  return aiConfigured(c) && models.length ? new FallbackModel(models) : null;
}

/** The configured live provider, or null when AI is not set up. */
export function liveProviderFromEnv(): AiProvider | null {
  const c = config();
  if (!aiConfigured(c)) return null;
  return new OpenAICompatibleProvider(c.AI_API_BASE_URL as string, c.AI_API_KEY as string, c.AI_MODEL as string);
}
