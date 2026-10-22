/**
 * AI Module — Router & Orchestrator
 * Routes requests to providers (Mock, Groq, Gemini, OpenRouter), handles caching,
 * role assignment, image capability validation, fallback, and circuit breakers.
 */

import type {
  AIProvider,
  AIRole,
  AIRequest,
  AIResponse,
  AIProviderAdapter,
  AIRoutingMode,
} from './types.js';
import { env } from '../../config/index.js';
import { logger } from '../../lib/logger.js';
import { AIProviderError } from '../../lib/errors.js';
import { MockAIAdapter } from './mock-adapter.js';
import { GroqAdapter } from './providers/groq.js';
import { GeminiAdapter } from './providers/gemini.js';
import { OpenRouterAdapter } from './providers/openrouter.js';
import { stageAICache } from './cache.js';
import { isModelImageCapable, validateRequestCapabilities, KNOWN_MODEL_CAPABILITIES } from './capabilities.js';

interface ProviderCooldown {
  until: number;
  reason: string;
}

export class AIRouter {
  private adapters = new Map<AIProvider, AIProviderAdapter>();
  private cache = stageAICache;
  private mode: AIRoutingMode = 'economy';
  private cooldowns = new Map<AIProvider, ProviderCooldown>();
  private invalidModels = new Set<string>();

  private allowNonMockInTest = false;

  constructor() {
    this.initAdapters();
  }

  private initAdapters() {
    // Register mock adapter (always available for test/dev)
    this.adapters.set('mock', new MockAIAdapter());

    const timeoutMs = env.AI_REQUEST_TIMEOUT_MS || 120000;

    const groqKey = process.env.AI_API_KEY || env.AI_API_KEY || (env.NODE_ENV === 'test' ? 'test-groq-key' : '');
    if (groqKey) {
      this.adapters.set('groq', new GroqAdapter({
        apiKey: groqKey,
        defaultModel: process.env.GROQ_MODEL || env.GROQ_MODEL || process.env.STRUCTURE_AI_MODEL || env.STRUCTURE_AI_MODEL || process.env.AI_MODEL || env.AI_MODEL || 'openai/gpt-oss-120b',
        defaultTimeoutMs: timeoutMs,
      }));
    }
    const geminiKey = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY || (env.NODE_ENV === 'test' ? 'test-gemini-key' : '');
    if (env.ENABLE_GEMINI && geminiKey) {
      this.adapters.set('gemini', new GeminiAdapter({
        apiKey: geminiKey,
        defaultTimeoutMs: timeoutMs,
      }));
    }
    const openrouterKey = process.env.OPENROUTER_API_KEY || env.OPENROUTER_API_KEY || (env.NODE_ENV === 'test' ? 'test-openrouter-key' : '');
    if (openrouterKey) {
      this.adapters.set('openrouter', new OpenRouterAdapter({
        apiKey: openrouterKey,
        defaultModel: env.OPENROUTER_MODEL,
        defaultTimeoutMs: timeoutMs,
      }));
    }
  }

  public setAllowNonMockInTest(allow: boolean): void {
    this.allowNonMockInTest = allow;
  }

  public setMode(mode: AIRoutingMode) {
    this.mode = mode;
  }

  public getMode(): AIRoutingMode {
    return this.mode;
  }

