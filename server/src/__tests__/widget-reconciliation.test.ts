import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getRegistry } from '../modules/elementor/registry.js';
import { ElementorGenerator } from '../modules/elementor/generator.js';

describe('Elementor Core 4.3.5 Widget Reconciliation Test Suite', () => {
  const skillsDir = path.resolve(__dirname, '../skills/elementor');
  const registryPath = path.join(skillsDir, 'widget-registry.json');
  const registryRaw = fs.readFileSync(registryPath, 'utf8');
  const registryData = JSON.parse(registryRaw);

  it('widget-registry.json is well-formed and declares Elementor Core 4.3.5', () => {
    expect(registryData.elementor_source_version).toBe('4.3.5');
    expect(Array.isArray(registryData.widgets)).toBe(true);
    expect(registryData.widgets.length).toBe(32);
  });

  it('has zero duplicate slugs across all 32 registered widgets', () => {
    const slugs = registryData.widgets.map((w: any) => w.slug);
    const uniqueSlugs = new Set(slugs);
    expect(uniqueSlugs.size).toBe(32);
    expect(slugs.length).toBe(32);
  });

  it('every registered widget has a corresponding valid JSON reference file', () => {
    for (const w of registryData.widgets) {
      const relPath = w.reference_file.replace(/^references\//, '');
      const fullPath = path.join(skillsDir, relPath);
      expect(fs.existsSync(fullPath)).toBe(true);

      const raw = fs.readFileSync(fullPath, 'utf8');
      const parsed = JSON.parse(raw);
      expect(parsed).toBeDefined();

      const node = parsed.native_elementor_node_example;
      expect(node).toBeDefined();
      expect(typeof node.id).toBe('string');
      expect(typeof node.elType).toBe('string');
      expect(node.settings).toBeDefined();
      expect(typeof node.settings).toBe('object');
      expect(Array.isArray(node.elements)).toBe(true);

      if (node.elType === 'widget') {
        expect(node.widgetType).toBe(w.slug);
      }
    }
  });

  it('registry loader correctly parses and loads all skill reference JSONs', () => {
    const reg = getRegistry().clone();
    const loadResult = reg.loadFromDirectory(path.join(skillsDir, 'widgets'));
    expect(loadResult.errors).toEqual([]);
    expect(loadResult.loaded).toBeGreaterThanOrEqual(30);

    // Assert key slugs exist in registry
    expect(reg.has('heading')).toBe(true);
    expect(reg.has('google_maps')).toBe(true);
    expect(reg.has('star-rating')).toBe(true);
    expect(reg.has('rating')).toBe(true);
  });

  it('proves no ambiguity between server/ELEMENTOR_SKILL.md and deprecated server/ELEMTOR_SKILL.md', () => {
    const canonicalPath = path.resolve(__dirname, '../../ELEMENTOR_SKILL.md');
    const legacyPath = path.resolve(__dirname, '../../ELEMTOR_SKILL.md');

    expect(fs.existsSync(canonicalPath)).toBe(true);
    expect(fs.existsSync(legacyPath)).toBe(true);

    const legacyContent = fs.readFileSync(legacyPath, 'utf8');
    expect(legacyContent).toContain('DEPRECATION NOTICE');
    expect(legacyContent).toContain('server/ELEMENTOR_SKILL.md');
  });

  it('generates valid Elementor JSON containing key reconciled widgets', () => {
    const generator = new ElementorGenerator({ preferContainers: true });
    const mockDIR: any = {
      version: '1.0',
      designWidth: 1440,
      pages: [
        {
          id: 'page-1',
          name: 'Home',
          sections: [
            {
              id: 'sec-1',
              name: 'Hero',
              layout: { type: 'flex', direction: 'column' },
              children: [
                {
                  id: 'node-head',
                  kind: 'heading',
                  text: 'Hero Headline',
                  level: 1,
                },
                {
                  id: 'node-map',
                  kind: 'map',
                  address: 'Dhaka, Bangladesh',
                  zoom: 12,
                },
                {
                  id: 'node-rating',
                  kind: 'rating',
                  value: 4.8,
                  scale: 5,
                },
              ],
            },
          ],
        },
      ],
    };

    const { document, report } = generator.convert(mockDIR);
    expect(document.content.length).toBe(1);
    const container = document.content[0];
    expect(container.elType).toBe('container');
    expect(container.elements.length).toBe(3);

    const [headingNode, mapNode, ratingNode] = container.elements;
    expect(headingNode.widgetType).toBe('heading');
    expect(mapNode.widgetType).toBe('google_maps');
    expect(ratingNode.widgetType).toBe('star-rating');
    expect(report.widgetsUsed).toContain('heading');
    expect(report.widgetsUsed).toContain('google_maps');
    expect(report.widgetsUsed).toContain('star-rating');
  });
});
