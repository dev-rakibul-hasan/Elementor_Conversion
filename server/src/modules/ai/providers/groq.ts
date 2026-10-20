/**
 * Groq AI Provider Adapter
 * Integrates with Groq's high-speed inference API (OpenAI-compatible)
 * Supporting vision models, structured JSON output, and robust error handling.
 */

import {
  AICapability,
  AIHealthCheckResult,
  AIProvider,
  AIProviderAdapter,
  AIRequest,
  AIResponse,
} from '../types.js';
import { AIProviderError } from '../../../lib/errors.js';
import { logger } from '../../../lib/logger.js';

export interface GroqAdapterOptions {
  apiKey?: string;
  defaultModel?: string;
  baseUrl?: string;
  defaultTimeoutMs?: number;
}

interface GroqChatCompletionResponse {
  id?: string;
  choices?: Array<{
    index: number;
    message?: {
      role: string;
      content: string | null;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

export class GroqAdapter implements AIProviderAdapter {
  readonly name: AIProvider = AIProvider.GROQ;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly defaultTimeoutMs: number;

  constructor(options: GroqAdapterOptions = {}) {
    this.apiKey = options.apiKey || process.env.AI_API_KEY || '';
    this.baseUrl = (options.baseUrl || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
    this.defaultModel =
      options.defaultModel ||
      process.env.GROQ_MODEL ||
      process.env.STRUCTURE_AI_MODEL ||
      process.env.AI_MODEL ||
      'openai/gpt-oss-120b';
    this.defaultTimeoutMs = options.defaultTimeoutMs || 60000;
  }

  public getDefaultModel(): string {
    return this.defaultModel;
  }

  getCapabilities(): AICapability[] {
    return [
      AICapability.TEXT_GENERATION,
      AICapability.JSON_OUTPUT,
      AICapability.IMAGE_INPUT,
    ];
  }

  validateModel(modelId: string): boolean {
    if (!modelId || typeof modelId !== 'string') return false;
    // Known Groq models or general identifier format check
    return modelId.trim().length > 0;
  }

  /**
   * Performs a lightweight check against Groq's models endpoint or token test
   */
  async checkHealth(): Promise<AIHealthCheckResult> {
    const startTime = Date.now();
    if (!this.apiKey) {
      return {
        ok: false,
        message: 'Groq API key is not configured',
        latencyMs: 0,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startTime;
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        return {
          ok: false,
          message: `Groq health check returned HTTP ${response.status}: ${text.slice(0, 200)}`,
          latencyMs,
        };
      }

      return {
        ok: true,
        message: 'Groq API reachable and key valid',
        latencyMs,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - startTime;
      const isTimeout = (err as Error)?.name === 'AbortError';
      return {
        ok: false,
        message: isTimeout
          ? 'Groq health check timed out after 10s'
          : `Groq health check failed: ${(err as Error)?.message || String(err)}`,
        latencyMs,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Dispatches a chat completion request to Groq API
   */
  async sendRequest(req: AIRequest): Promise<AIResponse> {
    if (!this.apiKey) {
      throw new AIProviderError(
        'Groq API key is not configured. Set AI_API_KEY environment variable.',
        this.name,
        false
      );
    }

    const model = req.modelId || this.defaultModel;
    const timeoutMs = req.timeout || this.defaultTimeoutMs;
    const startTime = Date.now();

    // Format response_format if JSON requested
    let responseFormatPayload: { type: string } | undefined;
    if (req.responseFormat === 'json' || (typeof req.responseFormat === 'object' && req.responseFormat?.type === 'json_object')) {
      responseFormatPayload = { type: 'json_object' };
    }

    const maxTokens = req.maxTokens || parseInt(process.env.GROQ_MAX_TOKENS || '16384', 10);

    // Prepare payload
    const payload: Record<string, any> = {
      model,
      messages: req.messages,
      temperature: req.temperature ?? 0.2,
      max_tokens: maxTokens,
      max_completion_tokens: maxTokens,
      response_format: responseFormatPayload,
    };

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    logger.debug(
      { provider: this.name, model, role: req.role, correlationId: req.correlationId },
      'Sending request to Groq API'
    );

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        let errorBody: unknown;
        let errorMessage = `Groq API responded with HTTP ${response.status}: ${response.statusText}`;

        try {
          errorBody = await response.json();
          if (
            errorBody &&
            typeof errorBody === 'object' &&
            'error' in errorBody
          ) {
            const errObj = (errorBody as { error?: { message?: string } }).error;
            if (errObj?.message) {
              errorMessage = `Groq error: ${errObj.message}`;
            }
          }
        } catch {
          try {
            const raw = await response.text();
            if (raw) errorMessage = `Groq error: ${raw.slice(0, 300)}`;
          } catch {
            // ignore fallback error
          }
        }

        const isNotFoundOrInaccessible =
          response.status === 404 ||
          errorMessage.toLowerCase().includes('does not exist or you do not have access to it') ||
          errorMessage.toLowerCase().includes('model_not_found') ||
          (typeof errorBody === 'object' && (errorBody as any)?.error?.code === 'model_not_found');

        const isRetryable =
          !isNotFoundOrInaccessible &&
          (response.status === 429 || // Rate limit
           response.status === 503 || // Service unavailable
           response.status === 504 || // Gateway timeout
           response.status === 502);  // Bad gateway

        const retryAfterHeader = response.headers.get('retry-after');
        const retryAfterSeconds = retryAfterHeader
          ? parseInt(retryAfterHeader, 10)
          : undefined;

        logger.warn(
          {
            provider: this.name,
            model,
            status: response.status,
            isRetryable,
            isNotFoundOrInaccessible,
            retryAfterSeconds,
            errorMessage,
          },
          'Groq API returned an error response'
        );

        throw new AIProviderError(
          errorMessage,
          this.name,
          isRetryable,
          {
            statusCode: isNotFoundOrInaccessible ? 404 : response.status,
            notFound: isNotFoundOrInaccessible,
            model,
            retryAfter: retryAfterSeconds,
            details: errorBody,
          },
          isNotFoundOrInaccessible ? 404 : response.status
        );
      }

      const data = (await response.json()) as GroqChatCompletionResponse;
      const primaryChoice = data.choices?.[0];
      const content = primaryChoice?.message?.content ?? '';

      const inputTokens = data.usage?.prompt_tokens ?? 0;
      const outputTokens = data.usage?.completion_tokens ?? 0;

      logger.debug(
        {
          provider: this.name,
          model,
          latencyMs,
          inputTokens,
          outputTokens,
          finishReason: primaryChoice?.finish_reason,
        },
        'Groq API request succeeded'
      );

      return {
        content,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: data.usage?.total_tokens ?? inputTokens + outputTokens,
        },
        model,
        provider: this.name,
        requestId: data.id,
        latencyMs,
        cached: false,
        finishReason: primaryChoice?.finish_reason,
        raw: data,
      };
    } catch (err: unknown) {
      if (err instanceof AIProviderError) {
        throw err;
      }

      const latencyMs = Date.now() - startTime;
      const isTimeout = (err as Error)?.name === 'AbortError';

      const message = isTimeout
        ? `Groq request timed out after ${timeoutMs}ms`
        : `Groq request network failure: ${(err as Error)?.message || String(err)}`;

      logger.error({ err, provider: this.name, latencyMs, isTimeout }, message);

      throw new AIProviderError(message, this.name, true, {
        originalError: (err as Error)?.message || String(err),
        isTimeout,
        latencyMs,
      });
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
