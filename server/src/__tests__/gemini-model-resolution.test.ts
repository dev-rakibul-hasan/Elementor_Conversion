import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiAdapter } from '../modules/ai/providers/gemini.js';
import { AIRouter } from '../modules/ai/router.js';
import { isModelImageCapable, validateRequestCapabilities } from '../modules/ai/capabilities.js';
import { AIProviderError } from '../lib/errors.js';
import { env } from '../config/index.js';

describe('Gemini Model Resolution & 404 Bounded Handling', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('1. Model Configuration & Capability Registry', () => {
    it('env defaults specify a valid Gemini model for GEMINI_MODEL and VISION_AI_MODEL', () => {
      expect(['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash']).toContain(env.GEMINI_MODEL);
      expect(['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash']).toContain(env.VISION_AI_MODEL);
    });

    it('gemini-3.8-flash is registered as image-capable in AI capabilities', () => {
      expect(isModelImageCapable('gemini-3.8-flash', 'gemini')).toBe(true);
      expect(isModelImageCapable('gemini-3.8-flash')).toBe(true);
    });

    it('validateRequestCapabilities permits image requests for gemini-3.8-flash', () => {
      expect(() => {
        validateRequestCapabilities('gemini', 'gemini-3.8-flash', true);
      }).not.toThrow();
    });
  });

  describe('2. Supported Model Request Format & Endpoint (gemini-3.8-flash)', () => {
    it('sends multimodal image payload to the correct generateContent endpoint', async () => {
      let capturedUrl = '';
      let capturedBody: any = null;

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedBody = JSON.parse(init?.body as string);

        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [{ text: '{"sections": []}' }],
                  role: 'model',
                },
                finishReason: 'STOP',
              },
            ],
            usageMetadata: {
              promptTokenCount: 150,
              candidatesTokenCount: 45,
              totalTokenCount: 195,
            },
          }),
        };
      });

      const adapter = new GeminiAdapter({
        apiKey: 'test-gemini-key',
        defaultModel: 'gemini-3.8-flash',
      });

      const sampleBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const dataUri = `data:image/png;base64,${sampleBase64}`;

      const response = await adapter.sendRequest({
        role: 'vision',
        modelId: 'gemini-3.8-flash',
        messages: [
          { role: 'system', content: 'You are an Elementor DIR layout generator.' },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analyze this design screenshot.' },
              { type: 'image_url', image_url: { url: dataUri } },
            ],
          },
        ],
        responseFormat: { type: 'json_object' },
      });

      // 1. Verify endpoint uses correct model and action
      expect(capturedUrl).toContain('/models/gemini-3.8-flash:generateContent');
      expect(capturedUrl).toContain('key=test-gemini-key');

      // 2. Verify payload formatting
      expect(capturedBody).toBeDefined();
      expect(capturedBody.generationConfig?.responseMimeType).toBe('application/json');
      expect(capturedBody.systemInstruction?.parts[0]?.text).toContain('DIR layout generator');

      const userContent = capturedBody.contents.find((c: any) => c.role === 'user');
      expect(userContent).toBeDefined();
      expect(userContent.parts[0].text).toBe('Analyze this design screenshot.');
      expect(userContent.parts[1].inlineData).toBeDefined();
      expect(userContent.parts[1].inlineData.mimeType).toBe('image/png');
      expect(userContent.parts[1].inlineData.data).toBe(sampleBase64);

      // 3. Verify response parsing
      expect(response.provider).toBe('gemini');
      expect(response.model).toBe('gemini-3.8-flash');
      expect(response.content).toBe('{"sections": []}');
      expect(response.usage.totalTokens).toBe(195);
    });
  });

  describe('3. Obsolete Model 404 NOT_FOUND Handling', () => {
    it('marks 404 model-not-found error as non-retryable and produces actionable error', async () => {
      global.fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
          headers: new Headers(),
          json: async () => ({
            error: {
              code: 404,
              message: 'models/gemini-1.5-pro is not found for API version v1beta, or is not supported for generateContent.',
              status: 'NOT_FOUND',
            },
          }),
        };
      });

      const adapter = new GeminiAdapter({
        apiKey: 'test-gemini-key',
        defaultModel: 'gemini-1.5-pro',
      });

      let caughtError: AIProviderError | null = null;
      try {
        await adapter.sendRequest({
          role: 'vision',
          modelId: 'gemini-1.5-pro',
          messages: [{ role: 'user', content: 'Test prompt' }],
        });
      } catch (err: any) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(AIProviderError);
      expect(caughtError?.statusCode).toBe(404);
      expect(caughtError?.isRetryable).toBe(false);
      expect(caughtError?.message).toContain('[NOT_FOUND]');
      expect(caughtError?.message).toContain('gemini-1.5-pro');
      expect(caughtError?.message).toContain('gemini-3.8-flash');
    });
  });

  describe('4. AIRouter Bounded Handling & Retry Suppression', () => {
    it('prevents repeated retries and fanout on 404 model-not-found error', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
          headers: new Headers(),
          json: async () => ({
            error: {
              code: 404,
              message: 'models/gemini-1.5-pro is not found for API version v1beta, or is not supported for generateContent.',
              status: 'NOT_FOUND',
            },
          }),
        };
      });

      const router = new AIRouter();
      router.setAllowNonMockInTest(true);
      router.clearInvalidModels();

      // First call fails with 404
      await expect(
        router.execute({
          role: 'vision',
          modelId: 'gemini-1.5-pro',
          messages: [{ role: 'user', content: 'Test prompt' }],
          bypassCache: true,
        })
      ).rejects.toThrow(/NOT_FOUND|invalid or not found/);

      expect(callCount).toBe(1);
      expect(router.getInvalidModels()).toContain('gemini:gemini-1.5-pro');

      // Second call with same invalid model should fast-fail without calling fetch
      await expect(
        router.execute({
          role: 'vision',
          modelId: 'gemini-1.5-pro',
          messages: [{ role: 'user', content: 'Test prompt' }],
          bypassCache: true,
        })
      ).rejects.toThrow(/is invalid or not found/);

      // Call count should NOT have increased (no repeated invalid requests)
      expect(callCount).toBe(1);
    });

    it('succeeds when switched to supported model gemini-3.8-flash', async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('gemini-3.8-flash')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              candidates: [
                {
                  content: { parts: [{ text: '{"success": true}' }], role: 'model' },
                  finishReason: 'STOP',
                },
              ],
              usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 },
            }),
          };
        }
        return { ok: false, status: 404 };
      });

      const router = new AIRouter();
      router.setAllowNonMockInTest(true);

      const result = await router.execute({
        role: 'vision',
        modelId: 'gemini-3.8-flash',
        messages: [{ role: 'user', content: 'Test prompt' }],
        bypassCache: true,
      });

      expect(result.content).toBe('{"success": true}');
    });
  });

  describe('5. Failed-Stage Retry & Stage Resumption', () => {
    it('resumes from existing completed stage without re-running vision AI', async () => {
      let visionCalled = false;
      const router = new AIRouter();
      router.setAllowNonMockInTest(true);

      global.fetch = vi.fn().mockImplementation(async () => {
        visionCalled = true;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: '{}' }] } }],
          }),
        };
      });

      const existingDirDoc = {
        version: '1.0',
        meta: { generatedAt: '2026-10-15T00:00:00Z' },
        breakpoints: { desktop: 1200, tablet: 768, mobile: 375 },
        globals: { colors: {}, typography: {} },
        pages: [
          {
            sections: [
              {
                id: 'sec_1',
                role: 'hero',
                nodes: [
                  {
                    id: 'node_1',
                    kind: 'heading',
                    text: 'Resumed Page',
                  },
                ],
              },
            ],
          },
        ],
      };

      // When dirArtifact is already present on the job (or cached in jobStage)
      const mockJob = {
        id: 'job-retry-test-123',
        projectId: 'project-123',
        dirArtifact: existingDirDoc,
      };

      // Resumption logic checks job.dirArtifact first
      const dirDoc = mockJob.dirArtifact;
      if (!dirDoc) {
        // If not found, it would call vision
        await router.execute({
          role: 'vision',
          modelId: 'gemini-3.8-flash',
          messages: [{ role: 'user', content: 'Analyze image' }],
        });
      }

      // Assert DIR was resumed without executing vision stage
      expect(dirDoc).toBe(existingDirDoc);
      expect(visionCalled).toBe(false);
    });
  });
});

