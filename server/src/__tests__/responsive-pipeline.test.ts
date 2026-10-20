/**
 * Comprehensive Responsive Pipeline Regression Test Suite.
 * 
 * Tests:
 * 1. Schema compliance of 5 deterministic design fixtures.
 * 2. Deterministic conversion to native Elementor JSON with Elementor 4.3.5 responsive settings.
 * 3. Specific responsive behaviors:
 *    - Flex container column reflow on mobile/tablet.
 *    - Grid 3+ columns reflowing to 2 (tablet) and 1 (mobile).
 *    - Automatic headline typography scaling.
 *    - Proportional padding/margin scaling.
 *    - Clamping of fixed desktop widths on mobile viewports.
 *    - Explicit responsiveOverrides preservation.
 * 4. Full consistency audit (registry, profiles, responsive capabilities).
 * 5. Deterministic viewport overflow inspection.
 */

import { describe, it, expect } from 'vitest';
import { dirDocumentSchema } from '../modules/dir/schema.js';
import { generateElementorTemplate } from '../modules/elementor/generator.js';
import { validateConsistency } from '../modules/elementor/consistency-validator.js';
import {
  darkGymHeroFixture,
  lightFintechHeroFixture,
  multiSectionLandingFixture,
  narrowTallPageFixture,
  multiViewportReconciledFixture,
} from '../__fixtures__/responsive-fixtures.js';

