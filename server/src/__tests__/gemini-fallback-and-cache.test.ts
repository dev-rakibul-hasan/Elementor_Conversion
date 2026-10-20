/**
 * Regression & Resilience Tests:
 * 1. Gemini transient 503 backoff and Retry-After header respect.
 * 2. Strict Fallback Policy: mock provider is NEVER used as an automatic fallback during real conversions.
 * 3. Real vision fallback routing: fallback to image-capable real providers only, never text-only models.
 * 4. Authoritative DIR schema metadata derivation and unrecognized key pruning.
 * 5. Breakpoints array normalization and required globals defaults.
 * 6. Cache isolation: Repair requests bypass cache to prevent false "AI Cache Hit" loops.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIRouter } from '../modules/ai/router.js';
import { GeminiAdapter } from '../modules/ai/providers/gemini.js';
import { normalizeDIR } from '../modules/dir/normalizer.js';
import { validateDIR } from '../modules/dir/schema.js';
import { AIProviderError } from '../lib/errors.js';

describe('Resilience & Fallback Policy (Gemini 503 & Cache Isolation)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Gemini 503 Transient Handling & Bounded Retry', () => {
    it('retries on 503 and succeeds on bounded attempt with Retry-After respect', async () => {
      let callCount = 0;
      const fakeFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
            headers: {
              get: (header: string) => (header.toLowerCase() === 'retry-after' ? '1' : null),
            },
            json: async () => ({
              error: {
                code: 503,
                status: 'UNAVAILABLE',
                message: 'This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.',
              },
            }),
            text: async () => '',
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify({ version: '1.0.0' }) }],
                  role: 'model',
                },
                finishReason: 'STOP',
              },
            ],
            usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 },
          }),
        };
      });

      vi.stubGlobal('fetch', fakeFetch);

      const gemini = new GeminiAdapter({ apiKey: 'test-gemini-key', defaultModel: 'gemini-3.8-flash' });
      const res = await gemini.sendRequest({
        role: 'vision',
        messages: [{ role: 'user', content: 'test request' }],
        maxTokens: 1000,
      });

      expect(callCount).toBe(2);
      expect(res.content).toContain('version');
    });

    it('exhausts retry on repeated 503 and throws retryable AIProviderError with status 503', async () => {
      let callCount = 0;
      const fakeFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        return {
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          headers: {
            get: () => null,
          },
          json: async () => ({
            error: {
              code: 503,
              status: 'UNAVAILABLE',
              message: 'This model is currently experiencing high demand.',
            },
          }),
          text: async () => '',
        };
      });

      vi.stubGlobal('fetch', fakeFetch);

      const gemini = new GeminiAdapter({ apiKey: 'test-gemini-key', defaultModel: 'gemini-3.8-flash' });

      await expect(
        gemini.sendRequest({
          role: 'vision',
          messages: [{ role: 'user', content: 'test request' }],
        })
      ).rejects.toThrow(/high demand/i);

      expect(callCount).toBe(2); // Initial attempt + 1 bounded retry
    });
  });

  describe('Strict Fallback Policy: Never Fallback to Mock in Non-Test/Non-Mock Mode', () => {
    it('does NOT fall back to mock provider in non-test mode when Gemini fails with 503', async () => {
      const router = new AIRouter();
      router.setAllowNonMockInTest(true); // Simulate non-test production behavior

      // Register mock Gemini adapter that throws 503
      const mockGeminiAdapter = {
        name: 'gemini' as const,
        getCapabilities: () => [],
        validateModel: () => true,
        checkHealth: async () => ({ ok: true, latencyMs: 1 }),
        sendRequest: vi.fn().mockRejectedValue(
          new AIProviderError('Gemini 503 Service Unavailable', 'gemini', true, {}, 503)
        ),
      };

      (router as any).adapters.set('gemini', mockGeminiAdapter);

      await expect(
        router.execute({
          role: 'vision',
          messages: [{ role: 'user', content: 'analyze image' }],
          modelId: 'gemini-3.8-flash',
        })
      ).rejects.toThrow(/Gemini 503 Service Unavailable/);
    });

    it('falls back to secondary real vision provider when available and image-capable', async () => {
      const router = new AIRouter();
      router.setAllowNonMockInTest(true);

      const mockGeminiAdapter = {
        name: 'gemini' as const,
        getCapabilities: () => [],
        validateModel: () => true,
        checkHealth: async () => ({ ok: true, latencyMs: 1 }),
        sendRequest: vi.fn().mockRejectedValue(
          new AIProviderError('Gemini 503 Service Unavailable', 'gemini', true, {}, 503)
        ),
      };

      const mockOpenRouterAdapter = {
        name: 'openrouter' as const,
        getCapabilities: () => [],
        validateModel: () => true,
        checkHealth: async () => ({ ok: true, latencyMs: 1 }),
        sendRequest: vi.fn().mockResolvedValue({
          content: JSON.stringify({ version: '1.0.0', pages: [] }),
          usage: { inputTokens: 50, outputTokens: 50, totalTokens: 100 },
          model: 'google/gemini-2.0-flash-001',
          provider: 'openrouter',
          latencyMs: 100,
          cached: false,
        }),
      };

      (router as any).adapters.set('gemini', mockGeminiAdapter);
      (router as any).adapters.set('openrouter', mockOpenRouterAdapter);

      // Mock findAlternativeVisionProvider to return openrouter
      vi.spyOn(router, 'findAlternativeVisionProvider').mockReturnValue({
        provider: 'openrouter',
        model: 'google/gemini-2.0-flash-001',
      });

      const response = await router.execute({
        role: 'vision',
        messages: [{ role: 'user', content: 'analyze image' }],
        modelId: 'gemini-3.8-flash',
      });

      expect(response.provider).toBe('openrouter');
      expect(response.content).toContain('1.0.0');
    });

    it('never routes images to text-only Groq models (e.g. openai/gpt-oss-120b)', async () => {
      const router = new AIRouter();
      const alt = router.findAlternativeVisionProvider('gemini');

      if (alt) {
        expect(alt.provider).not.toBe('groq');
      }
    });
  });

  describe('DIR Normalizer: Metadata Pruning, Breakpoints Array, and Required Globals', () => {
    it('prunes unrecognized keys from doc.meta to conform to strict Zod schema', () => {
      const rawDoc = {
        version: '1.0.0',
        meta: {
          sourceImageHash: 'hash-123',
          sourceWidth: 1440,
          sourceHeight: 900,
          analysisProvider: 'groq',
          analysisModel: 'openai/gpt-oss-120b',
          analysisTimestamp: '2026-10-15T00:00:00Z',
          confidenceScore: 0.9,
          schemaVersion: '1.0.0',
          promptVersion: '1.0.0',
          // Unrecognized keys produced by LLMs:
          title: 'Landing Page',
          description: 'A modern landing page',
          role: 'main-view',
        },
        breakpoints: { desktop: { min: 1024 } },
        globals: {
          colors: { background: '#ffffff', text: '#000000' },
          typography: { fontFamilies: ['Inter'] },
        },
        assets: [],
        pages: [
          {
            id: 'page_main',
            name: 'Home',
            sections: [
              {
                id: 'sec_1',
                role: 'hero',
                confidence: 0.95,
                styles: {},
                children: [],
              },
            ],
          },
        ],
      };

      const normalized = normalizeDIR(rawDoc);
      expect((normalized.meta as any).title).toBeUndefined();
      expect((normalized.meta as any).description).toBeUndefined();
      expect((normalized.meta as any).role).toBeUndefined();

      const validation = validateDIR(normalized);
      expect(validation.valid).toBe(true);
    });

    it('normalizes breakpoints returned as an array into desktop/tablet/mobile object', () => {
      const rawDoc = {
        version: '1.0.0',
        meta: {
          sourceImageHash: 'hash-123',
          sourceWidth: 1440,
          sourceHeight: 900,
          analysisProvider: 'groq',
          analysisModel: 'openai/gpt-oss-120b',
          analysisTimestamp: '2026-10-15T00:00:00Z',
          confidenceScore: 0.9,
          schemaVersion: '1.0.0',
          promptVersion: '1.0.0',
        },
        breakpoints: [1024, 768, 375], // Array instead of object!
        globals: {
          colors: { background: '#ffffff', text: '#000000' },
          typography: { fontFamilies: ['Inter'] },
        },
        assets: [],
        pages: [
          {
            id: 'page_main',
            name: 'Home',
            sections: [
              {
                id: 'sec_1',
                role: 'hero',
                confidence: 0.95,
                styles: {},
                children: [],
              },
            ],
          },
        ],
      };

      const normalized = normalizeDIR(rawDoc);
      expect(normalized.breakpoints).toBeTypeOf('object');
      expect(Array.isArray(normalized.breakpoints)).toBe(false);
      expect(normalized.breakpoints.desktop.min).toBe(1024);

      const validation = validateDIR(normalized);
      expect(validation.valid).toBe(true);
    });

    it('fills required globals.colors and globals.typography defaults if missing', () => {
      const rawDoc = {
        version: '1.0.0',
        meta: {
          sourceImageHash: 'hash-123',
          sourceWidth: 1440,
          sourceHeight: 900,
          analysisProvider: 'groq',
          analysisModel: 'openai/gpt-oss-120b',
          analysisTimestamp: '2026-10-15T00:00:00Z',
          confidenceScore: 0.9,
          schemaVersion: '1.0.0',
          promptVersion: '1.0.0',
        },
        breakpoints: { desktop: { min: 1024 } },
        globals: {}, // Missing colors and typography
        assets: [],
        pages: [
          {
            id: 'page_main',
            name: 'Home',
            sections: [
              {
                id: 'sec_1',
                role: 'hero',
                confidence: 0.95,
                styles: {},
                children: [],
              },
            ],
          },
        ],
      };

      const normalized = normalizeDIR(rawDoc);
      expect(normalized.globals.colors.background).toBe('#ffffff');
      expect(normalized.globals.colors.text).toBe('#0f172a');
      expect(normalized.globals.typography.fontFamilies).toContain('Inter');

      const validation = validateDIR(normalized);
      expect(validation.valid).toBe(true);
    });
  });

  describe('Cache Isolation for DIR Repair', () => {
    it('bypasses cache when bypassCache is true to prevent false cache hit on repair attempt', async () => {
      const router = new AIRouter();
      const mockAdapter = {
        name: 'mock' as const,
        getCapabilities: () => [],
        validateModel: () => true,
        checkHealth: async () => ({ ok: true, latencyMs: 1 }),
        sendRequest: vi.fn().mockImplementation(async () => ({
          content: JSON.stringify({ version: '1.0.0', pages: [] }),
          usage: { inputTokens: 50, outputTokens: 50, totalTokens: 100 },
          model: 'openai/gpt-oss-120b',
          provider: 'groq',
          latencyMs: 50,
          cached: false,
        })),
      };

      (router as any).adapters.set('mock', mockAdapter);

      // Call 1 with bypassCache: true
      await router.execute({
        role: 'structure',
        messages: [{ role: 'user', content: 'repair dir' }],
        stageName: 'dir_repair',
        bypassCache: true,
      });

      // Call 2 with bypassCache: true
      await router.execute({
        role: 'structure',
        messages: [{ role: 'user', content: 'repair dir' }],
        stageName: 'dir_repair',
        bypassCache: true,
      });

      // Adapter must be called twice, never short-circuited by cache hit
      expect(mockAdapter.sendRequest).toHaveBeenCalledTimes(2);
    });
  });
});
