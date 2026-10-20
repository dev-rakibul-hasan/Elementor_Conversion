/**
 * Gemini AI Provider Adapter
 * Integrates directly with Google's Gemini API (v1beta generateContent)
 * Supporting inline multimodal vision data, structured JSON output, and Gemini error mappings.
 */

import {
  AICapability,
  AIHealthCheckResult,
  AIMessage,
  AIProvider,
  AIProviderAdapter,
  AIRequest,
  AIResponse,
} from '../types.js';
import { AIProviderError } from '../../../lib/errors.js';
import { logger } from '../../../lib/logger.js';
import { env } from '../../../config/index.js';

export interface GeminiAdapterOptions {
  apiKey?: string;
  defaultModel?: string;
  baseUrl?: string;
  defaultTimeoutMs?: number;
}

interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string; // base64
  };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiCandidate {
  content?: {
    parts?: GeminiPart[];
    role?: string;
  };
  finishReason?: string;
  safetyRatings?: Array<{
    category: string;
    probability: string;
  }>;
}

interface GeminiGenerateContentResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: unknown;
  };
}

export class GeminiAdapter implements AIProviderAdapter {
  readonly name: AIProvider = AIProvider.GEMINI;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly defaultTimeoutMs: number;

  constructor(options: GeminiAdapterOptions = {}) {
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY || '';
    this.baseUrl = (
      options.baseUrl || 'https://generativelanguage.googleapis.com/v1beta'
    ).replace(/\/$/, '');
    this.defaultModel =
      options.defaultModel ||
      env.GEMINI_MODEL ||
      process.env.GEMINI_MODEL ||
      'gemini-3.8-flash';
    this.defaultTimeoutMs = options.defaultTimeoutMs || 60000;
  }

  getCapabilities(): AICapability[] {
    return [
      AICapability.IMAGE_INPUT,
      AICapability.JSON_OUTPUT,
      AICapability.TEXT_GENERATION,
    ];
  }

  validateModel(modelId: string): boolean {
    if (!modelId || typeof modelId !== 'string') return false;
    return modelId.trim().length > 0;
  }

