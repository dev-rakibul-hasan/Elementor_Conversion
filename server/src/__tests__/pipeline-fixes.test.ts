import sharp from 'sharp';
import { ConversionOrchestrator } from '../modules/conversion/orchestrator.js';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { StageAICache } from '../modules/ai/cache.js';
import { AIRouter } from '../modules/ai/router.js';
import { auditDIRContent } from '../modules/conversion/content-audit.js';
import { convertDIRToElementor } from '../modules/elementor/generator.js';
import { MCPClient } from '../modules/mcp/client.js';
import { MCPPublisher } from '../modules/mcp/publisher.js';
import { getStorage } from '../modules/storage/factory.js';
import { env } from '../config/index.js';
import { createRequire } from 'node:module';
const sample = createRequire(import.meta.url)('../__fixtures__/sample-dir.json');
import type { DIRDocument } from '../modules/dir/types.js';

const dir = sample as DIRDocument;
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Pipeline correctness regressions', () => {
  it('isolates nested input content and stage names in cache keys', () => {
    const cache = new StageAICache();
    const base = { provider: 'mock', model: 'model', sourceImageHash: 'image' };
    const one = cache.computeKey({ ...base, stage: 'one', normalizedInput: [{ role: 'user', content: { text: 'first' } }] });
    const two = cache.computeKey({ ...base, stage: 'one', normalizedInput: [{ role: 'user', content: { text: 'second' } }] });
    const otherStage = cache.computeKey({ ...base, stage: 'two', normalizedInput: [{ role: 'user', content: { text: 'first' } }] });
    expect(one).not.toBe(two);
    expect(one).not.toBe(otherStage);
    expect(cache.computeKey({ ...base, normalizedInput: { b: { z: 2, a: 1 }, a: 0 } })).toBe(cache.computeKey({ ...base, normalizedInput: { a: 0, b: { a: 1, z: 2 } } }));
  });

  it('includes actual messages and skill versions in router cache lookups', async () => {
    const router = new AIRouter();
    const cache = { computeKey: vi.fn().mockReturnValue('key'), get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('key') };
    (router as any).cache = cache;
    vi.spyOn(router, 'resolveProviderForRole').mockReturnValue('mock');
    vi.spyOn(router, 'getAdapter').mockReturnValue({ name: 'mock', sendRequest: vi.fn().mockResolvedValue({ content: '{}', provider: 'mock', model: 'model', usage: { inputTokens: 1, outputTokens: 1 } }) } as any);
    const messages = [{ role: 'user' as const, content: 'unique document' }];
    await router.execute({ role: 'structure', messages, skillVersion: 'skill2', stageName: 'compile' });
    expect(cache.computeKey).toHaveBeenCalledWith(expect.objectContaining({ normalizedInput: messages, skillVersion: 'skill2', stage: 'compile' }));
  });

  it('rejects missing text, section layout, and changed page background', () => {
    const compiled = convertDIRToElementor(dir).document;
    expect(() => auditDIRContent(dir, compiled)).not.toThrow();
    const missing = structuredClone(compiled);
    missing.content[0].elements = [];
    expect(() => auditDIRContent(dir, missing)).toThrow(/missing/);
    const layout = structuredClone(compiled);
    layout.content[0].settings.flex_direction = 'column-reverse';
    expect(() => auditDIRContent(dir, layout)).toThrow(/flex_direction/);
    const background = structuredClone(compiled);
    background.page_settings!.background_color = '#ff00ff';
    expect(() => auditDIRContent(dir, background)).toThrow(/background/);
  });

  it('reanalyzes a detected canvas crop once and restores asset coordinates to the original image', async () => {
    const source = await sharp({ create: { width: 100, height: 80, channels: 4, background: '#123456' } }).png().toBuffer();
    const full = structuredClone(dir);
    full.canvas_bounds = { crop_mockup: true, x: 10, y: 12, width: 60, height: 40 };
    const cropped = structuredClone(dir);
    cropped.assets = cropped.assets.map((asset) => ({ ...asset, sourceRect: { x: 1, y: 2, width: 8, height: 8 } }));
    const response = (document: unknown) => ({ content: JSON.stringify(document), provider: 'mock', model: 'fixture', usage: { inputTokens: 1, outputTokens: 1 } });
    const orchestrator = new ConversionOrchestrator();
    const execute = vi.spyOn((orchestrator as any).aiRouter, 'execute').mockResolvedValueOnce(response(full)).mockResolvedValueOnce(response(cropped));
    const result = await (orchestrator as any).executeDIRStage({ id: 'job' }, { sha256: 'original', mimeType: 'image/png' }, source, { width: 100, height: 80 }, 1);
    expect(execute).toHaveBeenCalledTimes(2);
    const imageUrl = (execute.mock.calls[1][0] as any).messages[1].content[1].image_url.url;
    const metadata = await sharp(Buffer.from(imageUrl.split(',')[1], 'base64')).metadata();
    expect([metadata.width, metadata.height]).toEqual([60, 40]);
    expect(result.dirDoc.assets[0].sourceRect).toEqual({ x: 11, y: 14, width: 8, height: 8 });
    expect(result.dirDoc.meta.sourceImageHash).toBe('original');
    expect(result.aiResMeta.tokensUsed).toBe(4);
  });

  it('rejects asset extraction without exact coordinates instead of guessing a crop', async () => {
    const unresolved = structuredClone(dir);
    unresolved.assets.forEach((asset) => { delete asset.sourceRect; delete asset.placeholder; });
    const orchestrator = new ConversionOrchestrator();
    await expect((orchestrator as any).resolveAndExtractAssets({ id: 'job', projectId: 'project' }, { id: 'source' }, Buffer.from('source'), { width: 100, height: 80 }, unresolved)).rejects.toThrow(/valid sourceRect/);
  });

  it('accepts semantically equal WordPress read-backs with reordered keys and empty PHP settings arrays', async () => {
    vi.spyOn(MCPClient.prototype, 'checkCapabilities').mockResolvedValue({ canCreatePage: true, supportsIdempotency: true, availableTools: [{ name: 'elementor_create_page' }, { name: 'elementor_get_page_structure' }] } as any);
    vi.spyOn(MCPClient.prototype, 'callTool').mockResolvedValueOnce({ content: [], structuredData: { id: 25 } }).mockResolvedValueOnce({ content: [], structuredData: { elements: [{ settings: [], id: 'abc1234' }], page_settings: { color: '#fff', template: 'elementor_canvas' } } });
    const result = await new MCPPublisher({ siteUrl: 'http://wp.test', credentials: { username: 'admin', applicationPassword: 'secret' } }).publish({ elementorJson: { content: [{ id: 'abc1234', settings: {} }], page_settings: { template: 'elementor_canvas', color: '#fff' } }, resourceType: 'page', title: 'Page', publishMode: 'draft', siteConfigId: 'site' });
    expect(result.success).toBe(true); expect(result.verified).toBe(true);
  });

  it('rejects multi-page conversion instead of silently dropping pages', () => {
    expect(() => convertDIRToElementor({ ...dir, pages: [...dir.pages, ...dir.pages] })).toThrow(/exactly one page/);
  });

  it('never switches a failed live MCP connection to simulation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));
    const client = new MCPClient({ siteUrl: 'http://unreachable.invalid', credentials: { username: 'admin', applicationPassword: 'secret' } });
    expect((await client.testConnection()).ok).toBe(false);
    expect(client.isUsingMock()).toBe(false);
    const result = await new MCPPublisher(client.getConfig()).publish({ elementorJson: {}, resourceType: 'page', title: 'Page', publishMode: 'draft', siteConfigId: 'site' });
    expect(result.success).toBe(false);
    expect(result.remoteId).toBeUndefined();
  });

  it('rejects JSON-RPC error envelopes even when HTTP succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ error: { code: -32003, message: 'Permission denied' } }) }));
    const client = new MCPClient({ siteUrl: 'http://wp.test', credentials: { username: 'admin', applicationPassword: 'secret' } });
    await expect(client.connect()).rejects.toThrow(/Permission denied/);
  });

  it('uses the configured review model', async () => {
    const old = { provider: env.REVIEW_AI_PROVIDER, model: env.REVIEW_AI_MODEL };
    try {
      env.REVIEW_AI_PROVIDER = 'groq'; env.REVIEW_AI_MODEL = 'llama-3.3-70b-versatile';
      const router = new AIRouter();
      vi.spyOn(router, 'resolveProviderForRole').mockReturnValue('groq');
      const send = vi.fn().mockResolvedValue({ content: '{}', usage: { inputTokens: 0, outputTokens: 0 } });
      vi.spyOn(router, 'getAdapter').mockReturnValue({ name: 'groq', sendRequest: send } as any);
      await router.execute({ role: 'review', messages: [], bypassCache: true });
      expect(send.mock.calls[0][0].modelId).toBe('llama-3.3-70b-versatile');
    } finally { env.REVIEW_AI_PROVIDER = old.provider; env.REVIEW_AI_MODEL = old.model; }
  });

  it('fails publication when media upload fails, without creating a page or changing the artifact', async () => {
    const capabilities = { canCreatePage: true, supportsIdempotency: true, availableTools: [{ name: 'elementor_create_page' }] };
    vi.spyOn(MCPClient.prototype, 'checkCapabilities').mockResolvedValue(capabilities as any);
    const create = vi.spyOn(MCPClient.prototype, 'callTool');
    vi.spyOn(getStorage(), 'download').mockResolvedValue(Buffer.from('image'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    const artifact = { content: [{ id: 'abc1234', settings: { image: { url: '/storage/projects/project/image.png' } } }] };
    const original = JSON.stringify(artifact);
    const result = await new MCPPublisher({ siteUrl: 'http://wp.test', credentials: { username: 'admin', applicationPassword: 'secret' } }).publish({
      elementorJson: artifact, resourceType: 'page', title: 'Page', publishMode: 'draft', siteConfigId: 'site',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/media upload/);
    expect(create).not.toHaveBeenCalled();
    expect(JSON.stringify(artifact)).toBe(original);
  });

  it('rejects mismatched read-back content and keeps the created page ID for reconciliation', async () => {
    vi.spyOn(MCPClient.prototype, 'checkCapabilities').mockResolvedValue({ canCreatePage: true, supportsIdempotency: true, availableTools: [{ name: 'elementor_create_page' }, { name: 'elementor_get_page_structure' }] } as any);
    vi.spyOn(MCPClient.prototype, 'callTool').mockResolvedValueOnce({ content: [], structuredData: { id: 25 } }).mockResolvedValueOnce({ content: [], structuredData: { elements: [] } });
    const result = await new MCPPublisher({ siteUrl: 'http://wp.test', credentials: { username: 'admin', applicationPassword: 'secret' } }).publish({ elementorJson: { content: [{ id: 'abc1234', settings: {} }] }, resourceType: 'page', title: 'Page', publishMode: 'draft', siteConfigId: 'site' });
    expect(result.success).toBe(false);
    expect(result.verified).toBe(false);
    expect(result.remoteId).toBe(25);
  });
});