  public getAdapter(provider: AIProvider): AIProviderAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new AIProviderError(`AI provider '${provider}' is not configured`, provider, false);
    }
    return adapter;
  }

  public isProviderAvailable(provider: AIProvider): boolean {
    const cooldown = this.cooldowns.get(provider);
    if (cooldown) {
      if (Date.now() < cooldown.until) {
        return false;
      }
      this.cooldowns.delete(provider);
    }
    return this.adapters.has(provider);
  }

  public setProviderCooldown(provider: AIProvider, durationMs: number, reason: string): void {
    this.cooldowns.set(provider, {
      until: Date.now() + durationMs,
      reason,
    });
    logger.warn({ provider, durationMs, reason }, 'Provider placed in cooldown');
  }

  /**
   * Resolves the most appropriate provider for the requested role,
   * strictly verifying image input capabilities for vision requests.
   */
  public resolveProviderForRole(role: AIRole, modelOverride?: string): AIProvider {
    if (!env.RUN_LIVE_AI_TESTS && env.NODE_ENV === 'test' && !this.allowNonMockInTest) {
      return 'mock';
    }

    if (role === 'vision') {
      // 1. Check explicit vision provider override if configured
      if (env.VISION_AI_PROVIDER && this.isProviderAvailable(env.VISION_AI_PROVIDER as AIProvider)) {
        const prov = env.VISION_AI_PROVIDER as AIProvider;
        // Verify Groq vision models specifically:
        if (prov === 'groq') {
          const isGroqModel = modelOverride && KNOWN_MODEL_CAPABILITIES[modelOverride]?.provider === 'groq';
          const candidateModel = (isGroqModel ? modelOverride : null) || env.VISION_AI_MODEL || env.AI_MODEL || 'openai/gpt-oss-120b';
          if (isModelImageCapable(candidateModel, 'groq')) {
            return 'groq';
          }
          // If Groq model is text-only (e.g. openai/gpt-oss-120b or llama-3.3-70b), fall through to Gemini!
          logger.info({ candidateModel }, 'Groq model is text-only; routing vision task to image-capable provider');
        } else {
          return prov;
        }
      }

      // 2. Default to Gemini for vision tasks if available (Gemini is verified image-capable)
      if (env.ENABLE_GEMINI && this.isProviderAvailable('gemini')) {
        return 'gemini';
      }

      // 3. Check OpenRouter if available with verified vision model
      if (this.isProviderAvailable('openrouter')) {
        const isOpenRouterModel = modelOverride && (KNOWN_MODEL_CAPABILITIES[modelOverride]?.provider === 'openrouter' || modelOverride.includes('/'));
        const candidateModel = (isOpenRouterModel ? modelOverride : null) || process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3.5-super-vl:free';
        if (isModelImageCapable(candidateModel, 'openrouter')) {
          return 'openrouter';
        }
      }

      // 4. Check if primary AI_PROVIDER is Groq with a verified vision model
      if (env.AI_PROVIDER === 'groq' && this.isProviderAvailable('groq')) {
        const isGroqModel = modelOverride && KNOWN_MODEL_CAPABILITIES[modelOverride]?.provider === 'groq';
        const candidateModel = (isGroqModel ? modelOverride : null) || env.AI_MODEL || '';
        if (candidateModel && isModelImageCapable(candidateModel, 'groq')) {
          return 'groq';
        }
      }

      if ((env.NODE_ENV === 'test' && !this.allowNonMockInTest) || env.AI_PROVIDER === 'mock' || process.env.ALLOW_MOCK_FALLBACK === 'true') {
        return 'mock';
      }

      throw new AIProviderError(
        'No image-capable AI provider is configured or available for vision tasks. Check GEMINI_API_KEY, OPENROUTER_API_KEY, or model configuration.',
        'gemini',
        false,
        { role: 'vision' }
      );
    }

    const isMockPermitted = (env.NODE_ENV === 'test' && !this.allowNonMockInTest) || env.AI_PROVIDER === 'mock' || process.env.ALLOW_MOCK_FALLBACK === 'true';

    switch (role) {
      case 'structure':
        if (env.STRUCTURE_AI_PROVIDER && this.isProviderAvailable(env.STRUCTURE_AI_PROVIDER as AIProvider)) {
          return env.STRUCTURE_AI_PROVIDER as AIProvider;
        }
        if (this.isProviderAvailable(env.AI_PROVIDER as AIProvider)) {
          return env.AI_PROVIDER as AIProvider;
        }
        if (isMockPermitted) return 'mock';
        throw new AIProviderError('No AI provider is configured or available for structure tasks.', 'groq', false, { role });

      case 'review':
        if (env.REVIEW_AI_PROVIDER && this.isProviderAvailable(env.REVIEW_AI_PROVIDER as AIProvider)) {
          return env.REVIEW_AI_PROVIDER as AIProvider;
        }
        if (this.isProviderAvailable(env.AI_PROVIDER as AIProvider)) {
          return env.AI_PROVIDER as AIProvider;
        }
        if (isMockPermitted) return 'mock';
        throw new AIProviderError('No AI provider is configured or available for review tasks.', 'groq', false, { role });

      default:
        if (isMockPermitted) return 'mock';
        throw new AIProviderError(`No AI provider is configured or available for ${role} tasks.`, 'groq', false, { role });
    }
  }

  public findAlternativeVisionProvider(excludeProvider: AIProvider, modelOverride?: string): { provider: AIProvider; model: string } | null {
    // 1. Try Gemini if not excluded and available
    if (excludeProvider !== 'gemini' && env.ENABLE_GEMINI && this.isProviderAvailable('gemini')) {
      const isGeminiModel = modelOverride && (modelOverride.startsWith('gemini-') || KNOWN_MODEL_CAPABILITIES[modelOverride]?.provider === 'gemini');
      const model = (isGeminiModel ? modelOverride : null) || process.env.GEMINI_MODEL || env.GEMINI_MODEL || 'gemini-3.8-flash';
      if (isModelImageCapable(model, 'gemini')) {
        return { provider: 'gemini', model };
      }
    }

    // 2. Try OpenRouter if not excluded, available, and image-capable
    if (excludeProvider !== 'openrouter' && this.isProviderAvailable('openrouter')) {
      const isOpenRouterModel = modelOverride && (KNOWN_MODEL_CAPABILITIES[modelOverride]?.provider === 'openrouter' || modelOverride.includes('/'));
      const model = (isOpenRouterModel ? modelOverride : null) || process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3.5-super-vl:free';
      if (model && isModelImageCapable(model, 'openrouter')) {
        return { provider: 'openrouter', model };
      }
      if (isModelImageCapable('nvidia/nemotron-3.5-super-vl:free', 'openrouter')) {
        return { provider: 'openrouter', model: 'nvidia/nemotron-3.5-super-vl:free' };
      }
    }

    // 3. Try Groq if not excluded, available, and image-capable
    if (excludeProvider !== 'groq' && this.isProviderAvailable('groq')) {
      const isGroqModel = modelOverride && KNOWN_MODEL_CAPABILITIES[modelOverride]?.provider === 'groq';
      const model = (isGroqModel ? modelOverride : null) || process.env.GROQ_MODEL || env.AI_MODEL || '';
      if (model && isModelImageCapable(model, 'groq')) {
        return { provider: 'groq', model };
      }
    }

    return null;
  }

  public findAlternativeTextProvider(excludeProvider: AIProvider): { provider: AIProvider; model?: string } | null {
    if (excludeProvider !== 'groq' && this.isProviderAvailable('groq')) {
      return { provider: 'groq', model: process.env.GROQ_MODEL || env.GROQ_MODEL || 'openai/gpt-oss-120b' };
    }
    if (excludeProvider !== 'gemini' && env.ENABLE_GEMINI && this.isProviderAvailable('gemini')) {
      return { provider: 'gemini', model: process.env.GEMINI_MODEL || env.GEMINI_MODEL || 'gemini-3.8-flash' };
    }
    if (excludeProvider !== 'openrouter' && this.isProviderAvailable('openrouter')) {
      return { provider: 'openrouter', model: process.env.OPENROUTER_MODEL };
    }
    return null;
  }

  public clearInvalidModels(): void {
    this.invalidModels.clear();
  }

  public getInvalidModels(): string[] {
    return Array.from(this.invalidModels);
  }

  public async invalidateCacheKey(cacheKey: string): Promise<boolean> {
    return this.cache.invalidateKey(cacheKey);
  }

  public async invalidateCacheByImage(sourceImageHash: string): Promise<number> {
    return this.cache.invalidateByImage(sourceImageHash);
  }

  public computeCacheKey(components: any): string {
    return this.cache.computeKey(components);
  }

  public async execute(req: AIRequest): Promise<AIResponse> {
    const hasImages = req.messages.some((m) =>
      Array.isArray(m.content) && m.content.some((part) => part.type === 'image_url')
    );

    const providerName = this.resolveProviderForRole(req.role, req.modelId);
    const adapter = this.getAdapter(providerName);

    const isModelValidForProvider = (m?: string, p?: AIProvider): boolean => {
      if (!m || !p) return false;
      const known = KNOWN_MODEL_CAPABILITIES[m.toLowerCase().trim()];
      if (known) return known.provider === p;
      if (p === 'gemini') return m.startsWith('gemini-');
      if (p === 'openrouter') return m.includes('/');
      if (p === 'groq') return m.includes('llama') || m.includes('gemma') || m.includes('mixtral') || m.includes('gpt-oss');
      return true;
    };

    const roleProvider = req.role === 'vision' ? env.VISION_AI_PROVIDER : req.role === 'structure' ? env.STRUCTURE_AI_PROVIDER : env.REVIEW_AI_PROVIDER;
    const roleModel = providerName === roleProvider ? (req.role === 'vision' ? env.VISION_AI_MODEL : req.role === 'structure' ? env.STRUCTURE_AI_MODEL : env.REVIEW_AI_MODEL) : undefined;
    const targetModel =
      (req.modelId && isModelValidForProvider(req.modelId, providerName))
        ? req.modelId
        : roleModel && isModelValidForProvider(roleModel, providerName) ? roleModel
        : (providerName === 'gemini'
          ? (req.role === 'vision'
              ? (process.env.VISION_AI_MODEL || env.VISION_AI_MODEL || process.env.GEMINI_MODEL || env.GEMINI_MODEL || 'gemini-3.8-flash')
              : (process.env.GEMINI_MODEL || env.GEMINI_MODEL || 'gemini-3.8-flash'))
          : providerName === 'openrouter'
          ? (req.role === 'vision'
              ? (process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3.5-super-vl:free')
              : (process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3.5-super-vl:free'))
          : providerName === 'groq'
          ? (req.role === 'structure'
              ? (process.env.STRUCTURE_AI_MODEL || env.STRUCTURE_AI_MODEL || process.env.GROQ_MODEL || env.GROQ_MODEL || process.env.AI_MODEL || env.AI_MODEL || 'openai/gpt-oss-120b')
              : (process.env.GROQ_MODEL || env.GROQ_MODEL || process.env.AI_MODEL || env.AI_MODEL || 'openai/gpt-oss-120b'))
          : ((adapter as any).defaultModel || 'default'));

    const modelKey = `${providerName}:${targetModel}`;

    // Fast-fail if model was previously verified as not found / unsupported (bounded handling)
    if (this.invalidModels.has(modelKey)) {
      throw new AIProviderError(
        `AI model '${targetModel}' for provider '${providerName}' is invalid or not found (404 NOT_FOUND). Update configuration in .env before retrying.`,
        providerName,
        false,
        { notFound: true, model: targetModel, statusCode: 404 }
      );
    }

    // Set resolved target model and timeout on request
    req.modelId = targetModel;
    if (!req.timeout && env.AI_REQUEST_TIMEOUT_MS) {
      req.timeout = env.AI_REQUEST_TIMEOUT_MS;
    }

    // Verify capabilities before dispatching request
    validateRequestCapabilities(providerName, targetModel, hasImages);

    // Check Cache
    if (!req.bypassCache) {
      const cacheKey = this.cache.computeKey({
        sourceImageHash: req.sourceImageHash,
        normalizedInput: req.messages,
        skillVersion: req.skillVersion,
        schemaVersion: req.schemaVersion,
        promptVersion: req.promptVersion,
        provider: providerName,
        model: targetModel,
        stage: req.stageName,
      });

      const cached = await this.cache.get(cacheKey);
      if (cached) {
        logger.info({ role: req.role, provider: providerName }, 'AI Cache Hit');
        return cached;
      }
    }

    try {
      const response = await adapter.sendRequest(req);
      if (!req.bypassCache && response && response.finishReason !== 'length') {
        await this.cache.set({
          sourceImageHash: req.sourceImageHash,
          normalizedInput: req.messages,
          skillVersion: req.skillVersion,
          schemaVersion: req.schemaVersion,
          promptVersion: req.promptVersion,
          provider: providerName,
          model: targetModel,
          stage: req.stageName,
        }, response);
      }
      return response;
    } catch (err: any) {
      logger.error({ role: req.role, provider: providerName, error: err.message }, 'Primary AI provider failed');

      // Check if model not found error (404 / NOT_FOUND / does not exist / model_not_found)
      const isNotFound =
        err.statusCode === 404 ||
        err.details?.notFound ||
        (err.message && (
          err.message.includes('NOT_FOUND') ||
          err.message.toLowerCase().includes('not found') ||
          err.message.toLowerCase().includes('does not exist or you do not have access to it') ||
          err.message.toLowerCase().includes('model_not_found') ||
          err.message.toLowerCase().includes('not supported for generatecontent')
        ));

      if (isNotFound) {
        this.invalidModels.add(modelKey);
        logger.warn({ provider: providerName, model: targetModel }, 'Model recorded as invalid/unsupported; will not retry');
        throw err;
      }

      // Check if 429 quota exhaustion — put provider on cooldown to avoid retry storm
      if (err.statusCode === 429 || (err.message && err.message.includes('429'))) {
        const retryAfterSec = err.retryAfterSeconds || err.details?.retryAfter || 60;
        this.setProviderCooldown(providerName, retryAfterSec * 1000, 'Rate limit / quota exhaustion');
      }

      // Bounded fallback: Only for retryable errors, fallback to at most ONE secondary provider
      const isRetryable = err.isRetryable ?? (err.statusCode === 429 || err.statusCode === 502 || err.statusCode === 503 || err.statusCode === 504);

      if (isRetryable && providerName !== 'mock') {
        const isMockPermitted = (env.NODE_ENV === 'test' && !this.allowNonMockInTest) || env.AI_PROVIDER === 'mock' || process.env.ALLOW_MOCK_FALLBACK === 'true';

        // 1. Attempt real fallback if an eligible image-capable/text-capable provider is available
        if (req.role === 'vision') {
          const alt = this.findAlternativeVisionProvider(providerName, req.modelId);
          if (alt) {
            logger.warn(
              { from: providerName, to: alt.provider, model: alt.model, error: err.message },
              'Primary vision provider failed with retryable error; attempting single bounded fallback to secondary real vision provider'
            );
            try {
              const fallbackAdapter = this.getAdapter(alt.provider);
              return await fallbackAdapter.sendRequest({ ...req, modelId: alt.model });
            } catch (fallbackErr: any) {
              logger.error({ altProvider: alt.provider, error: fallbackErr.message }, 'Secondary real vision provider also failed');
            }
          }
        } else {
          const alt = this.findAlternativeTextProvider(providerName);
          if (alt) {
            logger.warn(
              { from: providerName, to: alt.provider, model: alt.model, error: err.message },
              'Primary AI provider failed with retryable error; attempting single bounded fallback to secondary real provider'
            );
            try {
              const fallbackAdapter = this.getAdapter(alt.provider);
              return await fallbackAdapter.sendRequest({ ...req, modelId: alt.model });
            } catch (fallbackErr: any) {
              logger.error({ altProvider: alt.provider, error: fallbackErr.message }, 'Secondary real provider also failed');
            }
          }
        }

        // 2. Mock provider is ONLY permitted in explicit test or mock mode
        if (isMockPermitted) {
          logger.info('Attempting bounded fallback to Mock provider in test/mock mode');
          const fallback = this.getAdapter('mock');
          return await fallback.sendRequest(req);
        }

        // 3. For real user conversions, fail clearly with a structured, retryable provider-unavailable error (do NOT fabricate mock DIR)
        err.isRetryable = true;
        if (!err.statusCode) err.statusCode = 503;
        throw err;
      }

      throw err;
    }
  }
}

let routerInstance: AIRouter | null = null;

export function getAIRouter(): AIRouter {
  if (!routerInstance) {
    routerInstance = new AIRouter();
  }
  return routerInstance;
}
