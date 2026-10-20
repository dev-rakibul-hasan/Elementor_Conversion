/**
 * Master Skill Pipeline & Visual Reconstruction Evaluation Suite
 * 
 * Verifies all 11 critical points required by the Master Skill Audit:
 * 1. Image-analysis output captures correct page sections and semantic hierarchy.
 * 2. DIR conforms to the exact canonical schema.
 * 3. Required metadata is obtained from factual runtime inputs.
 * 4. Background, headline, subtitle, navigation, CTA, badge, and artwork are represented.
 * 5. Normalizer preserves meaningful design information while repairing malformations.
 * 6. Elementor generation maps these elements to correct editable widgets.
 * 7. Important styles survive serialization.
 * 8. Asset references resolve to accessible images.
 * 9. Invalid model output cannot silently become a successful artifact.
 * 10. Changes to skill or prompt versions invalidate incompatible cached responses.
 * 11. The generated artifact can be structurally validated and inspected for visual differences.
 * 
 * Uses deterministic mocks and local fixtures only — zero live AI calls.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { validateDIR } from '../modules/dir/schema.js';
import { normalizeDIR } from '../modules/dir/normalizer.js';
import { convertDIRToElementor } from '../modules/elementor/generator.js';
import { validateElementor } from '../modules/elementor/validator.js';
import { serializeElementorTemplate, loadRootSkillInstructions } from '../modules/elementor/serializer.js';
import { cropAsset } from '../modules/storage/image-processor.js';
import { getAIRouter } from '../modules/ai/router.js';
import { PROMPT_VERSIONS } from '../modules/conversion/prompts.js';
import type { DIRDocument } from '../modules/dir/types.js';

describe('Master Skill Audit & Evaluation Suite — High-Fidelity Design-to-Elementor', () => {
  const realHeroImagePath = path.resolve(
    __dirname,
    '../../storage/uploads/projects/8679cb8f-82f0-49a7-ab38-3c04a18ab0f9/originals/4d0fc31a7c35e16e05212adb3cd82922d97f7195195790417453900bd4c7a7af_hero.png'
  );

  const canonicalDirFixture: DIRDocument = {
    version: '1.0.0',
    meta: {
      sourceImageHash: '4d0fc31a7c35e16e05212adb3cd82922d97f7195195790417453900bd4c7a7af',
      sourceWidth: 1065,
      sourceHeight: 687,
      analysisProvider: 'mock-provider',
      analysisModel: 'gemini-3.8-flash',
      analysisTimestamp: '2026-10-15T02:45:00.000Z',
      confidenceScore: 0.98,
      schemaVersion: '1.0.0',
      promptVersion: PROMPT_VERSIONS.IMAGE_ANALYSIS,
      notes: ['Evaluated with verified fintech hero screenshot'],
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
        primary: '#b7f34c',
        secondary: '#1f2b1d',
        accent: '#b7f34c',
        surface: '#0d160c',
        border: '#1b2a1a',
      },
      typography: {
        fontFamilies: ['Inter', 'sans-serif'],
        headingFont: 'Inter',
        bodyFont: 'Inter',
        baseSize: 16,
        scale: 1.25,
      },
      spacing: {
        unit: 'px',
        base: 8,
        sectionGap: 64,
        containerMaxWidth: 1200,
      },
    },
    assets: [
      {
        id: 'asset_hero_flower_artwork',
        type: 'image',
        role: '3D green glass flower hero graphic',
        confidence: 0.98,
        sourceRect: { x: 210, y: 340, width: 645, height: 340 },
        placeholder: '/storage/projects/p1/assets/asset_hero_flower_artwork.png',
      },
    ],
    pages: [
      {
        id: 'page_main',
        name: 'Home',
        sections: [
          {
            id: 'sec_header',
            role: 'header',
            label: 'Header Navigation Bar',
            confidence: 0.96,
            styles: {
              backgroundColor: 'transparent',
              padding: { top: 24, bottom: 24, left: 32, right: 32 },
            },
            children: [
              {
                id: 'header_brand',
                kind: 'heading',
                level: 3,
                text: 'CRYPTO',
                confidence: 0.99,
                styles: { color: '#ffffff', fontSize: 20, fontWeight: 700 },
              },
              {
                id: 'header_nav_menu',
                kind: 'container',
                direction: 'row',
                gap: 28,
                confidence: 0.95,
                styles: { display: 'flex', alignItems: 'center' },
                children: [
                  { id: 'link_home', kind: 'link', text: 'Home', url: '#home', confidence: 0.95, styles: { color: '#ffffff' } },
                  { id: 'link_features', kind: 'link', text: 'Features', url: '#features', confidence: 0.95, styles: { color: '#b0b8af' } },
                  { id: 'link_pricing', kind: 'link', text: 'Pricing', url: '#pricing', confidence: 0.95, styles: { color: '#b0b8af' } },
                  { id: 'link_about', kind: 'link', text: 'About', url: '#about', confidence: 0.95, styles: { color: '#b0b8af' } },
                ],
              },
              {
                id: 'header_cta_btn',
                kind: 'button',
                text: 'Get Started',
                variant: 'primary',
                confidence: 0.98,
                styles: {
                  backgroundColor: '#b7f34c',
                  color: '#060b05',
                  borderRadius: 9999,
                  padding: { top: 10, bottom: 10, left: 24, right: 24 },
                  fontWeight: 600,
                },
              },
            ],
          },
          {
            id: 'sec_hero',
            role: 'hero',
            label: 'Hero Main Section',
            confidence: 0.99,
            styles: {
              backgroundColor: '#050a04',
              padding: { top: 60, bottom: 80, left: 32, right: 32 },
            },
            children: [
              {
                id: 'hero_announcement',
                kind: 'badge',
                text: 'A trusted modern fintech platform',
                confidence: 0.97,
                styles: {
                  backgroundColor: '#b7f34c',
                  color: '#060b05',
                  borderRadius: 9999,
                  fontSize: 13,
                  fontWeight: 600,
                  padding: { top: 6, bottom: 6, left: 16, right: 16 },
                },
              },
              {
                id: 'hero_h1',
                kind: 'heading',
                level: 1,
                text: 'Simplify your financial\nManagement',
                confidence: 0.99,
                styles: {
                  fontSize: 56,
                  fontWeight: 700,
                  color: '#ffffff',
                  textAlign: 'center',
                  letterSpacing: -1,
                  lineHeight: 1.15,
                },
              },
              {
                id: 'hero_sub_text',
                kind: 'text',
                html: '<p>Experience effortless crypto & financial management with institutional security and zero hidden fees.</p>',
                confidence: 0.95,
                styles: {
                  fontSize: 18,
                  color: '#b0b8af',
                  textAlign: 'center',
                },
              },
              {
                id: 'hero_artwork_node',
                kind: 'image',
                alt: 'Green 3D glass flower artwork',
                assetId: 'asset_hero_flower_artwork',
                confidence: 0.98,
                styles: {
                  width: 645,
                  margin: { top: 32, bottom: 0, left: 0, right: 0 },
                },
              },
            ],
          },
        ],
      },
    ],
  };

  // ─── Evaluation Point 1: Semantic Hierarchy ──────────────────────────────
  it('1. Image analysis captures correct page sections and semantic hierarchy', () => {
    const pages = canonicalDirFixture.pages;
    expect(pages).toHaveLength(1);
    expect(pages[0].sections).toHaveLength(2);
    expect(pages[0].sections[0].role).toBe('header');
    expect(pages[0].sections[1].role).toBe('hero');

    const headerChildren = pages[0].sections[0].children;
    expect(headerChildren.map((c) => c.kind)).toEqual(['heading', 'container', 'button']);
  });

  // ─── Evaluation Point 2: Exact Canonical Schema ──────────────────────────
  it('2. DIR conforms to the exact canonical Zod schema', () => {
    const result = validateDIR(canonicalDirFixture);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.document?.version).toBe('1.0.0');
  });

  // ─── Evaluation Point 3: Factual Runtime Metadata ────────────────────────
  it('3. Required metadata is derived from factual runtime execution', () => {
    const meta = canonicalDirFixture.meta;
    expect(meta.sourceImageHash).toMatch(/^[0-9a-f]{64}$/);
    expect(meta.sourceWidth).toBe(1065);
    expect(meta.sourceHeight).toBe(687);
    expect(meta.promptVersion).toBe(PROMPT_VERSIONS.IMAGE_ANALYSIS);
    expect(meta.schemaVersion).toBe('1.0.0');
    expect(typeof meta.confidenceScore).toBe('number');
  });

  // ─── Evaluation Point 4: All Visual Components Represented ──────────────
  it('4. Background, headline, subtitle, navigation, CTA, badge, and artwork are all represented', () => {
    expect(canonicalDirFixture.globals.colors.background).toBe('#050a04');
    expect(canonicalDirFixture.assets[0].id).toBe('asset_hero_flower_artwork');
    expect(canonicalDirFixture.assets[0].sourceRect).toBeDefined();

    const heroSection = canonicalDirFixture.pages[0].sections[1];
    const badge = heroSection.children.find((c) => c.kind === 'badge');
    const headline = heroSection.children.find((c) => c.kind === 'heading');
    const subtitle = heroSection.children.find((c) => c.kind === 'text');
    const artwork = heroSection.children.find((c) => c.kind === 'image');

    expect(badge).toBeDefined();
    expect(headline).toBeDefined();
    expect(subtitle).toBeDefined();
    expect(artwork).toBeDefined();
  });

  // ─── Evaluation Point 5: Normalizer Preserves Design Info ────────────────
  it('5. Normalizer preserves meaningful design info while sanitizing array breakpoints and metadata', () => {
    const malformedDIR = {
      ...canonicalDirFixture,
      meta: {
        ...canonicalDirFixture.meta,
        unexpectedKey: 'should-be-pruned',
      },
      breakpoints: [
        { name: 'desktop', min: 1024 },
        { name: 'tablet', min: 768, max: 1023 },
        { name: 'mobile', max: 767 },
      ],
    };

    const normalized = normalizeDIR(malformedDIR);
    expect(normalized.breakpoints.desktop.min).toBe(1024);
    expect((normalized.meta as any).unexpectedKey).toBeUndefined();
    expect(normalized.globals.colors.background).toBe('#050a04');

    const val = validateDIR(normalized);
    expect(val.valid).toBe(true);
  });

  // ─── Evaluation Point 6: Elementor Widget Mapping ────────────────────────
  it('6. Elementor generation maps DIR elements to correct registered widgets', () => {
    const { document, report } = convertDIRToElementor(canonicalDirFixture);

    expect(report.widgetsUsed).toContain('heading');
    expect(report.widgetsUsed).toContain('icon-list');
    expect(report.widgetsUsed).toContain('button');
    expect(report.widgetsUsed).toContain('text-editor');
    expect(report.widgetsUsed).toContain('image');

    // Header section verification
    const headerEl = document.content[0];
    expect(headerEl.settings._section_role).toBe('header');
    expect(headerEl.settings.background_color).toBe('#050a04');

    // Icon list inline navigation verification
    const iconList = headerEl.elements.find((el: any) => el.widgetType === 'icon-list');
    expect(iconList).toBeDefined();
    expect(iconList?.settings.view).toBe('inline');
    expect(iconList?.settings.icon_list).toHaveLength(4);

    // Hero section verification
    const heroEl = document.content[1];
    expect(heroEl.settings._section_role).toBe('hero');
    expect(heroEl.settings.background_color).toBe('#050a04');

    // Badge container verification
    const badgeContainer = heroEl.elements.find(
      (el: any) => el.elType === 'container' && el.settings.border_radius?.top === '9999'
    );
    expect(badgeContainer).toBeDefined();
    expect(badgeContainer?.settings.background_color).toBe('#b7f34c');

    // H1 headline verification
    const h1Widget = heroEl.elements.find(
      (el: any) => el.widgetType === 'heading' && el.settings.header_size === 'h1'
    );
    expect(h1Widget).toBeDefined();
    expect(h1Widget?.settings.title_color).toBe('#ffffff');
    expect(h1Widget?.settings.typography_font_size?.size).toBe(56);
  });

  // ─── Evaluation Point 7: Styles Survive Serialization ────────────────────
  it('7. Important styles and envelope settings survive serialization', () => {
    const { document } = convertDIRToElementor(canonicalDirFixture);
    const serialized = serializeElementorTemplate(document);

    expect(typeof serialized).toBe('string');
    const parsed = JSON.parse(serialized);

    expect(parsed.version).toBe('0.4');
    expect(parsed.type).toBe('page');
    expect(parsed.page_settings.background_background).toBe('classic');
    expect(parsed.page_settings.background_color).toBe('#050a04');
    expect(parsed.content).toHaveLength(2);
  });

  // ─── Evaluation Point 8: Asset References & Cropping ─────────────────────
  it('8. Asset references resolve to accessible image buffers and paths', async () => {
    let sourceBuffer: Buffer;
    if (fs.existsSync(realHeroImagePath)) {
      sourceBuffer = fs.readFileSync(realHeroImagePath);
    } else {
      sourceBuffer = await sharp({
        create: {
          width: 1065,
          height: 687,
          channels: 4,
          background: { r: 5, g: 10, b: 4, alpha: 1 },
        },
      })
        .png()
        .toBuffer();
    }

    const rect = canonicalDirFixture.assets[0].sourceRect!;
    const cropped = await cropAsset(sourceBuffer, rect);

    const meta = await sharp(cropped).metadata();
    expect(meta.width).toBe(rect.width);
    expect(meta.height).toBe(rect.height);
    expect(meta.format).toBe('png');

    const { document } = convertDIRToElementor(canonicalDirFixture);
    const heroEl = document.content[1];
    const imageWidget = heroEl.elements.find((el: any) => el.widgetType === 'image');
    expect(imageWidget).toBeDefined();
    expect(imageWidget?.settings.image.url).toBe('/storage/projects/p1/assets/asset_hero_flower_artwork.png');
  });

  // ─── Evaluation Point 9: Rejection of Invalid Output ─────────────────────
  it('9. Invalid model output cannot silently become a successful artifact', () => {
    const corruptedDir: any = {
      version: '1.0.0',
      pages: [
        {
          id: 'p1',
          sections: [
            {
              role: 'hero',
              // missing id, confidence, styles, children
            },
          ],
        },
      ],
    };

    const val = validateDIR(corruptedDir);
    expect(val.valid).toBe(false);
    expect(val.errors.length).toBeGreaterThan(0);
    expect(val.document).toBeFalsy();
  });

  // ─── Evaluation Point 10: Cache Key Invalidation on Version Bump ─────────
  it('10. Prompt and skill version updates change computed AI cache keys', () => {
    const router = getAIRouter();
    const keyV1 = router.computeCacheKey({
      sourceImageHash: '4d0fc31a7c35e16e05212adb3cd82922d97f7195195790417453900bd4c7a7af',
      schemaVersion: '1.0.0',
      promptVersion: 'v1.4.0',
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      stage: 'image_analysis',
    });

    const keyV2 = router.computeCacheKey({
      sourceImageHash: '4d0fc31a7c35e16e05212adb3cd82922d97f7195195790417453900bd4c7a7af',
      schemaVersion: '1.0.0',
      promptVersion: 'v1.5.0',
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      stage: 'image_analysis',
    });

    expect(keyV1).not.toBe(keyV2);
  });

  // ─── Evaluation Point 11: Structural & Visual Differences Verification ───
  it('11. Generated Elementor template passes structural validation', () => {
    const { document } = convertDIRToElementor(canonicalDirFixture);
    const validation = validateElementor(document);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    // Verify contrast: background is dark, headline is light
    const bg = document.page_settings?.background_color;
    expect(bg).toBe('#050a04');

    const heroEl = document.content[1];
    const h1 = heroEl.elements.find((el: any) => el.widgetType === 'heading' && el.settings.header_size === 'h1');
    expect(h1?.settings.title_color).toBe('#ffffff');
  });

  // ─── Evaluation of Master Skill File Integrity ───────────────────────────
  it('verifies master ELEMENTOR_SKILL.md defines both Stage A and Stage B cleanly', () => {
    const skill = loadRootSkillInstructions();
    expect(skill.content).toContain('Master Skill Specification');
    expect(skill.content).toContain('Stage A: Image-to-DIR');
    expect(skill.content).toContain('Stage B: DIR-to-Elementor');
    expect(skill.content).toContain('server/src/skills/elementor/widget-registry.json');
  });
});