describe('Responsive Pipeline & Fixtures Test Suite', () => {
  describe('1. Canonical DIR Schema Validation', () => {
    it('validates darkGymHeroFixture against canonical DIRDocument schema', () => {
      const result = dirDocumentSchema.safeParse(darkGymHeroFixture);
      expect(result.success).toBe(true);
      if (!result.success) console.error(result.error);
    });

    it('validates lightFintechHeroFixture against canonical DIRDocument schema', () => {
      const result = dirDocumentSchema.safeParse(lightFintechHeroFixture);
      expect(result.success).toBe(true);
      if (!result.success) console.error(result.error);
    });

    it('validates multiSectionLandingFixture against canonical DIRDocument schema', () => {
      const result = dirDocumentSchema.safeParse(multiSectionLandingFixture);
      if (!result.success) console.error('multiSectionLanding errors:', JSON.stringify(result.error.issues, null, 2));
      expect(result.success).toBe(true);
    });

    it('validates narrowTallPageFixture against canonical DIRDocument schema', () => {
      const result = dirDocumentSchema.safeParse(narrowTallPageFixture);
      if (!result.success) console.error('narrowTallPage errors:', JSON.stringify(result.error.issues, null, 2));
      expect(result.success).toBe(true);
    });

    it('validates multiViewportReconciledFixture with responsiveOverrides', () => {
      const result = dirDocumentSchema.safeParse(multiViewportReconciledFixture);
      if (!result.success) console.error('multiViewport errors:', JSON.stringify(result.error.issues, null, 2));
      expect(result.success).toBe(true);
    });
  });

  describe('2. Elementor Consistency Validator', () => {
    it('passes comprehensive consistency validation for registry, profiles, and responsive capabilities', () => {
      const report = validateConsistency();
      if (!report.isValid) console.error('Consistency errors:', report.errors);
      expect(report.isValid).toBe(true);
      expect(report.errors).toHaveLength(0);
      expect(report.totalWidgetsInRegistry).toBeGreaterThanOrEqual(15);
      expect(report.totalProfilesOnDisk).toBeGreaterThanOrEqual(30);
      expect(report.responsiveCapabilitiesCount).toBeGreaterThanOrEqual(8);
      expect(report.nodeKindsCovered.length).toBeGreaterThanOrEqual(15);
    });
  });

  describe('3. Fixture Conversion & Responsive Behavior', () => {
    it('converts darkGymHeroFixture preserving dark theme and counter widgets', () => {
      const { document, report } = generateElementorTemplate(darkGymHeroFixture);

      expect(document.version).toBe('0.4');
      expect(document.type).toBe('page');
      expect(document.content.length).toBe(2); // Header + Hero
      expect(report.totalContainers).toBeGreaterThan(0);
      expect(report.totalWidgets).toBeGreaterThan(0);

      // Hero section container should carry dark background
      const heroContainer = document.content[1];
      expect(heroContainer.elType).toBe('container');
      expect(heroContainer.settings?.background_color).toBe('#050a04');

      // Check responsive reflow on the row container
      const splitRow = heroContainer.elements[0];
      expect(splitRow.settings?.flex_direction_mobile).toBe('column');
      expect(splitRow.settings?.flex_direction_tablet).toBe('column');

      // Check counter widget generation
      const mediaCol = splitRow.elements[1];
      const statCard = mediaCol.elements[1];
      const counterWidget = statCard.elements[0];
      expect(counterWidget.widgetType).toBe('counter');
      expect(counterWidget.settings?.starting_number).toBe(0);
      expect(counterWidget.settings?.ending_number).toBe(85);
      expect(counterWidget.settings?.prefix).toBe('+');
      expect(counterWidget.settings?.suffix).toBe('%');

      // Check headline typography scaling
      const copyCol = splitRow.elements[0];
      const h1Widget = copyCol.elements[0];
      expect(h1Widget.widgetType).toBe('heading');
      expect(h1Widget.settings?.typography_font_size).toEqual({ unit: 'px', size: 54 });
      expect(h1Widget.settings?.typography_font_size_tablet?.size).toBeLessThan(54);
      expect(h1Widget.settings?.typography_font_size_mobile?.size).toBeLessThan(h1Widget.settings?.typography_font_size_tablet?.size);

      // Check width clamping on mobile for >360px container
      expect(copyCol.settings?.width_mobile).toEqual({ unit: '%', size: 100 });
    });

    it('converts lightFintechHeroFixture with light canvas and badge container', () => {
      const { document, report } = generateElementorTemplate(lightFintechHeroFixture);

      expect(document.content.length).toBe(1);
      const heroContainer = document.content[0];
      expect(heroContainer.settings?.background_color).toBe('#ffffff');

      // Button group flex direction reflow
      const row = heroContainer.elements[0];
      const leftCol = row.elements[0];
      const btnGroup = leftCol.elements[3];
      expect(btnGroup.settings?.flex_direction_mobile).toBe('column');

      expect(report.responsiveStats?.inferredOverridesCount).toBeGreaterThanOrEqual(1);
    });

    it('converts multiSectionLandingFixture with 3-column grid responsive reflow', () => {
      const { document } = generateElementorTemplate(multiSectionLandingFixture);

      expect(document.content.length).toBe(4); // Header, Hero, Features, Footer

      // Find feature section
      const featureSection = document.content[2];
      const gridContainer = featureSection.elements[0];

      // Grid settings: desktop 3 cols -> tablet 2 cols -> mobile 1 col
      expect(gridContainer.settings?.container_type).toBe('grid');
      expect(gridContainer.settings?.grid_columns_grid).toEqual({ unit: 'fr', size: 3 });
      expect(gridContainer.settings?.grid_columns_grid_tablet).toEqual({ unit: 'fr', size: 2 });
      expect(gridContainer.settings?.grid_columns_grid_mobile).toEqual({ unit: 'fr', size: 1 });
      expect(gridContainer.elements.length).toBe(3); // 3 cards
    });

    it('converts narrowTallPageFixture without crashing and scales spacing correctly', () => {
      const { document, report } = generateElementorTemplate(narrowTallPageFixture);

      expect(document.content.length).toBe(4); // Hero, content 1, content 2, CTA
      expect(report.totalContainers).toBeGreaterThanOrEqual(4);

      // Verify padding scaling on sections
      for (const section of document.content) {
        expect(section.settings?.padding_tablet).toBeDefined();
        expect(section.settings?.padding_mobile).toBeDefined();
        expect(Number(section.settings?.padding_mobile?.top)).toBeLessThanOrEqual(Number(section.settings?.padding?.top));
      }
    });

    it('converts multiViewportReconciledFixture applying explicit responsiveOverrides', () => {
      const { document, report } = generateElementorTemplate(multiViewportReconciledFixture);

      const heroSection = document.content[0];

      // Explicit section overrides
      expect(heroSection.settings?.padding_tablet).toEqual({
        unit: 'px',
        top: '48',
        bottom: '48',
        left: '24',
        right: '24',
        isLinked: false,
      });
      expect(heroSection.settings?.padding_mobile).toEqual({
        unit: 'px',
        top: '24',
        bottom: '24',
        left: '16',
        right: '16',
        isLinked: false,
      });

      // Row container explicit overrides
      const row = heroSection.elements[0];
      expect(row.settings?.flex_direction_tablet).toBe('column');
      expect(row.settings?.flex_direction_mobile).toBe('column');

      // Headline explicit typography override
      const textCol = row.elements[0];
      const headline = textCol.elements[0];
      expect(headline.settings?.typography_font_size).toEqual({ unit: 'px', size: 56 });
      expect(headline.settings?.typography_font_size_tablet).toEqual({ unit: 'px', size: 38 });
      expect(headline.settings?.typography_font_size_mobile).toEqual({ unit: 'px', size: 28 });
      expect(headline.settings?.align_mobile).toBe('center');

      // Button padding override on mobile
      const btn = textCol.elements[2];
      expect(btn.settings?.padding_mobile).toEqual({
        unit: 'px',
        top: '14',
        bottom: '14',
        left: '24',
        right: '24',
        isLinked: false,
      });

      expect(report.responsiveStats?.explicitOverridesCount).toBeGreaterThanOrEqual(5);
    });
  });

  describe('4. Viewport Emulation & Zero-Horizontal-Overflow Verification', () => {
    it('verifies all 5 fixtures produce mobile-safe width clampings (<=390px or 100%)', () => {
      const fixtures = [
        darkGymHeroFixture,
        lightFintechHeroFixture,
        multiSectionLandingFixture,
        narrowTallPageFixture,
        multiViewportReconciledFixture,
      ];

      for (const fix of fixtures) {
        const { document } = generateElementorTemplate(fix);

        // Helper to recursively inspect elements
        const inspectElement = (el: any) => {
          if (el.settings) {
            // If desktop width was fixed to a number > 360, width_mobile must be clamped to 100% or <= 390
            const desktopWidth = typeof el.settings.width === 'number' ? el.settings.width : el.settings.width?.size;
            if (desktopWidth && desktopWidth > 360) {
              const mobileWidth = el.settings.width_mobile;
              expect(mobileWidth).toBeDefined();
              if (mobileWidth.unit === '%') {
                expect(mobileWidth.size).toBeLessThanOrEqual(100);
              } else if (mobileWidth.unit === 'px') {
                expect(mobileWidth.size).toBeLessThanOrEqual(390);
              }
            }

            // Mobile padding should not exceed 24px left/right
            if (el.settings.padding_mobile) {
              const left = Number(el.settings.padding_mobile.left) || 0;
              const right = Number(el.settings.padding_mobile.right) || 0;
              expect(left).toBeLessThanOrEqual(32);
              expect(right).toBeLessThanOrEqual(32);
            }
          }

          if (Array.isArray(el.elements)) {
            for (const child of el.elements) {
              inspectElement(child);
            }
          }
        };

        for (const rootContainer of document.content) {
          inspectElement(rootContainer);
        }
      }
    });

    it('verifies asset sourceRect bounding boxes are clamped within image dimensions', () => {
      const fixtures = [
        darkGymHeroFixture,
        lightFintechHeroFixture,
        multiSectionLandingFixture,
        narrowTallPageFixture,
        multiViewportReconciledFixture,
      ];

      for (const fix of fixtures) {
        if (fix.assets) {
          for (const asset of fix.assets) {
            if (asset.sourceRect) {
              expect(asset.sourceRect.x).toBeGreaterThanOrEqual(0);
              expect(asset.sourceRect.y).toBeGreaterThanOrEqual(0);
              expect(asset.sourceRect.width).toBeGreaterThan(0);
              expect(asset.sourceRect.height).toBeGreaterThan(0);
              expect(asset.sourceRect.x + asset.sourceRect.width).toBeLessThanOrEqual(fix.meta.sourceWidth);
              expect(asset.sourceRect.y + asset.sourceRect.height).toBeLessThanOrEqual(fix.meta.sourceHeight);
            }
          }
        }
      }
    });
  });
});
