/**
 * OpenRouter AI Provider Adapter
 * Integrates with OpenRouter API (OpenAI-compatible routing gateway)
 * Supporting multi-model routing, vision models, structured JSON output,
 * custom OpenRouter headers (HTTP-Referer, X-Title), and upstream error handling.
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
import { env } from '../../../config/index.js';

export interface OpenRouterAdapterOptions {
  apiKey?: string;
  defaultModel?: string;
  baseUrl?: string;
  siteUrl?: string;
  siteName?: string;
  defaultTimeoutMs?: number;
}

interface OpenRouterChatCompletionResponse {
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
    code?: number | string;
    message?: string;
    metadata?: unknown;
  };
}

export class OpenRouterAdapter implements AIProviderAdapter {
  readonly name: AIProvider = AIProvider.OPENROUTER;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly siteUrl: string;
  private readonly siteName: string;
  private readonly defaultTimeoutMs: number;

  constructor(options: OpenRouterAdapterOptions = {}) {
    this.apiKey = options.apiKey || process.env.OPENROUTER_API_KEY || '';
    this.baseUrl = (
      options.baseUrl || 'https://openrouter.ai/api/v1'
    ).replace(/\/$/, '');
    this.defaultModel =
      options.defaultModel ||
      process.env.OPENROUTER_MODEL ||
      'anthropic/claude-3.5-sonnet';
    this.siteUrl = options.siteUrl || env.WEB_ORIGIN || 'https://design-to-elementor.local';
    this.siteName = options.siteName || 'Design-to-Elementor';
    this.defaultTimeoutMs = options.defaultTimeoutMs || 60000;
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
    return modelId.trim().length > 0;
  }

  /**
   * Health check using OpenRouter key authentication endpoint
   */
  async checkHealth(): Promise<AIHealthCheckResult> {
    const startTime = Date.now();
    if (!this.apiKey) {
      return {
        ok: false,
        message: 'OpenRouter API key is not configured',
        latencyMs: 0,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      // Use /auth/key to check key validity and credits
      const response = await fetch(`${this.baseUrl}/auth/key`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'HTTP-Referer': this.siteUrl,
          'X-Title': this.siteName,
        },
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startTime;
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        return {
          ok: false,
          message: `OpenRouter health check returned HTTP ${response.status}: ${text.slice(0, 200)}`,
          latencyMs,
        };
      }

      const keyData = (await response.json()) as { data?: { label?: string; usage?: number; limit?: number } };
      return {
        ok: true,
        message: 'OpenRouter API reachable and key valid',
        latencyMs,
        details: keyData.data ? { keyInfo: keyData.data } : undefined,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - startTime;
      const isTimeout = (err as Error)?.name === 'AbortError';
      return {
        ok: false,
        message: isTimeout
          ? 'OpenRouter health check timed out after 10s'
          : `OpenRouter health check failed: ${(err as Error)?.message || String(err)}`,
        latencyMs,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Dispatches chat completion request to OpenRouter
   */
  async sendRequest(req: AIRequest): Promise<AIResponse> {
    if (!this.apiKey) {
      throw new AIProviderError(
        'OpenRouter API key is not configured. Set OPENROUTER_API_KEY environment variable.',
        this.name,
        false
      );
    }

    const model = req.modelId || this.defaultModel;
    const timeoutMs = req.timeout || this.defaultTimeoutMs;
    const startTime = Date.now();

    let responseFormatPayload: { type: string } | undefined;
    if (
      req.responseFormat === 'json' ||
      (typeof req.responseFormat === 'object' &&
        req.responseFormat?.type === 'json_object')
    ) {
      responseFormatPayload = { type: 'json_object' };
    }

    const payload = {
      model,
      messages: req.messages,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxTokens,
      response_format: responseFormatPayload,
    };

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    logger.debug(
      { provider: this.name, model, role: req.role, correlationId: req.correlationId },
      'Sending request to OpenRouter API'
    );

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'HTTP-Referer': this.siteUrl,
          'X-Title': this.siteName,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        let errorBody: unknown;
        let errorMessage = `OpenRouter API HTTP error ${response.status}: ${response.statusText}`;

        try {
          errorBody = await response.json();
          if (
            errorBody &&
            typeof errorBody === 'object' &&
            'error' in errorBody
          ) {
            const errObj = (errorBody as { error?: { message?: string; code?: unknown } }).error;
            if (errObj?.message) {
              errorMessage = `OpenRouter error: ${errObj.message}`;
            }
          }
        } catch {
          try {
            const raw = await response.text();
            if (raw) errorMessage = `OpenRouter error: ${raw.slice(0, 300)}`;
          } catch {
            // ignore
          }
        }

        // 429 = rate limit, 502/503/504 = upstream routing issues
        const isRetryable =
          response.status === 429 ||
          response.status === 502 ||
          response.status === 503 ||
          response.status === 504;

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
            retryAfterSeconds,
            errorMessage,
          },
          'OpenRouter API error response'
        );

        throw new AIProviderError(errorMessage, this.name, isRetryable, {
          statusCode: response.status,
          retryAfter: retryAfterSeconds,
          details: errorBody,
        });
      }

      const data = (await response.json()) as OpenRouterChatCompletionResponse;

      if (data.error) {
        const isRetryable =
          typeof data.error.code === 'number' &&
          (data.error.code === 429 || data.error.code >= 500);

        throw new AIProviderError(
          `OpenRouter error: ${data.error.message || 'Unknown error'}`,
          this.name,
          isRetryable,
          data.error
        );
      }

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
        'OpenRouter API request succeeded'
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
        ? `OpenRouter request timed out after ${timeoutMs}ms`
        : `OpenRouter request network failure: ${(err as Error)?.message || String(err)}`;

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
