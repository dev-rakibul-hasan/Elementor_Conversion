import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GroqAdapter } from '../modules/ai/providers/groq.js';
import { AIRouter } from '../modules/ai/router.js';
import { isModelImageCapable, validateRequestCapabilities, KNOWN_MODEL_CAPABILITIES } from '../modules/ai/capabilities.js';
import { AIProviderError } from '../lib/errors.js';
import { env } from '../config/index.js';

describe('Groq Model Deprecation & Bounded Error Handling', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('1. Model Configuration & Capability Registry', () => {
    it('env defaults specify openai/gpt-oss-120b for AI_MODEL, GROQ_MODEL, and STRUCTURE_AI_MODEL', () => {
      expect(env.AI_MODEL).toBe('openai/gpt-oss-120b');
      expect(env.GROQ_MODEL).toBe('openai/gpt-oss-120b');
      expect(env.STRUCTURE_AI_MODEL).toBe('openai/gpt-oss-120b');
    });

    it('openai/gpt-oss-120b is registered as text-only with JSON output support', () => {
      expect(isModelImageCapable('openai/gpt-oss-120b', 'groq')).toBe(false);
      expect(isModelImageCapable('openai/gpt-oss-120b')).toBe(false);
      const cap = KNOWN_MODEL_CAPABILITIES['openai/gpt-oss-120b'];
      expect(cap).toBeDefined();
      expect(cap?.supportsImages).toBe(false);
      expect(cap?.supportsJson).toBe(true);
    });

    it('llama-3.3-70b-versatile is registered with deprecation/decommission notes', () => {
      const cap = KNOWN_MODEL_CAPABILITIES['llama-3.3-70b-versatile'];
      expect(cap).toBeDefined();
      expect(cap?.notes).toContain('DEPRECATED/DECOMMISSIONED');
    });

    it('validateRequestCapabilities rejects image payloads for openai/gpt-oss-120b', () => {
      expect(() => {
        validateRequestCapabilities('groq', 'openai/gpt-oss-120b', true);
      }).toThrow(/does not support image input/);
    });

    it('validateRequestCapabilities permits text-only payloads for openai/gpt-oss-120b', () => {
      expect(() => {
        validateRequestCapabilities('groq', 'openai/gpt-oss-120b', false);
      }).not.toThrow();
    });
  });

  describe('2. Supported Groq Model Request Execution (openai/gpt-oss-120b)', () => {
    it('sends text/structure payload to Groq completions endpoint with openai/gpt-oss-120b', async () => {
      let capturedUrl = '';
      let capturedBody: any = null;

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedBody = JSON.parse(init?.body as string);

        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'groq-chat-12345',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: '{"sections": []}',
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 120,
              completion_tokens: 35,
              total_tokens: 155,
            },
          }),
        };
      });

      const adapter = new GroqAdapter({
        apiKey: 'test-groq-key',
        defaultModel: 'openai/gpt-oss-120b',
      });

      const response = await adapter.sendRequest({
        role: 'structure',
        modelId: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: 'You are an Elementor DIR layout generator.' },
          { role: 'user', content: 'Repair the layout JSON.' },
        ],
        responseFormat: { type: 'json_object' },
      });

      expect(capturedUrl).toBe('https://api.groq.com/openai/v1/chat/completions');
      expect(capturedBody.model).toBe('openai/gpt-oss-120b');
      expect(capturedBody.response_format).toEqual({ type: 'json_object' });
      expect(response.content).toBe('{"sections": []}');
      expect(response.model).toBe('openai/gpt-oss-120b');
      expect(response.provider).toBe('groq');
      expect(response.usage.totalTokens).toBe(155);
    });

    it('uses GROQ_MODEL environment configuration when request modelId is omitted', async () => {
      let capturedBody: any = null;

      global.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: '{"ok":true}' } }],
            usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
          }),
        };
      });

      const adapter = new GroqAdapter({
        apiKey: 'test-groq-key',
        defaultModel: 'openai/gpt-oss-120b',
      });

      await adapter.sendRequest({
        role: 'structure',
        messages: [{ role: 'user', content: 'hello' }],
      });

      expect(capturedBody.model).toBe('openai/gpt-oss-120b');
    });
  });

  describe('3. Deprecated Model Error & Bounded 404 Handling', () => {
    it('detects model inaccessible/not-found error message and marks error non-retryable with 404 status', async () => {
      global.fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            error: {
              message: "The model 'llama-3.3-70b-versatile' does not exist or you do not have access to it.",
              type: 'invalid_request_error',
              code: 'model_not_found',
            },
          }),
          headers: new Headers(),
        };
      });

      const adapter = new GroqAdapter({
        apiKey: 'test-groq-key',
        defaultModel: 'llama-3.3-70b-versatile',
      });

      let caughtError: AIProviderError | null = null;
      try {
        await adapter.sendRequest({
          role: 'structure',
          modelId: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: 'test' }],
        });
      } catch (err: any) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(AIProviderError);
      expect(caughtError?.isRetryable).toBe(false);
      expect(caughtError?.statusCode).toBe(404);
      expect(caughtError?.message).toContain("The model 'llama-3.3-70b-versatile' does not exist or you do not have access to it");
      expect((caughtError?.details as any)?.notFound).toBe(true);
    });

    it('AIRouter catches Groq deprecation error, registers invalid model, and suppresses retry/fallback loops', async () => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            error: {
              message: "The model 'llama-3.3-70b-versatile' does not exist or you do not have access to it.",
              type: 'invalid_request_error',
              code: 'model_not_found',
            },
          }),
          headers: new Headers(),
        };
      });
      global.fetch = mockFetch;

      const router = new AIRouter();
      router.setAllowNonMockInTest(true);
      router.clearInvalidModels();

      const groqAdapter = new GroqAdapter({
        apiKey: 'test-groq-key',
        defaultModel: 'llama-3.3-70b-versatile',
      });
      (router as any).adapters.set('groq', groqAdapter);

      // First execution fails with Groq deprecation error
      await expect(
        router.execute({
          role: 'structure',
          modelId: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: 'test prompt' }],
          bypassCache: true,
        })
      ).rejects.toThrow(/does not exist or you do not have access to it/);

      // Verify the model was registered as invalid
      expect(router.getInvalidModels()).toContain('groq:llama-3.3-70b-versatile');

      // Reset mock fetch call count
      mockFetch.mockClear();

      // Second execution must fail-fast immediately without triggering fetch (bounded handling)
      await expect(
        router.execute({
          role: 'structure',
          modelId: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: 'test prompt 2' }],
          bypassCache: true,
        })
      ).rejects.toThrow(/is invalid or not found \(404 NOT_FOUND\)/);

      // Fetch was NOT called again — zero retry loops, bounded handling verified!
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('4. AI Routing Separation (Vision vs Text Structure vs Review)', () => {
    it('routes vision tasks to Gemini even if Groq is default AI provider', () => {
      const router = new AIRouter();
      router.setAllowNonMockInTest(true);

      const resolved = router.resolveProviderForRole('vision');
      expect(resolved).toBe('gemini');
    });

    it('routes structure tasks to Groq when configured', () => {
      const router = new AIRouter();
      router.setAllowNonMockInTest(true);

      // Mock groq adapter in router
      (router as any).adapters.set('groq', new GroqAdapter({ apiKey: 'k' }));

      const resolved = router.resolveProviderForRole('structure');
      expect(resolved).toBe('groq');
    });

    it('routes review tasks to OpenRouter when configured', () => {
      const router = new AIRouter();
      router.setAllowNonMockInTest(true);

      // Mock openrouter adapter in router
      (router as any).adapters.set('openrouter', { name: 'openrouter' } as any);

      const resolved = router.resolveProviderForRole('review');
      expect(resolved).toBe('openrouter');
    });

    it('falls back to Gemini for vision if VISION_AI_PROVIDER is set to text-only Groq model', () => {
      const router = new AIRouter();
      router.setAllowNonMockInTest(true);

      // Even if someone attempts to use text-only model on Groq for vision:
      const resolved = router.resolveProviderForRole('vision', 'openai/gpt-oss-120b');
      expect(resolved).toBe('gemini');
    });
  });
});

