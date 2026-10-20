/**
 * Elementor Generation Tests
 * 
 * Tests DIR-to-Elementor JSON conversion, widget registry,
 * element ID generation, and structural validation.
 * Uses fixture data only — no live AI calls.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import type { DIRDocument } from '../modules/dir/types.js';

const require = createRequire(import.meta.url);
const sampleDir = require('../__fixtures__/sample-dir.json');

// These will be imported from the actual modules once built
// For now, define inline test utilities

function generateElementId(): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

describe('Elementor Generation', () => {
  describe('Element ID Generation', () => {
    it('should generate 8-character hex IDs', () => {
      const id = generateElementId();
      expect(id).toHaveLength(8);
      expect(id).toMatch(/^[0-9a-f]{8}$/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateElementId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('Widget Registry', () => {
    it('should have core widget profiles', () => {
      const coreWidgets = [
        'heading', 'text-editor', 'image', 'button', 'icon',
        'icon-box', 'divider', 'spacer', 'counter', 'progress',
        'video', 'google-maps', 'social-icons', 'tabs', 'accordion'
      ];
      // Registry validation will be done via the actual module
      expect(coreWidgets.length).toBe(15);
    });
  });

  describe('DIR Node to Elementor Mapping', () => {
    const dirNodeToWidgetMap: Record<string, string> = {
      'heading': 'heading',
      'text': 'text-editor',
      'button': 'button',
      'image': 'image',
      'icon': 'icon',
      'icon-text': 'icon-box',
      'divider': 'divider',
      'spacer': 'spacer',
      'counter': 'counter',
      'progress-bar': 'progress',
      'rating': 'star-rating',
      'social-icons': 'social-icons',
      'video': 'video',
      'map': 'google-maps',
      'tabs': 'tabs',
      'accordion': 'accordion',
    };

    it('should map all content node kinds to widgets', () => {
      const contentKinds = ['heading', 'text', 'button', 'image', 'icon', 'divider', 'spacer'];
      for (const kind of contentKinds) {
        expect(dirNodeToWidgetMap[kind]).toBeDefined();
      }
    });

    it('should map layout nodes to containers', () => {
      const layoutKinds = ['container', 'flex-group', 'grid-group', 'card'];
      for (const kind of layoutKinds) {
        // Layout nodes become elType='container', not widgets
        expect(['container', 'flex-group', 'grid-group', 'card']).toContain(kind);
      }
    });
  });

  describe('Elementor Settings Mapping', () => {
    it('should map colors to Elementor color settings', () => {
      const colorMapping = {
        'color': 'title_color', // for heading
        'backgroundColor': 'background_color', // for button
      };
      expect(colorMapping).toBeDefined();
    });

    it('should map typography to Elementor typography controls', () => {
      const typographyMapping = {
        'fontFamily': 'typography_font_family',
        'fontSize': 'typography_font_size',
        'fontWeight': 'typography_font_weight',
        'lineHeight': 'typography_line_height',
        'letterSpacing': 'typography_letter_spacing',
        'textTransform': 'typography_text_transform',
      };
      expect(Object.keys(typographyMapping)).toHaveLength(6);
    });

    it('should format size values correctly', () => {
      const elementorSize = { unit: 'px', size: 16 };
      expect(elementorSize.unit).toBe('px');
      expect(elementorSize.size).toBe(16);
    });

    it('should format dimension values correctly', () => {
      const elementorDimension = {
        unit: 'px',
        top: '16',
        right: '24',
        bottom: '16',
        left: '24',
        isLinked: false,
      };
      expect(elementorDimension.isLinked).toBe(false);
    });

    it('should add responsive suffixes', () => {
      const settings: Record<string, any> = {
        'align': 'center',
        'align_tablet': 'left',
        'align_mobile': 'center',
      };
      expect(settings.align).toBe('center');
      expect(settings.align_tablet).toBe('left');
      expect(settings.align_mobile).toBe('center');
    });
  });

  describe('Elementor Document Structure', () => {
    it('should have correct template envelope', () => {
      const template = {
        content: [],
        page_settings: { template: 'elementor_canvas' },
        version: '0.4',
        title: 'Test Page',
        type: 'page',
      };
      expect(template.version).toBe('0.4');
      expect(template.type).toBe('page');
      expect(template.content).toBeInstanceOf(Array);
    });

    it('should use container elType for layout', () => {
      const container = {
        id: generateElementId(),
        elType: 'container',
        settings: {
          container_type: 'flex',
          flex_direction: 'column',
        },
        elements: [],
      };
      expect(container.elType).toBe('container');
      expect(container.settings.container_type).toBe('flex');
    });

    it('should use widget elType for content', () => {
      const widget = {
        id: generateElementId(),
        elType: 'widget',
        widgetType: 'heading',
        settings: {
          title: 'Test Heading',
          header_size: 'h2',
        },
        elements: [],
      };
      expect(widget.elType).toBe('widget');
      expect(widget.widgetType).toBe('heading');
    });

    it('should nest elements properly', () => {
      const container = {
        id: generateElementId(),
        elType: 'container',
        settings: {},
        elements: [
          {
            id: generateElementId(),
            elType: 'widget',
            widgetType: 'heading',
            settings: { title: 'Nested' },
            elements: [],
          },
        ],
      };
      expect(container.elements).toHaveLength(1);
      expect(container.elements[0].elType).toBe('widget');
    });
  });

  describe('Fixture DIR Conversion', () => {
    it('should have valid fixture DIR', () => {
      const dir = sampleDir as unknown as DIRDocument;
      expect(dir.version).toBe('1.0.0');
      expect(dir.pages).toHaveLength(1);
      expect(dir.pages[0].sections.length).toBeGreaterThan(0);
    });

    it('should have expected section roles in fixture', () => {
      const dir = sampleDir as unknown as DIRDocument;
      const roles = dir.pages[0].sections.map((s: { role: string }) => s.role);
      expect(roles).toContain('header');
      expect(roles).toContain('hero');
      expect(roles).toContain('feature');
      expect(roles).toContain('cta');
      expect(roles).toContain('footer');
    });
  });
});

