import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { envSchema } from '../config/env.js';
import { GeminiAdapter } from '../modules/ai/providers/gemini.js';
import { OpenRouterAdapter } from '../modules/ai/providers/openrouter.js';
import { StageAICache } from '../modules/ai/cache.js';
import { prisma } from '../lib/prisma.js';
import { convertDIRToElementor } from '../modules/elementor/generator.js';
import type { DIRDocument } from '../modules/dir/types.js';

const sample = createRequire(import.meta.url)('../__fixtures__/sample-dir.json');
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Codebase audit regressions', () => {
  it.each(['0', '-1', '2garbage', 'NaN', '1.5', '9007199254740993'])(
    'rejects invalid worker concurrency %s instead of disabling or overloading the worker', (value) => {
      expect(envSchema.safeParse({ CONVERSION_WORKER_CONCURRENCY: value }).success).toBe(false);
    });
  it('requires private production secrets while retaining development defaults', () => {
    expect(envSchema.safeParse({ NODE_ENV: 'production' }).success).toBe(false);
    expect(envSchema.safeParse({ NODE_ENV: 'development' }).success).toBe(true);
    expect(envSchema.safeParse({ NODE_ENV: 'production', JWT_SECRET: 'private-jwt-key-with-at-least-32-characters', SITE_CREDENTIAL_ENCRYPTION_KEY: 'private-encryption-key-with-at-least-32-characters' }).success).toBe(true);
  });

  it('normalizes Gemini truncation and respects the constructor model', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"partial":' }] }, finishReason: 'MAX_TOKENS' }] }) });
    vi.stubGlobal('fetch', fetchMock);
    const result = await new GeminiAdapter({ apiKey: 'test-key', defaultModel: 'gemini-custom' }).sendRequest({ role: 'vision', messages: [{ role: 'user', content: 'test' }] });
    expect(result.finishReason).toBe('length');
    expect(fetchMock.mock.calls[0][0]).toContain('/gemini-custom:generateContent');
    const cache = new StageAICache();
    expect(await cache.set({ provider: 'gemini', model: 'gemini-custom' }, result)).toBe('');
  });

  it('keeps Gemini quota fallback within the total request budget', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, headers: new Headers(), json: async () => ({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exhausted' } }) }));
    await expect(new GeminiAdapter({ apiKey: 'test-key' }).sendRequest({ role: 'vision', messages: [] })).rejects.toMatchObject({ statusCode: 429, isRetryable: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('preserves OpenRouter HTTP status for routing and cooldown decisions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, headers: new Headers(), json: async () => ({ error: { message: 'Quota exceeded' } }) }));
    await expect(new OpenRouterAdapter({ apiKey: 'test-key' }).sendRequest({ role: 'structure', messages: [] })).rejects.toMatchObject({ statusCode: 429, isRetryable: true });
  });

  it('invalidates any mismatching cache version in PostgreSQL, including NULL versions', async () => {
    const remove = vi.spyOn(prisma.stageCache, 'deleteMany').mockResolvedValue({ count: 2 });
    const cache = new StageAICache();
    expect(await cache.invalidateByVersion({ schemaVersion: 'schema2', promptVersion: 'prompt2' })).toBe(2);
    expect(remove).toHaveBeenCalledWith({ where: { OR: [
      { schemaVersion: { not: 'schema2' } }, { schemaVersion: null },
      { promptVersion: { not: 'prompt2' } }, { promptVersion: null },
    ] } });
    remove.mockClear();
    expect(await cache.invalidateByVersion({})).toBe(0);
    expect(remove).not.toHaveBeenCalled();
  });

  function compile(nodes: any[]) {
    const dir = structuredClone(sample) as DIRDocument;
    dir.pages[0].sections = [{ ...dir.pages[0].sections[0], children: nodes.map((node, index) => ({ id: `audit-${index}`, confidence: 1, styles: {}, ...node })) }];
    return convertDIRToElementor(dir);
  }

  it('preserves zero counters, spacers, ratings and progress values', () => {
    const { document } = compile([{ kind: 'counter', value: 0 }, { kind: 'spacer', height: 0 }, { kind: 'rating', value: 0, max: 10 }, { kind: 'progress-bar', value: 0 }]);
    const [counter, spacer, rating, progress] = document.content[0].elements;
    expect(counter.settings.ending_number).toBe(0);
    expect(spacer.settings.space.size).toBe(0);
    expect(rating.settings).toMatchObject({ rating: 0, rating_scale: '10' });
    expect(progress.settings.percent.size).toBe(0);
  });

  it('converts custom progress maxima and canonical media fields', () => {
    const { document } = compile([{ kind: 'progress-bar', value: 2, max: 8 }, { kind: 'map', location: 'Dhaka, Bangladesh' }, { kind: 'video', provider: 'vimeo', url: 'https://vimeo.com/123' }, { kind: 'video', provider: 'self-hosted', url: 'https://example.com/video.mp4' }]);
    const [progress, map, vimeo, hosted] = document.content[0].elements;
    expect(progress.settings.percent.size).toBe(25);
    expect(map.settings.address).toBe('Dhaka, Bangladesh');
    expect(vimeo.settings).toMatchObject({ video_type: 'vimeo', vimeo_url: 'https://vimeo.com/123' });
    expect(hosted.settings).toMatchObject({ video_type: 'hosted', hosted_url: { url: 'https://example.com/video.mp4' } });
    expect(hosted.settings.youtube_url).toBeUndefined();
  });

  it('retains children inside unknown wrappers and explicit responsive percentages', () => {
    const { document } = compile([{ kind: 'unknown', children: [{ id: 'nested', kind: 'heading', text: 'Retained title', level: 2, confidence: 1, styles: {} }] }, { kind: 'image', url: 'https://example.com/image.png', responsiveOverrides: { mobile: { width: '50%' } } }]);
    expect(document.content[0].elements[0].elements[0].settings.title).toBe('Retained title');
    expect(document.content[0].elements[1].settings.width_mobile).toEqual({ unit: '%', size: 50 });
  });

  it('reports accurate counts for generated badge and circular-counter wrappers', () => {
    const { document, report } = compile([{ kind: 'badge', text: 'Badge' }, { kind: 'counter', value: 10, styles: { borderRadius: 9999, backgroundColor: '#123456' } }]);
    let elements = 0, containers = 0, widgets = 0;
    const visit = (node: any) => { elements++; if (node.elType === 'container') containers++; else widgets++; node.elements.forEach(visit); };
    document.content.forEach(visit);
    expect(report).toMatchObject({ elementCount: elements, containerCount: containers, widgetCount: widgets });
  });
});
