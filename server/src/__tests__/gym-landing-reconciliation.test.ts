import { describe, it, expect } from 'vitest';
import { convertDIRToElementor } from '../modules/elementor/generator.js';
import type { DIRDocument } from '../modules/dir/types.js';
import * as fs from 'fs';
import * as path from 'path';

describe('Master Skill Reconciliation — Gym Landing & Visual Fidelity Suite', () => {
  it('1. Compiles circular statistics metric container with 9999px border radius and centered alignment', () => {
    const dirDoc: DIRDocument = {
      version: '1.0.0',
      meta: {
        sourceImageHash: 'abcdef1234567890',
        sourceWidth: 1065,
        sourceHeight: 687,
        analysisProvider: 'ai',
        analysisModel: 'vision',
        analysisTimestamp: new Date().toISOString(),
        confidenceScore: 0.95,
        schemaVersion: '1.0.0',
        promptVersion: '1.0.0',
        notes: ['Gym Landing Page'],
      },
      breakpoints: {
        desktop: { min: 1024 },
        tablet: { min: 768, max: 1023 },
        mobile: { min: 320, max: 767 },
      },
      globals: {
        colors: {
          background: '#0d110e',
          text: '#ffffff',
          primary: '#ff5e14',
        },
        typography: {
          fontFamilies: ['Inter'],
          headingFont: 'Inter',
          bodyFont: 'Inter',
          baseSize: 16,
          scale: 1.2,
        },
        spacing: {
          unit: 'px',
          base: 8,
          sectionGap: 64,
          containerMaxWidth: 1200,
        },
      },
      assets: [],
      pages: [
        {
          id: 'page_gym',
          name: 'Gym Landing',
          sections: [
            {
              id: 'sec_hero',
              role: 'hero',
              label: 'Hero Section',
              confidence: 0.95,
              styles: {
                backgroundColor: '#0d110e',
                maxWidth: 1200,
              },
              children: [
                {
                  id: 'stat_circle_badge',
                  kind: 'container',
                  direction: 'column',
                  confidence: 0.95,
                  styles: {
                    width: 140,
                    height: 140,
                    borderRadius: 9999,
                    backgroundColor: '#1b221c',
                    borderWidth: 2,
                    borderColor: '#ff5e14',
                    justifyContent: 'center',
                    alignItems: 'center',
                  },
                  children: [
                    {
                      id: 'cnt_progress',
                      kind: 'counter',
                      value: 70,
                      suffix: '%',
                      confidence: 0.95,
                      styles: {
                        color: '#ff5e14',
                        fontSize: 28,
                        fontWeight: 700,
                        textAlign: 'center',
                      },
                    },
                    {
                      id: 'txt_label',
                      kind: 'text',
                      html: '<p>Fitness Progress</p>',
                      confidence: 0.95,
                      styles: {
                        color: '#ffffff',
                        fontSize: 12,
                        textAlign: 'center',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const { document, report } = convertDIRToElementor(dirDoc);
    expect(report.widgetsUsed).toContain('counter');
    expect(report.widgetsUsed).toContain('text-editor');

    const heroSection = document.content[0];
    expect(heroSection.elType).toBe('container');
    expect(heroSection.settings.boxed_width).toEqual({ unit: 'px', size: 1200, sizes: [] });

    const circleContainer = heroSection.elements[0];
    expect(circleContainer.elType).toBe('container');
    expect(circleContainer.settings.border_radius).toEqual({
      top: '9999',
      right: '9999',
      bottom: '9999',
      left: '9999',
      unit: 'px',
      isLinked: true,
    });
    expect(circleContainer.settings.width).toEqual({ unit: 'px', size: 140 });
    expect(circleContainer.settings.custom_height).toEqual({ unit: 'px', size: 140, sizes: [] });
    expect(circleContainer.settings.flex_justify_content).toBe('center');
    expect(circleContainer.settings.flex_align_items).toBe('center');

    const counterWidget = circleContainer.elements[0];
    expect(counterWidget.widgetType).toBe('counter');
    expect(counterWidget.settings.ending_number).toBe(70);
    expect(counterWidget.settings.suffix).toBe('%');
    expect(counterWidget.settings.number_color).toBe('#ff5e14');
    expect(counterWidget.settings.typography_number_font_size).toEqual({ unit: 'px', size: 28 });
    expect(counterWidget.settings.typography_number_font_weight).toBe('700');
  });

  it('2. Compiles prominent hero photograph with sourceRect asset and orange CTA button', () => {
    const dirDoc: DIRDocument = {
      version: '1.0.0',
      meta: {
        sourceImageHash: 'abcdef1234567890',
        sourceWidth: 1065,
        sourceHeight: 687,
        analysisProvider: 'ai',
        analysisModel: 'vision',
        analysisTimestamp: new Date().toISOString(),
        confidenceScore: 0.95,
        schemaVersion: '1.0.0',
        promptVersion: '1.0.0',
        notes: [],
      },
      breakpoints: {
        desktop: { min: 1024 },
        tablet: { min: 768, max: 1023 },
        mobile: { min: 320, max: 767 },
      },
      globals: {
        colors: {
          background: '#050a04',
          text: '#ffffff',
          primary: '#ff5e14',
        },
        typography: {
          fontFamilies: ['Inter'],
          headingFont: 'Inter',
          bodyFont: 'Inter',
          baseSize: 16,
          scale: 1.2,
        },
        spacing: {
          unit: 'px',
          base: 8,
          sectionGap: 64,
          containerMaxWidth: 1280,
        },
      },
      assets: [
        {
          id: 'asset_hero_athlete',
          type: 'image',
          role: 'hero athlete photograph',
          confidence: 0.95,
          placeholder: '/storage/projects/test/assets/asset_hero_athlete_12345678.png',
          sourceRect: { x: 500, y: 100, width: 450, height: 550 },
        },
      ],
      pages: [
        {
          id: 'page_gym',
          name: 'Gym Landing',
          sections: [
            {
              id: 'sec_hero',
              role: 'hero',
              label: 'Hero',
              confidence: 0.95,
              styles: {
                backgroundColor: '#050a04',
                minHeight: 600,
              },
              children: [
                {
                  id: 'head_main',
                  kind: 'heading',
                  text: 'UNLEASH YOUR POTENTIAL',
                  level: 1,
                  confidence: 0.95,
                  styles: {
                    color: '#ffffff',
                    fontSize: 56,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                  },
                },
                {
                  id: 'btn_cta',
                  kind: 'button',
                  text: 'JOIN TODAY',
                  variant: 'primary',
                  confidence: 0.95,
                  styles: {
                    backgroundColor: '#ff5e14',
                    color: '#ffffff',
                    borderRadius: 30,
                    padding: { top: 16, right: 32, bottom: 16, left: 32 },
                    fontSize: 16,
                    fontWeight: 700,
                  },
                },
                {
                  id: 'img_hero_athlete',
                  kind: 'image',
                  assetId: 'asset_hero_athlete',
                  alt: 'Pro Athlete Training',
                  objectFit: 'cover',
                  confidence: 0.95,
                  styles: {
                    width: 450,
                    height: 550,
                    borderRadius: 16,
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const { document, report } = convertDIRToElementor(dirDoc);
    expect(report.widgetsUsed).toContain('heading');
    expect(report.widgetsUsed).toContain('button');
    expect(report.widgetsUsed).toContain('image');

    const heroSection = document.content[0];
    expect(heroSection.settings.height).toBe('min-height');
    expect(heroSection.settings.custom_height).toEqual({ unit: 'px', size: 600, sizes: [] });

    // Heading validation
    const heading = heroSection.elements[0];
    expect(heading.settings.title).toBe('UNLEASH YOUR POTENTIAL');
    expect(heading.settings.title_color).toBe('#ffffff');
    expect(heading.settings.typography_font_size).toEqual({ unit: 'px', size: 56 });
    expect(heading.settings.typography_font_weight).toBe('800');
    expect(heading.settings.typography_text_transform).toBe('uppercase');

    // Button validation (Orange CTA)
    const button = heroSection.elements[1];
    expect(button.settings.text).toBe('JOIN TODAY');
    expect(button.settings.background_color).toBe('#ff5e14');
    expect(button.settings.button_text_color).toBe('#ffffff');
    expect(button.settings.border_radius).toEqual({
      top: '30',
      right: '30',
      bottom: '30',
      left: '30',
      unit: 'px',
      isLinked: true,
    });

    // Hero image validation
    const imgWidget = heroSection.elements[2];
    expect(imgWidget.settings.image.url).toBe('/storage/projects/test/assets/asset_hero_athlete_12345678.png');
    expect(imgWidget.settings.alt_text).toBe('Pro Athlete Training');
    expect(imgWidget.settings.caption).toBe('Pro Athlete Training');
    expect(imgWidget.settings.width).toEqual({ unit: 'px', size: 450 });
    expect(imgWidget.settings.height).toEqual({ unit: 'px', size: 550 });
    expect(imgWidget.settings.image_fit).toBe('cover');
  });

  it('3. Reconciled ELEMENTOR_SKILL.md contains Section 11 and Master Builder rules', () => {
    const skillPath = path.resolve(__dirname, '../../ELEMENTOR_SKILL.md');
    expect(fs.existsSync(skillPath)).toBe(true);

    const content = fs.readFileSync(skillPath, 'utf8');
    expect(content).toContain('## 11. Reconciled Master Builder Standards');
    expect(content).toContain('11.1 Container Geometry & Sizing Standards');
    expect(content).toContain('11.2 Circular Statistics & Metric Badges');
    expect(content).toContain('11.3 Hero Photography & Dynamic Cropping');
    expect(content).toContain('11.4 High-Impact CTA Buttons & Wide Headings');
    expect(content).toContain('11.5 Deterministic Free Tier Fallback Reconstructions');
    expect(content).toContain('11.6 Explicit Architectural Invariants & Negative Constraints');
  });
});
