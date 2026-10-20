import { describe, expect, it, vi } from 'vitest';
import type { DIRDocument, DIRNode } from '../modules/dir/types.js';
import {
  compileDIRToElementor,
  ElementorCompilerAdapter,
  serializeElementorTemplate,
  validateElementorTemplate,
  WordPressRESTPublisher,
} from '../modules/elementor/index.js';

const document: DIRDocument = {
  version: '1.0.0',
  meta: {
    sourceImageHash: 'source-hash',
    sourceWidth: 1440,
    sourceHeight: 900,
    analysisProvider: 'test',
    analysisModel: 'test',
    analysisTimestamp: '2026-10-20T00:00:00.000Z',
    confidenceScore: 1,
    schemaVersion: '1.0.0',
    promptVersion: '1.0.0',
  },
  breakpoints: { desktop: { min: 1025 } },
  globals: {
    colors: { background: '#050a04', text: '#ffffff', primary: '#b7f34c' },
    typography: { fontFamilies: ['Inter'] },
  },
  assets: [
    {
      id: 'hero-art',
      type: 'image',
      role: 'hero artwork',
      sourceRect: { x: 10, y: 10, width: 200, height: 100 },
      confidence: 0.9,
    },
  ],
  pages: [
    {
      id: 'home',
      name: 'Home',
      sections: [
        {
          id: 'hero',
          role: 'hero',
          confidence: 1,
          styles: { padding: { top: 24, bottom: 24 } },
          children: [
            {
              id: 'content',
              kind: 'flex-group',
              direction: 'row',
              confidence: 1,
              styles: { gap: 16 },
              children: [
                {
                  id: 'title',
                  kind: 'heading',
                  text: 'A native Elementor page',
                  level: 1,
                  confidence: 1,
                  styles: { fontSize: 48 },
                },
                {
                  id: 'artwork',
                  kind: 'image',
                  assetId: 'hero-art',
                  alt: 'Abstract hero artwork',
                  confidence: 1,
                  styles: {},
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe('DIR-to-Elementor compiler', () => {
  it('preserves section hierarchy in native containers and emits deterministic IDs', () => {
    const first = compileDIRToElementor(document);
    const second = compileDIRToElementor(document);

    expect(first.template).toEqual(second.template);
    expect(first.template.type).toBe('page');
    expect(first.template.page_settings?.template).toBe('elementor_canvas');
    expect(first.template.content[0]?.elType).toBe('container');
    const section = first.template.content[0] as {
      elements: Array<{ elType: string; elements: Array<{ widgetType: string }> }>;
    };
    expect(section.elements[0]?.elType).toBe('container');
    expect(section.elements[0]?.elements.map((element) => element.widgetType)).toEqual([
      'heading',
      'image',
    ]);
    expect(first.totalSections).toBe(1);
    expect(first.totalContainers).toBe(2);
    expect(first.totalWidgets).toBe(2);

    const ids: string[] = [];
    const visit = (elements: Array<Record<string, unknown>>): void => {
      for (const element of elements) {
        ids.push(String(element.id));
        visit(element.elements as Array<Record<string, unknown>>);
      }
    };
    visit(first.template.content);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[a-f0-9]{8}$/.test(id))).toBe(true);
  });

  it('reports stored or unresolved media rather than inventing an asset URL', () => {
    const { assetManifest, template } = compileDIRToElementor(document);
    expect(assetManifest.unresolvedAssetIds).toEqual(['hero-art']);
    expect(assetManifest.assets[0]?.status).toBe('pending_crop');
    const section = template.content[0] as {
      elements: Array<{ elements: Array<{ settings: { image: { url: string } } }> }>;
    };
    expect(section.elements[0]?.elements[1]?.settings.image.url).toBe('');
  });

  it('resolves published media and applies responsive Elementor controls', () => {
    const documentWithPublishedAsset = structuredClone(document);
    documentWithPublishedAsset.assets[0]!.url = 'https://cdn.example.com/hero.png';
    documentWithPublishedAsset.assets[0]!.metadata = { wordpressAttachmentId: 88 };
    documentWithPublishedAsset.pages[0]!.sections[0]!.styles.width = 1200;
    const flexGroup = documentWithPublishedAsset.pages[0]!.sections[0]!.children[0]!;
    if (flexGroup.kind !== 'flex-group') throw new Error('Test fixture must contain a flex group');
    flexGroup.children[0]!.responsiveOverrides = { mobile: { fontSize: 30 } };
    const result = compileDIRToElementor(documentWithPublishedAsset);
    const section = result.template.content[0] as {
      settings: Record<string, unknown>;
      elements: Array<{ elements: Array<{ settings: Record<string, unknown> }> }>;
    };
    const heading = section.elements[0]?.elements[0]?.settings;
    const image = section.elements[0]?.elements[1]?.settings.image as { id: number; url: string };

    expect(section.settings.width_mobile).toEqual({ unit: '%', size: 100 });
    expect(heading?.typography_font_size_mobile).toEqual({ unit: 'px', size: 30 });
    expect(image).toEqual({ id: 88, url: 'https://cdn.example.com/hero.png', alt: 'Abstract hero artwork' });
    expect(result.assetManifest.assets[0]?.status).toBe('ready');
    expect(result.assetManifest.unresolvedAssetIds).toEqual([]);
  });

  it('validates output before serialization and rejects unsupported DIR nodes', () => {
    const compiled = compileDIRToElementor(document);
    expect(validateElementorTemplate(compiled.template).valid).toBe(true);
    expect(JSON.parse(serializeElementorTemplate(compiled.template))).toEqual(compiled.template);

    const invalid = structuredClone(compiled.template);
    invalid.content[0]!.id = 'duplicate';
    expect(validateElementorTemplate(invalid).errors.some((error) => error.includes('.id'))).toBe(true);

    const unsupported: DIRDocument = {
      ...document,
      pages: [{
        ...document.pages[0]!,
        sections: [{
          ...document.pages[0]!.sections[0]!,
          children: [{
            id: 'form',
            kind: 'form',
            confidence: 1,
            styles: {},
            children: [],
          }],
        }],
      }],
    };
    expect(() => compileDIRToElementor(unsupported)).toThrow(/no native form widget/);
  });

  it('implements the pipeline compiler adapter contract', async () => {
    const adapter = new ElementorCompilerAdapter();
    const output = await adapter.compileToElementor({
      jobId: 'job',
      validatedDIRDocument: document,
      targetVersion: '4.3.5',
    });
    expect(output.elementorTemplate.content).toHaveLength(1);
    expect(output.assetManifest?.assets).toHaveLength(1);
    expect(output.compiledAt).toBeTruthy();
  });

  it('maps each supported DIR node kind to validated native Elementor elements', () => {
    const nodes: DIRNode[] = [
      { id: 'container', kind: 'container', confidence: 1, styles: {}, children: [] },
      { id: 'flex', kind: 'flex-group', direction: 'row', confidence: 1, styles: {}, children: [] },
      { id: 'grid', kind: 'grid-group', columns: 2, confidence: 1, styles: {}, children: [] },
      { id: 'heading', kind: 'heading', text: 'Title', level: 2, confidence: 1, styles: {} },
      { id: 'text', kind: 'text', html: '<p>Text</p>', confidence: 1, styles: {} },
      { id: 'button', kind: 'button', text: 'Continue', confidence: 1, styles: {} },
      { id: 'image', kind: 'image', url: 'https://example.com/image.png', confidence: 1, styles: {} },
      { id: 'icon', kind: 'icon', iconName: 'fas fa-star', confidence: 1, styles: {} },
      { id: 'icon-text', kind: 'icon-text', iconName: 'fas fa-check', text: 'Feature', confidence: 1, styles: {} },
      {
        id: 'list',
        kind: 'list',
        confidence: 1,
        styles: {},
        children: [{ id: 'item', kind: 'list-item', text: 'Item', confidence: 1, styles: {} }],
      },
      { id: 'list-item', kind: 'list-item', text: 'Item', confidence: 1, styles: {} },
      { id: 'divider', kind: 'divider', confidence: 1, styles: {} },
      { id: 'spacer', kind: 'spacer', height: 24, confidence: 1, styles: {} },
      { id: 'card', kind: 'card', confidence: 1, styles: {}, children: [] },
      { id: 'video', kind: 'video', url: 'https://youtu.be/example', confidence: 1, styles: {} },
      { id: 'map', kind: 'map', location: 'Dhaka', confidence: 1, styles: {} },
      { id: 'social', kind: 'social-icons', platforms: [{ name: 'instagram' }], confidence: 1, styles: {} },
      { id: 'counter', kind: 'counter', value: 25, confidence: 1, styles: {} },
      { id: 'progress', kind: 'progress-bar', value: 50, confidence: 1, styles: {} },
      { id: 'tabs', kind: 'tabs', items: [{ title: 'One', content: 'First' }], confidence: 1, styles: {} },
      { id: 'accordion', kind: 'accordion', items: [{ title: 'One', content: 'First' }], confidence: 1, styles: {} },
      { id: 'rating', kind: 'rating', rating: 4, confidence: 1, styles: {} },
      { id: 'badge', kind: 'badge', text: 'New', confidence: 1, styles: {} },
      { id: 'image-box', kind: 'image-box', title: 'Feature', confidence: 1, styles: {} },
    ];

    for (const node of nodes) {
      const oneNodeDocument: DIRDocument = {
        ...document,
        pages: [{
          ...document.pages[0]!,
          sections: [{
            ...document.pages[0]!.sections[0]!,
            children: [node],
          }],
        }],
      };
      const result = compileDIRToElementor(oneNodeDocument);
      expect(validateElementorTemplate(result.template).errors, node.kind).toEqual([]);
    }
  });

  it('does not flatten multiple DIR pages into one Elementor page', () => {
    const multiPageDocument: DIRDocument = {
      ...document,
      pages: [document.pages[0]!, { ...document.pages[0]!, id: 'second' }],
    };
    expect(() => compileDIRToElementor(multiPageDocument)).toThrow(/exactly one DIR page/);
  });
});

describe('WordPress REST publisher', () => {
  it('publishes a validated page as a draft by default', async () => {
    const template = compileDIRToElementor(document).template;
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 42,
          status: 'draft',
          link: 'https://site.example/page/',
          _links: { edit: [{ href: 'https://site.example/wp-admin/post.php?post=42&action=edit' }] },
          meta: {
            _elementor_data: JSON.stringify(template.content),
            _elementor_edit_mode: 'builder',
          },
        }),
        { status: 201 }
      )
    );
    const publisher = new WordPressRESTPublisher(
      {
        baseUrl: 'https://site.example',
        username: 'editor',
        applicationPassword: 'application-password',
      },
      fetcher
    );
    const result = await publisher.publishTemplate(
      'job-1',
      template
    );

    expect(result.wordpressPostId).toBe(42);
    expect(result.postStatus).toBe('draft');
    expect(result.previewUrl).toBe('https://site.example/page/');
    const request = fetcher.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as {
      status: string;
      template: string;
      meta: { _elementor_data: string };
    };
    expect(body.status).toBe('draft');
    expect(body.template).toBe('elementor_canvas');
    expect(JSON.parse(body.meta._elementor_data)).toHaveLength(1);
  });
});
