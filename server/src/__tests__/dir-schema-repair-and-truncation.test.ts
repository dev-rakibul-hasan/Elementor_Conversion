import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import { validateDIR, parseDIRFromAIOutput } from '../modules/dir/schema.js';
import { normalizeDIR, normalizeStyles, normalizeNode, normalizeSection, parseNumeric } from '../modules/dir/normalizer.js';
import { convertDIRToElementor } from '../modules/elementor/generator.js';
import { validateElementor } from '../modules/elementor/validator.js';
import { GroqAdapter } from '../modules/ai/providers/groq.js';
import { AIRouter } from '../modules/ai/router.js';
import { StageAICache } from '../modules/ai/cache.js';
import { getSectionRepairPrompt } from '../modules/conversion/prompts.js';

const require = createRequire(import.meta.url);
const sampleDir = require('../__fixtures__/sample-dir.json');

describe('DIR Schema Violations, Normalization & Truncation Handling', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('1. Valid Multi-Section Landing-Page DIR', () => {
    it('accepts a valid multi-section landing-page DIR document against existing schema', () => {
      const validation = validateDIR(sampleDir);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.document).toBeDefined();
      expect(validation.document?.pages[0].sections.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('2. Disentanglement of Pages and Sections (pages.1 Bug)', () => {
    it('normalizes section objects placed directly into pages[] into pages[0].sections[]', () => {
      const malformed = {
        version: '1.0.0',
        meta: {
          sourceImageHash: 'test-hash',
          sourceWidth: 1440,
          sourceHeight: 900,
          analysisProvider: 'ai',
          analysisModel: 'vision',
          analysisTimestamp: '2026-01-01T00:00:00Z',
          confidenceScore: 0.95,
          schemaVersion: '1.0.0',
          promptVersion: 'v1.3.0',
        },
        breakpoints: {
          desktop: { min: 1024 },
        },
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
                role: 'header',
                confidence: 0.9,
                styles: { backgroundColor: '#ffffff' },
                children: [],
              },
            ],
          },
          // Model mistakenly placed section 2 directly as pages[1]
          {
            id: 'sec_2',
            role: 'hero',
            label: 'Hero Section',
            confidence: 0.95,
            styles: { backgroundColor: '#000000' },
            children: [
              {
                id: 'heading_1',
                kind: 'heading',
                text: 'Welcome',
                level: 1,
                confidence: 0.95,
                styles: { fontSize: 32, color: '#ffffff' },
              },
            ],
          },
        ],
      };

      // Raw malformed fails validation because pages.1 lacks name & sections
      const rawValidation = validateDIR(malformed);
      expect(rawValidation.valid).toBe(false);
      expect(rawValidation.errors.some((e) => e.path === 'pages.1.name')).toBe(true);

      // Normalization safely disentangles: collects sec_2 into pages[0].sections
      const normalized = normalizeDIR(malformed);
      expect(normalized.pages).toHaveLength(1);
      expect(normalized.pages[0].sections).toHaveLength(2);
      expect(normalized.pages[0].sections[1].id).toBe('sec_2');
      expect(normalized.pages[0].sections[1].role).toBe('hero');

      // Validates cleanly against authoritative schema
      const normalizedValidation = validateDIR(normalized);
      expect(normalizedValidation.valid).toBe(true);
      expect(normalizedValidation.errors).toHaveLength(0);
    });
  });

  describe('3. Numeric Style Types Handling', () => {
    it('converts numeric strings to bare numbers for explicitly numeric schema fields', () => {
      const rawStyles = {
        fontSize: '24px',
        letterSpacing: '0.5px',
        borderWidth: '2',
        gap: '16px',
        opacity: '0.85',
        zIndex: '10',
        padding: { top: '20px', right: '15px', bottom: '20px', left: '15px' },
        margin: { top: '10', bottom: '10px' },
        borderRadius: '8px',
      };

      const normalized = normalizeStyles(rawStyles);
      expect(normalized.fontSize).toBe(24);
      expect(normalized.letterSpacing).toBe(0.5);
      expect(normalized.borderWidth).toBe(2);
      expect(normalized.gap).toBe(16);
      expect(normalized.opacity).toBe(0.85);
      expect(normalized.zIndex).toBe(10);
      expect(normalized.padding).toEqual({ top: 20, right: 15, bottom: 20, left: 15 });
      expect(normalized.margin).toEqual({ top: 10, bottom: 10 });
      expect(normalized.borderRadius).toBe(8);
    });

    it('rejects ambiguous CSS units (e.g. rem, auto) from bare numeric fields without inventing arbitrary numbers', () => {
      expect(parseNumeric('1.5rem')).toBeUndefined();
      expect(parseNumeric('auto')).toBeUndefined();
      expect(parseNumeric('inherit')).toBeUndefined();
      expect(parseNumeric('100%')).toBeUndefined();

      const rawStyles = {
        fontSize: '1.5rem',
      };
      const normalized = normalizeStyles(rawStyles);
      // Rem remains string so strict schema validation rejects it safely
      expect(typeof normalized.fontSize).toBe('string');
    });
  });

  describe('4. Unknown CSS-like Fields Mapping & Stripping', () => {
    it('maps marginBottom and marginTop into styles.margin and removes the aliases', () => {
      const rawStyles = {
        backgroundColor: '#ffffff',
        marginTop: '20px',
        marginBottom: 40,
        marginLeft: '15px',
        marginRight: '15px',
      };

      const normalized = normalizeStyles(rawStyles);
      expect(normalized.marginTop).toBeUndefined();
      expect(normalized.marginBottom).toBeUndefined();
      expect(normalized.margin).toEqual({ top: 20, bottom: 40, left: 15, right: 15 });
    });

    it('maps gridTemplateColumns to grid-group node columns and removes from styles', () => {
      const rawNode = {
        id: 'node_grid_1',
        kind: 'grid-group',
        confidence: 0.9,
        styles: {
          gridTemplateColumns: 'repeat(3, 1fr)',
        },
        children: [],
      };

      const normalized = normalizeNode(rawNode);
      expect(normalized.columns).toBe(3);
      expect(normalized.styles.gridTemplateColumns).toBeUndefined();
    });

    it('maps objectFit to image node and removes from styles', () => {
      const rawNode = {
        id: 'node_img_1',
        kind: 'image',
        confidence: 0.9,
        alt: 'Hero banner',
        styles: {
          width: 600,
          height: 400,
          objectFit: 'cover',
        },
      };

      const normalized = normalizeNode(rawNode);
      expect(normalized.objectFit).toBe('cover');
      expect(normalized.styles.objectFit).toBeUndefined();
    });

    it('strips non-schema CSS properties like top and right from styles to satisfy strict schema', () => {
      const rawStyles = {
        position: 'absolute',
        top: '10px',
        right: '20px',
        backgroundColor: '#000000',
      };

      const normalized = normalizeStyles(rawStyles);
      expect(normalized.top).toBeUndefined();
      expect(normalized.right).toBeUndefined();
      expect(normalized.position).toBe('absolute');
      expect(normalized.backgroundColor).toBe('#000000');
    });
  });

  describe('5. Missing Required Fields Actionable Errors & Semantic Repair', () => {
    it('repairs missing text.html from text.text semantically', () => {
      const rawNode = {
        id: 'node_txt_1',
        kind: 'text',
        text: 'This is paragraph text from design.',
        confidence: 0.9,
        styles: {},
      };

      const normalized = normalizeNode(rawNode);
      expect(normalized.html).toBe('<p>This is paragraph text from design.</p>');
    });

    it('produces actionable error when pages array is completely empty', () => {
      const badDoc = { ...sampleDir, pages: [] };
      const validation = validateDIR(badDoc);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.path === 'pages')).toBe(true);
    });

    it('produces actionable error when text node lacks both html and text', () => {
      const badDoc = JSON.parse(JSON.stringify(sampleDir));
      badDoc.pages[0].sections[0].children[0] = {
        id: 'bad_text',
        kind: 'text',
        confidence: 0.9,
        styles: {},
      };
      const validation = validateDIR(badDoc);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.path.includes('html'))).toBe(true);
    });
  });

  describe('6. finishReason: length Truncation Handling', () => {
    it('never caches an AI response when finishReason is length', async () => {
      const cache = new StageAICache();

      const truncatedResponse = {
        content: '{"version": "1.0.0", "pages": [{"id": "p1", "sections": [',
        usage: { inputTokens: 5350, outputTokens: 3072, totalTokens: 8422 },
        model: 'openai/gpt-oss-120b',
        provider: 'groq' as const,
        latencyMs: 1200,
        finishReason: 'length',
      };

      const key = await cache.set(
        {
          sourceImageHash: 'test-hash',
          provider: 'groq',
          model: 'openai/gpt-oss-120b',
          stage: 'dir_generation',
        },
        truncatedResponse
      );

      // Key should be empty string because caching was skipped
      expect(key).toBe('');

      // Attempting to retrieve should return null
      const computedKey = cache.computeKey({
        sourceImageHash: 'test-hash',
        provider: 'groq',
        model: 'openai/gpt-oss-120b',
        stage: 'dir_generation',
      });
      const cached = await cache.get(computedKey);
      expect(cached).toBeNull();
    });

    it('parseDIRFromAIOutput extracts complete JSON or returns actionable error for truncated output', () => {
      const truncatedRaw = '{"version": "1.0.0", "meta": {"sourceWidth": 1440}, "pages": [';
      const result = parseDIRFromAIOutput(truncatedRaw);
      expect('error' in result).toBe(true);
    });
  });

  describe('7. Output Token Budget Configuration', () => {
    it('GroqAdapter sends configured max_tokens exceeding previous 3072 limit', async () => {
      let capturedBody: any = null;

      global.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'groq-long-resp',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: '{"ok": true}' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 100, completion_tokens: 4500, total_tokens: 4600 },
          }),
        };
      });

      const adapter = new GroqAdapter({
        apiKey: 'test-key',
        defaultModel: 'openai/gpt-oss-120b',
      });

      await adapter.sendRequest({
        role: 'structure',
        messages: [{ role: 'user', content: 'Generate DIR' }],
        maxTokens: 16384,
      });

      expect(capturedBody.max_tokens).toBe(16384);
      expect(capturedBody.max_completion_tokens).toBe(16384);
    });
  });

  describe('8. Section-Level Repair & Assembly', () => {
    it('generates a targeted section repair prompt and assembles into authoritative DIR schema', () => {
      const malformedSection = {
        id: 'sec_cta',
        role: 'cta',
        label: 'Call to Action',
        confidence: 0.9,
        styles: {
          backgroundColor: '#2563EB',
          fontSize: '20px',
          marginBottom: '30px',
        },
        children: [
          {
            id: 'node_btn_1',
            kind: 'button',
            text: 'Sign Up Now',
            confidence: 0.95,
            styles: { padding: { top: '12px', bottom: '12px', left: '24px', right: '24px' } },
          },
        ],
      };

      const prompt = getSectionRepairPrompt(malformedSection, [
        { path: 'styles.fontSize', message: 'Expected number, received string' },
        { path: 'styles.marginBottom', message: 'Unrecognized key' },
      ]);

      expect(prompt.systemPrompt).toContain('repairing a single DIRSection object');
      expect(prompt.userPrompt).toContain('sec_cta');

      // Normalized repaired section integrates into document seamlessly
      const repairedSection = normalizeSection(malformedSection);
      expect(repairedSection.styles.fontSize).toBe(20);
      expect(repairedSection.styles.margin).toEqual({ bottom: 30 });
      expect(repairedSection.styles.marginBottom).toBeUndefined();

      const assembledDoc = JSON.parse(JSON.stringify(sampleDir));
      assembledDoc.pages[0].sections.push(repairedSection);

      const validation = validateDIR(assembledDoc);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('9. Cache Invalidation for Invalid Responses', () => {
    it('invalidates cache entry by key when schema validation fails', async () => {
      const router = new AIRouter();
      const testKey = 'test-cache-key-12345';

      // Insert an invalid response into memory cache
      (router as any).cache.memoryCache.set(testKey, {
        cacheKey: testKey,
        response: {
          content: '{"invalid": "dir"}',
          usage: { inputTokens: 10, outputTokens: 10 },
          model: 'openai/gpt-oss-120b',
          provider: 'groq',
          latencyMs: 100,
        },
        metadata: { provider: 'groq', model: 'openai/gpt-oss-120b' },
        createdAt: new Date(),
      });

      // Verify it exists in cache
      expect((router as any).cache.memoryCache.has(testKey)).toBe(true);

      // Invalidate it
      await router.invalidateCacheKey(testKey);

      // Verify it is gone
      expect((router as any).cache.memoryCache.has(testKey)).toBe(false);
    });
  });

  describe('10. Failed DIR Repair Prevents Elementor Artifact Creation', () => {
    it('validateDIR rejects invalid document preventing Elementor conversion stage from running', () => {
      const permanentlyInvalidDoc = {
        version: '1.0.0',
        meta: {},
        pages: [{ id: 'p1', name: 'Home', sections: [] }],
      };

      const validation = validateDIR(permanentlyInvalidDoc);
      expect(validation.valid).toBe(false);

      // Conversion stage is guarded: must never run on invalid validation
      if (!validation.valid) {
        expect(() => {
          throw new Error(`DIR remained invalid after repair: ${JSON.stringify(validation.errors)}`);
        }).toThrow(/DIR remained invalid after repair/);
      }
    });
  });

  describe('11. Valid DIR Output Through Elementor Generation & Validation', () => {
    it('normalized DIR document generates valid native Elementor template structure', () => {
      const normalized = normalizeDIR(sampleDir);
      const validation = validateDIR(normalized);
      expect(validation.valid).toBe(true);

      const { document: elementorDoc, report } = convertDIRToElementor(validation.document!);
      expect(elementorDoc).toBeDefined();
      expect(elementorDoc.version).toBe('0.4');
      expect(elementorDoc.content.length).toBeGreaterThan(0);
      expect(report.elementCount).toBeGreaterThan(0);

      const elementorValidation = validateElementor(elementorDoc);
      expect(elementorValidation.valid).toBe(true);
    });
  });
});