  /**
   * Lightweight health check against Google Gemini models endpoint
   */
  async checkHealth(): Promise<AIHealthCheckResult> {
    const startTime = Date.now();
    if (!this.apiKey) {
      return {
        ok: false,
        message: 'Gemini API key is not configured',
        latencyMs: 0,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const url = `${this.baseUrl}/models?key=${encodeURIComponent(this.apiKey)}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startTime;
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        return {
          ok: false,
          message: `Gemini health check returned HTTP ${response.status}: ${text.slice(0, 200)}`,
          latencyMs,
        };
      }

      return {
        ok: true,
        message: 'Gemini API reachable and key valid',
        latencyMs,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - startTime;
      const isTimeout = (err as Error)?.name === 'AbortError';
      return {
        ok: false,
        message: isTimeout
          ? 'Gemini health check timed out after 10s'
          : `Gemini health check failed: ${(err as Error)?.message || String(err)}`,
        latencyMs,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Helper to convert an image URL or data URI to inline base64 data for Gemini
   */
  private async resolveImageToInlineData(
    imageUrl: string
  ): Promise<{ mimeType: string; data: string }> {
    // 1. Check if it's already a base64 data URI
    const dataUriMatch = imageUrl.match(/^data:([^;]+);base64,(.+)$/s);
    if (dataUriMatch) {
      return {
        mimeType: dataUriMatch[1],
        data: dataUriMatch[2].replace(/\s/g, ''),
      };
    }

    // 2. If it's a raw base64 string
    if (/^[A-Za-z0-9+/=]+$/.test(imageUrl.slice(0, 100)) && imageUrl.length > 200) {
      return {
        mimeType: 'image/png',
        data: imageUrl.replace(/\s/g, ''),
      };
    }

    // 3. If it's an HTTP/HTTPS URL, download it
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      const res = await fetch(imageUrl);
      if (!res.ok) {
        throw new Error(`Failed to fetch image from URL: ${imageUrl} (${res.status})`);
      }
      const contentType = res.headers.get('content-type') || 'image/png';
      const arrayBuffer = await res.arrayBuffer();
      const base64Data = Buffer.from(arrayBuffer).toString('base64');
      return {
        mimeType: contentType,
        data: base64Data,
      };
    }

    // 4. If it's a local filesystem path
    if (
      typeof imageUrl === 'string' &&
      (imageUrl.startsWith('./') ||
        imageUrl.startsWith('/') ||
        /^[a-zA-Z]:[\\/]/.test(imageUrl) ||
        imageUrl.startsWith('storage'))
    ) {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const resolved = path.resolve(imageUrl);
        if (fs.existsSync(resolved)) {
          const buf = await fs.promises.readFile(resolved);
          const ext = path.extname(resolved).toLowerCase();
          const mimeType =
            ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
          return {
            mimeType,
            data: buf.toString('base64'),
          };
        }
      } catch {
        // Fall through
      }
    }

    throw new Error('Unsupported image URL format for Gemini inlineData');
  }

  /**
   * Translates unified AIMessage[] to Gemini format (systemInstruction + contents)
   */
  private async convertMessagesToGemini(
    messages: AIMessage[],
    systemInstructionOverride?: string
  ): Promise<{
    systemInstruction?: { parts: GeminiPart[] };
    contents: GeminiContent[];
  }> {
    const systemParts: GeminiPart[] = [];
    if (systemInstructionOverride) {
      systemParts.push({ text: systemInstructionOverride });
    }

    const contents: GeminiContent[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        const textContent =
          typeof msg.content === 'string'
            ? msg.content
            : msg.content
                .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
                .map((p) => p.text)
                .join('\n');
        systemParts.push({ text: textContent });
        continue;
      }

      const role: 'user' | 'model' = msg.role === 'assistant' ? 'model' : 'user';
      const parts: GeminiPart[] = [];

      if (typeof msg.content === 'string') {
        parts.push({ text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text') {
            parts.push({ text: part.text });
          } else if (part.type === 'image_url') {
            const inline = await this.resolveImageToInlineData(part.image_url.url);
            parts.push({ inlineData: inline });
          }
        }
      }

      if (parts.length > 0) {
        contents.push({ role, parts });
      }
    }

    return {
      systemInstruction:
        systemParts.length > 0 ? { parts: systemParts } : undefined,
      contents,
    };
  }

  /**
   * Dispatches generateContent request to Gemini API
   */
  async sendRequest(req: AIRequest): Promise<AIResponse> {
    if (!this.apiKey) {
      throw new AIProviderError(
        'Gemini API key is not configured. Set GEMINI_API_KEY environment variable.',
        this.name,
        false
      );
    }

    const configuredModel =
      process.env.GEMINI_MODEL ||
      env.GEMINI_MODEL ||
      this.defaultModel ||
      'gemini-3.8-flash';
    const model = req.modelId || configuredModel;
    const timeoutMs = req.timeout || this.defaultTimeoutMs;
    const startTime = Date.now();

    // Map messages
    const { systemInstruction, contents } = await this.convertMessagesToGemini(
      req.messages,
      req.systemInstruction
    );

    // Build generationConfig
    const generationConfig: Record<string, unknown> = {
      temperature: req.temperature ?? 0.2,
    };

    if (req.maxTokens) {
      generationConfig.maxOutputTokens = req.maxTokens;
    }

    // JSON output support
    const isJsonRequested =
      req.responseFormat === 'json' ||
      (typeof req.responseFormat === 'object' &&
        req.responseFormat?.type === 'json_object');

    if (isJsonRequested) {
      generationConfig.responseMimeType = 'application/json';
    }

    const requestPayload: Record<string, unknown> = {
      contents,
      generationConfig,
    };

    if (systemInstruction) {
      requestPayload.systemInstruction = systemInstruction;
    }

    let cleanModelName = model.replace(/^models\//, '');
    let endpoint = `${this.baseUrl}/models/${cleanModelName}:generateContent?key=${encodeURIComponent(
      this.apiKey
    )}`;

    const fallbackModels = [
      cleanModelName,
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.5-flash',
      'gemini-flash-latest',
    ];
    const candidateModels = Array.from(new Set(fallbackModels));
    const triedModels = new Set<string>([cleanModelName]);
    let currentModelIndex = candidateModels.indexOf(cleanModelName);
    if (currentModelIndex === -1) currentModelIndex = 0;
    const maxAttempts = (process.env.NODE_ENV === 'test' ? 2 : Math.min(candidateModels.length, 4));
    let attempt = 0;

    while (attempt < maxAttempts) {
      attempt++;
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

      logger.debug(
        { provider: this.name, model: cleanModelName, role: req.role, correlationId: req.correlationId, attempt, maxAttempts },
        'Sending request to Gemini API'
      );

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestPayload),
          signal: controller.signal,
        });

        const latencyMs = Date.now() - startTime;

        if (!response.ok) {
          let errorDetails: unknown;
          let errorMessage = `Gemini API HTTP error ${response.status}: ${response.statusText}`;

          try {
            errorDetails = await response.json();
            if (
              errorDetails &&
              typeof errorDetails === 'object' &&
              'error' in errorDetails
            ) {
              const errObj = (errorDetails as { error?: { message?: string; status?: string; code?: number } }).error;
              if (errObj?.message) {
                errorMessage = `Gemini error [${errObj.status || response.status}]: ${errObj.message}`;
              }
            }
          } catch {
            try {
              const raw = await response.text();
              if (raw) errorMessage = `Gemini error: ${raw.slice(0, 300)}`;
            } catch {
              // ignore
            }
          }

          const isNotFound =
            response.status === 404 ||
            (typeof errorDetails === 'object' &&
              ((errorDetails as any)?.error?.status === 'NOT_FOUND' ||
                (errorDetails as any)?.error?.code === 404 ||
                String((errorDetails as any)?.error?.message || '').toLowerCase().includes('not found') ||
                String((errorDetails as any)?.error?.message || '').toLowerCase().includes('not supported'))) ||
            errorMessage.toLowerCase().includes('not found') ||
            errorMessage.toLowerCase().includes('not supported for generatecontent');

          if (isNotFound) {
            errorMessage = `[NOT_FOUND] models/${cleanModelName} is not found for API version v1beta, or is not supported for generateContent. Please update GEMINI_MODEL / VISION_AI_MODEL in .env to a supported model (e.g. gemini-3.8-flash).`;
          }

          const isRateLimited =
            response.status === 429 ||
            (typeof errorDetails === 'object' &&
              (errorDetails as { error?: { status?: string } })?.error?.status ===
                'RESOURCE_EXHAUSTED');

          // Check if quota exhaustion (free tier request limit exceeded on this specific model)
          const isQuotaExhausted =
            !isNotFound &&
            isRateLimited &&
            (errorMessage.toLowerCase().includes('quota') ||
              errorMessage.toLowerCase().includes('resource_exhausted') ||
              errorMessage.toLowerCase().includes('free_tier_requests'));

          if (isQuotaExhausted) {
            const fallbackCandidates = ['gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-flash-lite-latest'];
            const nextCandidate = fallbackCandidates.find((m) => m !== cleanModelName && !triedModels.has(m));
            if (nextCandidate) {
              logger.warn(
                { from: cleanModelName, to: nextCandidate, reason: 'Gemini free-tier quota exhausted on model' },
                'Failing over to alternative healthy Gemini model'
              );
              triedModels.add(nextCandidate);
              cleanModelName = nextCandidate;
              endpoint = `${this.baseUrl}/models/${cleanModelName}:generateContent?key=${encodeURIComponent(
                this.apiKey
              )}`;
              clearTimeout(timeoutHandle);
              attempt = 0;
              continue;
            }
          }

          const isRetryable =
            !isNotFound &&
            (isRateLimited ||
              response.status === 503 ||
              response.status === 500 ||
              response.status === 504);

          const retryAfterHeader = response.headers.get('retry-after');
          const retryAfterSeconds = retryAfterHeader
            ? parseInt(retryAfterHeader, 10)
            : undefined;

          // Bounded retry for transient 503 / 429 / 504 with Retry-After header respect and model cascade
          const isHighDemandOr503 = response.status === 503 || (errorMessage && /high demand/i.test(errorMessage));
          const isTransient = !isNotFound && (isHighDemandOr503 || response.status === 429 || response.status === 504);
          if (isTransient && attempt < maxAttempts) {
            const waitMs = retryAfterSeconds && !isNaN(retryAfterSeconds)
              ? Math.min(Math.max(retryAfterSeconds, 1) * 1000, 10000)
              : Math.min(1500 * attempt, 5000);

            // Dynamic model cascade on high demand
            if (isHighDemandOr503 && currentModelIndex + 1 < candidateModels.length) {
              currentModelIndex++;
              cleanModelName = candidateModels[currentModelIndex];
              endpoint = `${this.baseUrl}/models/${cleanModelName}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
              logger.warn(
                { fromModel: candidateModels[currentModelIndex - 1], toModel: cleanModelName },
                'Gemini model under high demand; dynamically cascading to next available flash model'
              );
            }

            logger.warn(
              {
                provider: this.name,
                model: cleanModelName,
                status: response.status,
                attempt,
                maxAttempts,
                waitMs,
                retryAfterSeconds,
              },
              'Gemini API transient error encountered; executing bounded retry with backoff'
            );

            clearTimeout(timeoutHandle);
            await new Promise((res) => setTimeout(res, waitMs));
            continue;
          }

          logger.warn(
            {
              provider: this.name,
              model: cleanModelName,
              status: response.status,
              isNotFound,
              isRetryable,
              retryAfterSeconds,
              errorMessage,
            },
            'Gemini API returned error'
          );

          throw new AIProviderError(
            errorMessage,
            this.name,
            isRetryable,
            {
              statusCode: isNotFound ? 404 : response.status,
              notFound: isNotFound,
              model: cleanModelName,
              retryAfter: retryAfterSeconds,
              details: errorDetails,
            },
            isNotFound ? 404 : (response.status || 502)
          );
        }

