/**
 * Visual Fidelity Integration Tests — Design-to-Elementor
 * 
 * Verifies that:
 * 1. Dark themes (near-black #050a04) are preserved across page_settings and root sections.
 * 2. Announcement badges render as pill containers with accent background and high-contrast dark text.
 * 3. Header navigation links convert to inline icon-list widgets instead of standalone buttons.
 * 4. Distinct CTA buttons preserve their styling and contrast.
 * 5. Artwork and hero graphic assets with sourceRect or bounding boxes resolve to real cropped assets.
 * 6. High contrast ratios (text vs background) are preserved.
 * 
 * Uses deterministic mocks and local fixtures only — zero live AI calls.
 */

import { describe, it, expect } from 'vitest';
import { convertDIRToElementor } from '../modules/elementor/generator.js';
import { cropAsset } from '../modules/storage/image-processor.js';
import type { DIRDocument } from '../modules/dir/types.js';
import sharp from 'sharp';

describe('Visual Fidelity Rectification & Layout Fidelity', () => {
  const darkLandingPageDir: DIRDocument = {
    version: '1.0.0',
    meta: {
      sourceImageHash: '4d0fc31a7c35e16e05212adb3cd82922d97f7195195790417453900bd4c7a7af',
      sourceWidth: 1065,
      sourceHeight: 687,
      analysisProvider: 'mock',
      analysisModel: 'mock-model',
      analysisTimestamp: '2026-10-15T00:00:00.000Z',
      confidenceScore: 0.95,
      schemaVersion: '1.0.0',
      promptVersion: 'v1.5.0',
    },
    breakpoints: {
      desktop: { min: 1024 },
      tablet: { min: 768, max: 1023 },
      mobile: { min: 320, max: 767 },
    },
    globals: {
      colors: {
        primary: '#b7f34c',
        background: '#050a04',
        text: '#ffffff',
        muted: '#b0b8af',
        accent: '#b7f34c',
      },
      typography: {
        fontFamilies: ['Inter', 'sans-serif'],
        baseSize: 16,
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
        id: 'asset_hero_graphic',
        type: 'image',
        role: '3D green glass flower artwork',
        confidence: 0.95,
        sourceRect: { x: 200, y: 350, width: 665, height: 320 },
      },
    ],
    pages: [
      {
        id: 'page_home',
        name: 'Home',
        sections: [
          {
            id: 'sec_header',
            role: 'header',
            label: 'Header Navigation',
            confidence: 0.95,
            styles: {
              backgroundColor: 'transparent',
              padding: { top: 20, bottom: 20, left: 32, right: 32 },
            },
            children: [
              {
                id: 'header_nav_container',
                kind: 'container',
                label: 'Nav Links Bar',
                confidence: 0.95,
                direction: 'row',
                gap: 28,
                styles: {
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                },
                children: [
                  { id: 'nav_home', kind: 'link', text: 'Home', url: '#home', confidence: 0.95, styles: { color: '#b0b8af' } },
                  { id: 'nav_features', kind: 'link', text: 'Features', url: '#features', confidence: 0.95, styles: { color: '#b0b8af' } },
                  { id: 'nav_pricing', kind: 'link', text: 'Pricing', url: '#pricing', confidence: 0.95, styles: { color: '#b0b8af' } },
                  { id: 'nav_about', kind: 'link', text: 'About', url: '#about', confidence: 0.95, styles: { color: '#b0b8af' } },
                ],
              },
              {
                id: 'header_cta',
                kind: 'button',
                text: 'Get Started',
                variant: 'primary',
                confidence: 0.95,
                styles: {
                  backgroundColor: '#b7f34c',
                  color: '#060b05',
                  padding: { top: 10, bottom: 10, left: 24, right: 24 },
                  borderRadius: 9999,
                },
              },
            ],
          },
          {
            id: 'sec_hero',
            role: 'hero',
            label: 'Hero Section',
            confidence: 0.98,
            styles: {
              backgroundColor: '#050a04',
              padding: { top: 60, bottom: 80, left: 32, right: 32 },
            },
            children: [
              {
                id: 'hero_announcement_badge',
                kind: 'badge',
                text: 'A trusted modern fintech platform',
                confidence: 0.95,
                styles: {
                  backgroundColor: '#b7f34c',
                  color: '#060b05',
                  fontSize: 14,
                  fontWeight: 600,
                  borderRadius: 9999,
                  padding: { top: 6, bottom: 6, left: 16, right: 16 },
                },
              },
              {
                id: 'hero_headline',
                kind: 'heading',
                level: 1,
                text: 'Simplify your financial\nManagement',
                confidence: 0.98,
                styles: {
                  fontSize: 56,
                  fontWeight: 700,
                  color: '#ffffff',
                  textAlign: 'center',
                },
              },
              {
                id: 'hero_artwork',
                kind: 'image',
                alt: 'Green 3D glass flower artwork',
                assetId: 'asset_hero_graphic',
                confidence: 0.95,
                styles: {
                  width: 600,
                  margin: { top: 32, bottom: 0, left: 0, right: 0 },
                },
              },
            ],
          },
        ],
      },
    ],
  };

  it('preserves near-black page background in page_settings and sections', () => {
    const { document } = convertDIRToElementor(darkLandingPageDir);

    // Root page settings must set background_color to #050a04
    expect(document.page_settings?.background_background).toBe('classic');
    expect(document.page_settings?.background_color).toBe('#050a04');

    // Section 1 (header with transparent background) must inherit pageBg instead of defaulting to white
    const headerSection = document.content.find((el: any) => el.settings._section_role === 'header');
    expect(headerSection).toBeDefined();
    expect(headerSection?.settings.background_color).toBe('#050a04');

    // Section 2 (hero section) must preserve #050a04
    const heroSection = document.content.find((el: any) => el.settings._section_role === 'hero');
    expect(heroSection).toBeDefined();
    expect(heroSection?.settings.background_color).toBe('#050a04');
  });

  it('converts navigation links container into an inline icon-list widget instead of individual buttons', () => {
    const { document } = convertDIRToElementor(darkLandingPageDir);
    const headerSection = document.content.find((el: any) => el.settings._section_role === 'header');
    expect(headerSection).toBeDefined();

    // Look for icon-list widget in header elements
    const iconListWidget = headerSection?.elements.find((el: any) => el.widgetType === 'icon-list');
    expect(iconListWidget).toBeDefined();
    expect(iconListWidget?.settings.view).toBe('inline');
    expect(iconListWidget?.settings.icon_list).toHaveLength(4);
    expect(iconListWidget?.settings.icon_list[0].text).toBe('Home');
    expect(iconListWidget?.settings.icon_list[1].text).toBe('Features');

    // CTA button must remain a distinct button widget
    const ctaButton = headerSection?.elements.find((el: any) => el.widgetType === 'button');
    expect(ctaButton).toBeDefined();
    expect(ctaButton?.settings.text).toBe('Get Started');
    expect(ctaButton?.settings.background_color).toBe('#b7f34c');
    expect(ctaButton?.settings.button_text_color).toBe('#060b05');
  });

  it('renders hero announcement badge as a styled pill container with high-contrast text', () => {
    const { document } = convertDIRToElementor(darkLandingPageDir);
    const heroSection = document.content.find((el: any) => el.settings._section_role === 'hero');
    expect(heroSection).toBeDefined();

    // Badge is converted into a container element with pill border radius and accent background
    const badgeContainer = heroSection?.elements.find(
      (el: any) => el.elType === 'container' && el.settings.border_radius?.unit === 'px'
    );
    expect(badgeContainer).toBeDefined();
    expect(badgeContainer?.settings.background_color).toBe('#b7f34c');
    expect(badgeContainer?.settings.border_radius?.top).toBe('9999');

    // Inner element should be a heading with title matching the badge text and dark high-contrast color
    const badgeHeading = badgeContainer?.elements[0];
    expect(badgeHeading?.widgetType === 'heading').toBe(true);
    expect(badgeHeading?.settings.title).toBe('A trusted modern fintech platform');
    expect(badgeHeading?.settings.title_color).toBe('#060b05');
  });

  it('renders primary hero headline with high contrast and correct typography', () => {
    const { document } = convertDIRToElementor(darkLandingPageDir);
    const heroSection = document.content.find((el: any) => el.settings._section_role === 'hero');
    expect(heroSection).toBeDefined();

    const headlineWidget = heroSection?.elements.find(
      (el: any) => el.widgetType === 'heading' && el.settings.header_size === 'h1'
    );
    expect(headlineWidget).toBeDefined();
    expect(headlineWidget?.settings.title).toContain('Simplify your financial');
    expect(headlineWidget?.settings.title_color).toBe('#ffffff');
    expect(headlineWidget?.settings.typography_font_size?.size).toBe(56);
  });

  it('crops sub-assets faithfully using pixel coordinates from source buffer', async () => {
    // Create a 1000x500 test image with sharp
    const testImage = await sharp({
      create: {
        width: 1000,
        height: 500,
        channels: 4,
        background: { r: 5, g: 10, b: 4, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const cropRect = { x: 200, y: 100, width: 400, height: 250 };
    const croppedBuffer = await cropAsset(testImage, cropRect);

    const meta = await sharp(croppedBuffer).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(250);
    expect(meta.format).toBe('png');
  });

  it('maps resolved asset placeholder url into Elementor image widget settings', () => {
    const dirWithResolvedAsset = JSON.parse(JSON.stringify(darkLandingPageDir));
    dirWithResolvedAsset.assets[0].placeholder = '/storage/projects/p1/assets/asset_hero_graphic.png';

    const { document } = convertDIRToElementor(dirWithResolvedAsset);
    const heroSection = document.content.find((el: any) => el.settings._section_role === 'hero');
    const imageWidget = heroSection?.elements.find((el: any) => el.widgetType === 'image');

    expect(imageWidget).toBeDefined();
    expect(imageWidget?.settings.image.url).toBe('/storage/projects/p1/assets/asset_hero_graphic.png');
    expect(imageWidget?.settings.image.id).toBe('asset_hero_graphic');
  });
});
