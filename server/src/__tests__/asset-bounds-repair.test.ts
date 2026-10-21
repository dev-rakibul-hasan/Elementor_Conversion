import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { ConversionOrchestrator } from '../modules/conversion/orchestrator.js';
import { isValidAssetRect } from '../modules/conversion/asset-bounds.js';
import type { DIRDocument, DIRRect } from '../modules/dir/types.js';

const sample = createRequire(import.meta.url)('../__fixtures__/sample-dir.json');
afterEach(() => vi.restoreAllMocks());

async function setup(rect?: DIRRect) {
  const doc = structuredClone(sample) as DIRDocument;
  doc.assets = [{ id: 'portrait', role: 'hero portrait', type: 'image', confidence: 0.9, sourceRect: rect }];
  const image = { id: 'hero', kind: 'image', assetId: 'portrait', alt: 'Hero portrait', confidence: 0.9, styles: {} };
  doc.pages[0].sections[0].children = [image] as any;
  doc.pages[0].sections = [doc.pages[0].sections[0]];
  const source = await sharp({ create: { width: 100, height: 80, channels: 4, background: '#123456' } }).png().toBuffer();
  const orchestrator = new ConversionOrchestrator() as any;
  const execute = vi.spyOn(orchestrator.aiRouter, 'execute');
  const save = vi.spyOn(orchestrator, 'saveGeneratedAsset').mockResolvedValue({});
  const run = () => orchestrator.resolveAndExtractAssets(
    { id: 'job', projectId: 'project' }, { id: 'source', mimeType: 'image/png' },
    source, { width: 100, height: 80 }, doc);
  return { doc, image, source, execute, save, run };
}

const response = (assets: unknown[]) => ({ content: JSON.stringify({ assets }) } as any);
const valid = { x: 60, y: 10, width: 40, height: 70 };

describe('Screenshot asset bounds repair', () => {
  it.each([undefined, { x: 90, y: 10, width: 40, height: 70 }, { x: -10, y: 0, width: 40, height: 70 }])(
    'repairs missing or invalid coordinates from source pixels before extracting: %j', async (rect) => {
      const { doc, image, source, execute, save, run } = await setup(rect);
      execute.mockResolvedValue(response([{ id: 'portrait', sourceRect: valid }]));
      await run();
      expect(execute).toHaveBeenCalledTimes(1);
      const request = execute.mock.calls[0][0] as any;
      expect(request).toMatchObject({ role: 'vision', bypassCache: true, stageName: 'asset_bounds_repair' });
      expect(request.messages[1].content[1].image_url.url).toBe(`data:image/png;base64,${source.toString('base64')}`);
      expect(doc.assets[0].sourceRect).toEqual(valid);
      expect((image as any).url).toMatch(/^\/storage\/projects\/project\/assets\//);
      expect(save).toHaveBeenCalledTimes(1);
      const crop = await sharp(save.mock.calls[0][2] as Buffer).metadata();
      expect([crop.width, crop.height]).toEqual([40, 70]);
    });

  it('retries invalid patches and only accepts requested IDs and rectangle fields', async () => {
    const { doc, execute, run } = await setup();
    execute.mockResolvedValueOnce(response([{ id: 'portrait', sourceRect: { ...valid, x: 100 } }]))
      .mockResolvedValueOnce(response([
        { id: 'unrequested', sourceRect: valid },
        { id: 'portrait', sourceRect: valid, placeholder: 'https://invented.test/image.png', role: 'changed' },
      ]));
    await run();
    expect(execute).toHaveBeenCalledTimes(2);
    expect(doc.assets).toHaveLength(1);
    expect(doc.assets[0].role).toBe('hero portrait');
    expect(doc.assets[0].placeholder).toMatch(/^\/storage\//);
  });

  it.each([
    { content: 'malformed JSON' },
    { content: '{"assets":[]}' },
    response([{ id: 'wrong-id', sourceRect: valid }]),
    response([{ id: 'portrait', sourceRect: valid }, { id: 'portrait', sourceRect: valid }]),
    { ...response([{ id: 'portrait', sourceRect: valid }]), finishReason: 'length' },
  ])('fails safely after two unsuccessful repairs without writing crops: %j', async (result) => {
    const { execute, save, run } = await setup();
    execute.mockResolvedValue(result as any);
    await expect(run()).rejects.toThrow(/portrait.*100x80.*after 2 vision repair attempts/);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(save).not.toHaveBeenCalled();
  });

  it('preflights every referenced asset before writing any crops', async () => {
    const { doc, execute, save, run } = await setup(valid);
    doc.assets.push({ id: 'missing', type: 'image', role: 'logo', confidence: 0.9 });
    doc.pages[0].sections[0].children.push({ id: 'logo', kind: 'image', assetId: 'missing', confidence: 0.9, styles: {} } as any);
    execute.mockResolvedValue(response([]));
    await expect(run()).rejects.toThrow(/missing.*after 2/);
    expect(save).not.toHaveBeenCalled();
  });

  it('does not call vision for valid coordinates', async () => {
    const { execute, save, run } = await setup(valid);
    await run();
    expect(execute).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('skips unused assets and images that already have URLs', async () => {
    const { image, execute, save, run } = await setup();
    (image as any).url = 'https://example.com/portrait.png';
    await run();
    expect(execute).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects non-finite and zero-sized crops without clamping them', () => {
    for (const rect of [null, { ...valid, x: NaN }, { ...valid, width: Infinity }, { ...valid, width: 0 }]) {
      expect(isValidAssetRect(rect, { width: 100, height: 80 })).toBe(false);
    }
  });
});
