import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { expandClippedCompositeBounds } from '../modules/storage/image-processor.js';
import { createRequire } from 'node:module';
import { normalizeDIR } from '../modules/dir/normalizer.js';
import { validateDIR } from '../modules/dir/schema.js';
import { convertDIRToElementor } from '../modules/elementor/generator.js';
import { serializeElementorTemplate, serializeElementorClipboard } from '../modules/elementor/serializer.js';
import { auditDIRContent } from '../modules/conversion/content-audit.js';
import { getImageAnalysisPrompt } from '../modules/conversion/prompts.js';
import type { DIRDocument } from '../modules/dir/types.js';
const sample = createRequire(import.meta.url)('../__fixtures__/sample-dir.json');

function fixture(children: any[], styles: any = {}): DIRDocument {
  const dir = structuredClone(sample);
  dir.assets = [];
  dir.meta.sourceWidth = 1140;
  dir.globals.typography = { fontFamilies: ['Inter'], headingFont: 'Inter', bodyFont: 'Inter' };
  dir.pages[0].sections = [{ id: 'hero', role: 'hero', confidence: 1, styles, children }];
  return dir;
}
const node = (kind: string, values: any = {}) => ({ id: kind, kind, confidence: 1, styles: {}, ...values });
const exported = (dir: DIRDocument) => JSON.parse(serializeElementorTemplate(convertDIRToElementor(dir).document));

