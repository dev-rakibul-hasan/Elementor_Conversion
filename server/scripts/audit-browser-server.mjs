// Used only by test-browser-isolated.mjs, with synthetic data and mock AI.
if (process.env.PIPELINE_ISOLATED_TESTS !== 'true' || process.env.AI_PROVIDER !== 'mock') throw new Error('Isolated mock environment required');
const { app } = await import('../dist/index.js');
const { getAIRouter } = await import('../dist/modules/ai/router.js');
const { ConversionWorker } = await import('../dist/worker.js');
const { readFile } = await import('node:fs/promises');
const dir = JSON.parse(await readFile(new URL('../src/__fixtures__/sample-dir.json', import.meta.url), 'utf8'));
dir.assets = [{ id: 'portrait', type: 'image', role: 'hero portrait', confidence: 1, sourceRect: { x: 10, y: 10, width: 40, height: 40 } }];
dir.pages[0].sections = [{ id: 'hero-section', role: 'hero', confidence: 1, styles: { backgroundColor: '#ffffff' }, children: [
  { id: 'hero-heading', kind: 'heading', text: 'Browser audit design', level: 1, styles: { color: '#123456', fontSize: 32 }, confidence: 1 },
  { id: 'hero-image', kind: 'image', assetId: 'portrait', alt: 'Audit portrait', styles: { width: 40, height: 40 }, confidence: 1 },
] }];
getAIRouter().getAdapter('mock').setCustomFixture('vision', dir);
app.listen(4501, '127.0.0.1', () => console.log('Isolated audit API ready on 4501'));
void new ConversionWorker().start();