      const data = (await response.json()) as GeminiGenerateContentResponse;

      if (data.error) {
        const isNotFound =
          data.error.code === 404 ||
          data.error.status === 'NOT_FOUND' ||
          String(data.error.message || '').toLowerCase().includes('not found') ||
          String(data.error.message || '').toLowerCase().includes('not supported');

        const message = isNotFound
          ? `[NOT_FOUND] models/${cleanModelName} is not found for API version v1beta, or is not supported for generateContent. Set GEMINI_MODEL in .env to a supported model (e.g. gemini-3.8-flash).`
          : `Gemini error: ${data.error.message || 'Unknown error'}`;

        throw new AIProviderError(
          message,
          this.name,
          !isNotFound && data.error.status === 'RESOURCE_EXHAUSTED',
          { notFound: isNotFound, model: cleanModelName, details: data.error }
        );
      }

      const candidate = data.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      const content = parts.map((p) => p.text || '').join('');

      const inputTokens = data.usageMetadata?.promptTokenCount ?? 0;
      const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;
      const totalTokens = data.usageMetadata?.totalTokenCount ?? inputTokens + outputTokens;

      logger.debug(
        {
          provider: this.name,
          model: cleanModelName,
          latencyMs,
          inputTokens,
          outputTokens,
          finishReason: candidate?.finishReason,
        },
        'Gemini API request succeeded'
      );

      return {
        content,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens,
        },
        model: cleanModelName,
        provider: this.name,
        latencyMs,
        cached: false,
        finishReason: candidate?.finishReason,
        raw: data,
      };
    } catch (err: unknown) {
      if (err instanceof AIProviderError) {
        throw err;
      }

      const latencyMs = Date.now() - startTime;
      const isTimeout = (err as Error)?.name === 'AbortError';

      const message = isTimeout
        ? `Gemini request timed out after ${timeoutMs}ms`
        : `Gemini request failure: ${(err as Error)?.message || String(err)}`;

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

  throw new AIProviderError('Gemini request failed after max retry attempts', this.name, true);
}
}