describe('Persisted export fidelity regressions', () => {
  it('retains dimension controls including zero values in downloaded and clipboard JSON', () => {
    const dir = fixture([node('button', { text: 'Join', styles: { padding: { top: 0, right: 28, bottom: 0, left: 28 }, borderRadius: 50, borderWidth: 0 } })], {
      padding: { top: 32, right: 64, bottom: 64, left: 64 }, margin: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    const compiled = convertDIRToElementor(dir).document;
    const download = JSON.parse(serializeElementorTemplate(compiled));
    const clipboard = JSON.parse(serializeElementorClipboard(compiled));
    for (const section of [download.content[0], clipboard.elements[0]]) {
      expect(section.settings.padding.left).toBe('64');
      expect(section.settings.margin.top).toBe('0');
      expect(section.elements[0].settings.text_padding.top).toBe('0');
      expect(section.elements[0].settings.border_radius.left).toBe('50');
    }
    expect(() => auditDIRContent(dir, download)).not.toThrow();
    delete download.content[0].settings.padding;
    expect(() => auditDIRContent(dir, download)).toThrow(/padding/);
  });

  it('rejects changed nested typography and hierarchy after serialization', () => {
    const dir = fixture([node('container', { direction: 'row', children: [node('heading', { level: 1, text: 'Measured', styles: { fontSize: 38 } })] })]);
    const doc = exported(dir);
    doc.content[0].elements[0].elements[0].settings.typography_font_size.size = 48;
    expect(() => auditDIRContent(dir, doc)).toThrow(/typography_font_size/);
    const moved = exported(dir);
    moved.content[0].elements.push(moved.content[0].elements[0].elements.pop());
    expect(() => auditDIRContent(dir, moved)).toThrow(/hierarchy/);
  });

  it('preserves heading line breaks, inline colors, font inheritance and widget margins', () => {
    const dir = fixture([node('heading', { level: 1, text: 'Get <work> done,\nStay in control.',
      typography: { inline_color_spans: [{ text: 'control', color_hex: '#f3c68f' }] },
      styles: { fontSize: 38, lineHeight: '46px', margin: { bottom: 24 } },
    })]);
    const heading = exported(dir).content[0].elements[0].settings;
    expect(heading.title).toBe('Get &lt;work&gt; done,<br>Stay in <span style="color:#f3c68f">control</span>.');
    expect(heading.typography_font_family).toBe('Inter');
    expect(heading.typography_line_height).toEqual({ unit: 'px', size: 46 });
    expect(heading._margin.bottom).toBe('24');
  });

  it('keeps an observed inline signup form and its pill controls intact', () => {
    const dir = fixture([node('form', { form_details: { background_hex: '#29304e', border_radius_px: 50 },
      children: [node('input', { inputType: 'email', placeholder: 'Your "work" email', styles: { backgroundColor: 'transparent', padding: { left: 20 } } }),
        node('button', { text: 'Get Started', styles: { borderRadius: 50, padding: { top: 14, bottom: 14, left: 32, right: 32 } } })],
    })]);
    const form = exported(dir).content[0].elements[0];
    expect(form.settings.flex_direction).toBe('row');
    expect(form.settings.flex_direction_mobile).toBeUndefined();
    expect(form.settings.border_radius.top).toBe('50');
    expect(form.elements[0].settings.html).toContain('type="email"');
    expect(form.elements[0].settings.html).toContain('&quot;work&quot;');
    expect(form.elements[0].settings._flex_grow).toBe(1);
    expect(form.elements[1].settings.text_padding.left).toBe('32');
  });

  it('does not flatten distinct active navigation styles into a single icon-list style', () => {
    const dir = fixture([node('flex-group', { direction: 'row', gap: 0, children: [
      node('link', { text: 'Home', styles: { color: '#ffffff', fontWeight: 600, textDecoration: 'underline' } }),
      node('link', { id: 'about', text: 'About', styles: { color: '#98a2b3', fontWeight: 400 } }),
    ] })]);
    const nav = exported(dir).content[0].elements[0];
    expect(nav.elType).toBe('container');
    expect(nav.settings.flex_gap).toEqual({ unit: 'px', column: 0, row: 0, isLinked: true });
    expect(nav.elements[0].settings.button_text_color).toBe('#ffffff');
    expect(nav.elements[0].settings.typography_font_weight).toBe('600');
    expect(nav.elements[0].settings.typography_text_decoration).toBe('underline');
    expect(nav.elements[1].settings.button_text_color).toBe('#98a2b3');
  });

  it('normalizes misplaced direction without discarding the observed row', () => {
    const dir = fixture([node('flex-group', { styles: { direction: 'row' }, children: [node('image', { alt: 'Art', url: 'https://example.com/art.png', aspectRatio: 1.5 })] })]);
    const normalized = normalizeDIR(dir);
    const validation = validateDIR(normalized);
    expect(validation.errors).toEqual([]);
    expect(normalized.pages[0].sections[0].children[0].direction).toBe('row');
    expect(normalized.pages[0].sections[0].children[0].styles.direction).toBeUndefined();
    expect((normalized.pages[0].sections[0].children[0] as any).children[0].aspectRatio).toBe('1.5');
  });

  it('preserves measured image size, uses native object-fit, and adds no visible alt caption', () => {
    const dir = fixture([node('image', { url: 'https://example.com/art.png', alt: 'Hero illustration', composite_graphic_asset: true, styles: { width: 595, height: 650 } })], { minHeight: 960 });
    const section = exported(dir).content[0];
    expect(section.settings.min_height.size).toBe(960);
    const image = section.elements[0].settings;
    expect(image.width).toEqual({ unit: 'px', size: 595 });
    expect(image.height).toEqual({ unit: 'px', size: 650 });
    expect(image['object-fit']).toBe('contain');
    expect(image.caption).toBeUndefined();
  });

  it('does not mutate source column widths and caps boxed layout at the source canvas', () => {
    const dir = fixture([node('flex-group', { direction: 'row', children: [
      node('container', { styles: { width: 900 }, children: [] }), node('container', { id: 'right', styles: { width: 180 }, children: [] }),
    ] })]);
    const before = JSON.stringify(dir);
    const doc = exported(dir);
    expect(JSON.stringify(dir)).toBe(before);
    expect(doc.content[0].settings.boxed_width.size).toBeLessThanOrEqual(1140);
    expect(doc.content[0].elements[0].elements[0].settings.width.size).toBe(900);
  });

  it('preserves measured linear gradients through export', () => {
    const section = exported(fixture([node('heading', { text: 'Gradient', level: 1 })], {
      backgroundGradient: 'linear-gradient(135deg, #111827 15%, #1d2939 90%)',
    })).content[0].settings;
    expect(section.background_background).toBe('gradient');
    expect(section.background_color).toBe('#111827');
    expect(section.background_color_b).toBe('#1d2939');
    expect(section.background_gradient_angle.size).toBe(135);
  });

  it('builds deterministic prompts without request timestamps', () => {
    const info = { width: 1140, height: 612, mimeType: 'image/png', sha256: 'source' };
    const first = getImageAnalysisPrompt(info);
    expect(first).toEqual(getImageAnalysisPrompt(info));
    expect(first.systemPrompt).not.toContain('"analysisTimestamp":');
    expect(first.systemPrompt).toContain('ENTIRE graphic');
  });
});

describe('Composite crop boundary evidence', () => {
  it('expands an in-bounds rectangle that clips a connected light graphic', async () => {
    const image = await sharp({ create: { width: 720, height: 400, channels: 4, background: '#141a39' } })
      .composite([{ input: await sharp({ create: { width: 300, height: 250, channels: 4, background: '#faefdc' } }).png().toBuffer(), left: 350, top: 70 }])
      .png().toBuffer();
    const original = { x: 360, y: 150, width: 180, height: 150 };
    const [corrected] = await expandClippedCompositeBounds(image, [original]);
    expect(corrected.x).toBeLessThanOrEqual(350);
    expect(corrected.y).toBeLessThanOrEqual(70);
    expect(corrected.x + corrected.width).toBeGreaterThanOrEqual(650);
    expect(corrected.y + corrected.height).toBeGreaterThanOrEqual(320);
    expect(original).toEqual({ x: 360, y: 150, width: 180, height: 150 });
  });

  it('does not invent crop changes for a light page or low-contrast artwork', async () => {
    for (const color of ['#ffffff', '#141a39']) {
      const image = await sharp({ create: { width: 300, height: 200, channels: 4, background: color } }).png().toBuffer();
      const rect = { x: 100, y: 50, width: 100, height: 100 };
      expect(await expandClippedCompositeBounds(image, [rect])).toEqual([rect]);
    }
  });
});
