/**
 * Conversion Quality Gate & Structural Integrity Regression Tests
 * 
 * Verifies that:
 * 1. False success is impossible: DIRs with 0 sections, empty sections, or 0 nodes throw explicit errors.
 * 2. Elementor outputs with 0 content, 0 widgets, or unpopulated image URLs throw explicit errors.
 * 3. The actual persisted gym landing page artifacts pass all structural and visual quality criteria.
 * 4. Quality audits accurately count sections, recursive nodes, containers, widgets, and resolved images.
 * 
 * Zero external network calls (no live AI, no B2, no WordPress).
 */

import { describe, it, expect } from 'vitest';
import { getConversionOrchestrator } from '../modules/conversion/orchestrator.js';
import type { DIRDocument } from '../modules/dir/types.js';
import fs from 'fs';
import path from 'path';

describe('Conversion Quality Gate & Structural Validation', () => {
  const orchestrator = getConversionOrchestrator();

  const minimalValidDir: DIRDocument = {
    version: '1.0.0',
    meta: {
      sourceImageHash: 'test-hash',
      sourceWidth: 1440,
      sourceHeight: 900,
      analysisProvider: 'test',
      analysisModel: 'test-model',
      analysisTimestamp: new Date().toISOString(),
      confidenceScore: 0.95,
      schemaVersion: '1.0.0',
      promptVersion: '1.0.0',
    },
    breakpoints: {
      desktop: { min: 1024 },
      tablet: { min: 768, max: 1023 },
      mobile: { min: 320, max: 767 },
    },
    globals: {
      colors: { background: '#ffffff', text: '#000000', primary: '#ff4500' },
      typography: {
        fontFamilies: ['Inter'],
        baseSize: 16,
      },
      spacing: { unit: 'px', base: 8, sectionGap: 64, containerMaxWidth: 1200 },
    },
    assets: [],
    pages: [
      {
        id: 'page_main',
        name: 'Home',
        sections: [
          {
            id: 'sec_1',
            role: 'hero' as const,
            confidence: 0.95,
            styles: {},
            children: [
              {
                id: 'head_1',
                kind: 'heading',
                confidence: 0.95,
                styles: {},
                text: 'Main Title',
                level: 1,
              },
            ],
          },
        ],
      },
    ],
  };

  const minimalValidElementor = {
    content: [
      {
        id: 'cont_1',
        elType: 'container',
        elements: [
          {
            id: 'w_1',
            elType: 'widget',
            widgetType: 'heading',
            settings: { title: 'Main Title' },
            elements: [],
          },
        ],
      },
    ],
    page_settings: {
      background_color: '#ffffff',
    },
  };

  it('passes minimal valid DIR and Elementor documents', () => {
    const result = orchestrator.verifyVisualQuality(minimalValidDir, minimalValidElementor);
    expect(result.passed).toBe(true);
    expect(result.totalSections).toBe(1);
    expect(result.totalDirNodes).toBe(1);
    expect(result.totalContainers).toBe(1);
    expect(result.totalWidgets).toBe(1);
    expect(result.imageCount).toBe(0);
    expect(result.resolvedImageCount).toBe(0);
  });

  it('rejects DIR with empty pages array', () => {
    const invalidDir = { ...minimalValidDir, pages: [] };
    expect(() => orchestrator.verifyVisualQuality(invalidDir, minimalValidElementor))
      .toThrow('Quality verification failed: DIR document contains no pages');
  });

  it('rejects DIR with a page containing 0 sections', () => {
    const invalidDir = {
      ...minimalValidDir,
      pages: [{ id: 'p1', name: 'Home', sections: [] }],
    };
    expect(() => orchestrator.verifyVisualQuality(invalidDir, minimalValidElementor))
      .toThrow('Quality verification failed: Page "p1" contains no sections');
  });

  it('rejects DIR where a section contains 0 elements (empty section)', () => {
    const invalidDir = {
      ...minimalValidDir,
      pages: [
        {
          id: 'p1',
          name: 'Home',
          sections: [
            {
              id: 'sec_empty',
              role: 'hero' as const,
              confidence: 0.9,
              styles: {},
              children: [],
            },
          ],
        },
      ],
    };
    expect(() => orchestrator.verifyVisualQuality(invalidDir, minimalValidElementor))
      .toThrow('Quality verification failed: Section "sec_empty" contains 0 elements');
  });

  it('rejects Elementor document with empty content', () => {
    const emptyElementor = { content: [] };
    expect(() => orchestrator.verifyVisualQuality(minimalValidDir, emptyElementor))
      .toThrow('Quality verification failed: Elementor template content is empty');
  });

  it('rejects Elementor document with containers but 0 widgets', () => {
    const zeroWidgetsElementor = {
      content: [
        {
          id: 'cont_1',
          elType: 'container',
          elements: [],
        },
      ],
    };
    expect(() => orchestrator.verifyVisualQuality(minimalValidDir, zeroWidgetsElementor))
      .toThrow('Quality verification failed: Elementor template contains 0 widgets');
  });

  it('rejects Elementor document with unresolved/empty image widget URLs', () => {
    const brokenImageElementor = {
      content: [
        {
          id: 'cont_1',
          elType: 'container',
          elements: [
            {
              id: 'img_broken',
              elType: 'widget',
              widgetType: 'image',
              settings: {
                image: { url: '' }, // Empty URL
              },
              elements: [],
            },
          ],
        },
      ],
    };
    expect(() => orchestrator.verifyVisualQuality(minimalValidDir, brokenImageElementor))
      .toThrow('Quality verification failed: Image widget "img_broken" has no resolved image URL');
  });

  it('validates the actual persisted gym landing page artifacts', () => {
    const persistedDirPath = path.resolve(__dirname, '../../persisted_dir.json');
    const persistedElementorPath = path.resolve(__dirname, '../../persisted_elementor.json');

    expect(fs.existsSync(persistedDirPath)).toBe(true);
    expect(fs.existsSync(persistedElementorPath)).toBe(true);

    const persistedDir = JSON.parse(fs.readFileSync(persistedDirPath, 'utf-8'));
    const persistedElementor = JSON.parse(fs.readFileSync(persistedElementorPath, 'utf-8'));

    const result = orchestrator.verifyVisualQuality(persistedDir, persistedElementor);

    expect(result.passed).toBe(true);
    expect(result.totalPages).toBe(1);
    expect(result.totalSections).toBe(2);
    expect(result.totalDirNodes).toBe(33);
    expect(result.totalContainers).toBe(15);
    expect(result.totalWidgets).toBe(14);
    expect(result.imageCount).toBe(2);
    expect(result.resolvedImageCount).toBe(2);
  });
});
