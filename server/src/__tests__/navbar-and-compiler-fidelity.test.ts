import { describe, it, expect } from 'vitest';
import { normalizeDIR } from '../modules/dir/normalizer.js';
import { convertDIRToElementor } from '../modules/elementor/generator.js';
import { validateElementor } from '../modules/elementor/validator.js';
import type { DIRDocument } from '../modules/dir/types.js';

describe('Navbar 3-Slot Architecture & Compiler Fidelity Suite', () => {
  it('1. Preserves 48px heading typography and horizontal container layout without loss', () => {
    // Exact reproduction scenario highlighted by boss:
    // AI vision model produces typography.font_size_px, font_weight, color_hex and layout_tree.direction, gap_px
    const rawDIR: any = {
      version: '1.0.0',
      meta: {
        sourceImageHash: 'test-hash-48px',
        sourceWidth: 1200,
        sourceHeight: 800,
        analysisProvider: 'ai',
        analysisModel: 'vision',
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
        colors: { background: '#0a0a0a', text: '#ffffff', primary: '#ff5500' },
        typography: { fontFamilies: ['Inter'], headingFont: 'Inter', bodyFont: 'Inter', baseSize: 16, scale: 1.2 },
        spacing: { unit: 'px', base: 8, sectionGap: 64, containerMaxWidth: 1200 },
      },
      assets: [],
      pages: [
        {
          id: 'page_main',
          name: 'Home',
          sections: [
            {
              id: 'sec_content',
              role: 'content',
              confidence: 0.95,
              styles: {},
              children: [
                {
                  id: 'node_horiz_container',
                  kind: 'container',
                  confidence: 0.95,
                  styles: {},
                  layout_tree: {
                    direction: 'row',
                    justify_content: 'space-between',
                    align_items: 'center',
                    gap_px: 24,
                  },
                  children: [
                    {
                      id: 'node_48px_heading',
                      kind: 'heading',
                      level: 1,
                      text: 'High-Fidelity Headline',
                      confidence: 0.98,
                      styles: {},
                      typography: {
                        font_family_guess: 'Inter',
                        font_size_px: 48,
                        font_weight: 700,
                        color_hex: '#ff5500',
                        line_height_em: 1.2,
                        letter_spacing_px: 1,
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

    // Step A: Normalization
    const normalized = normalizeDIR(rawDIR) as DIRDocument;

    // Verify normalizer mapped typography to styles without losing observations
    const normSec = normalized.pages[0].sections[0];
    const normContainer = normSec.children[0] as any;
    const normHeading = normContainer.children[0] as any;

    expect(normHeading.styles.fontSize).toBe(48);
    expect(normHeading.styles.fontWeight).toBe(700);
    expect(normHeading.styles.color).toBe('#ff5500');
    expect(normContainer.direction).toBe('row');
    expect(normContainer.styles.flexDirection).toBe('row');
    expect(normContainer.gap).toBe(24);
    expect(normContainer.styles.gap).toBe(24);

    // Step B: Compilation to native Elementor JSON
    const { document, report } = convertDIRToElementor(normalized);

    // Verify valid Elementor structure
    const validation = validateElementor(document);
    expect(validation.valid).toBe(true);

    // Verify compiled Elementor AST preserved 48px font size, weight, color, row direction, and gap
    const compiledSection = document.content[0];
    const compiledContainer = compiledSection.elements[0];
    const compiledHeading = compiledContainer.elements[0];

    expect(compiledContainer.settings.flex_direction).toBe('row');
    expect(compiledContainer.settings.flex_gap).toEqual({ unit: 'px', size: 24 });
    expect(compiledContainer.settings.flex_justify_content).toBe('space-between');
    expect(compiledContainer.settings.flex_align_items).toBe('center');

    expect(compiledHeading.widgetType).toBe('heading');
    expect(compiledHeading.settings.typography_font_size).toEqual({ unit: 'px', size: 48 });
    expect(compiledHeading.settings.typography_font_weight).toBe('700');
    expect(compiledHeading.settings.title_color).toBe('#ff5500');
    expect(compiledHeading.settings.typography_typography).toBe('custom');
  });

  it('2. Compiles complete 3-slot Header Navigation Bar with correct layout, widgets, and non-wrapping controls', () => {
    // Canonical 3-slot navbar from Elementor Skill:
    // Slot 1: Logo
    // Slot 2: Navigation Menu links
    // Slot 3: Actions container with buttons
    const rawDIR: any = {
      version: '1.0.0',
      meta: {
        sourceImageHash: 'test-hash-navbar',
        sourceWidth: 1200,
        sourceHeight: 800,
        analysisProvider: 'ai',
        analysisModel: 'vision',
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
        colors: { background: '#0a0a0a', text: '#ffffff', primary: '#b7f34c' },
        typography: { fontFamilies: ['Inter'], headingFont: 'Inter', bodyFont: 'Inter', baseSize: 16, scale: 1.2 },
        spacing: { unit: 'px', base: 8, sectionGap: 64, containerMaxWidth: 1200 },
      },
      assets: [
        {
          id: 'asset_brand_logo',
          type: 'logo',
          role: 'brand logo',
          placeholder: '/storage/projects/p1/assets/logo.png',
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
              confidence: 0.98,
              styles: {
                padding: { top: 16, bottom: 16, left: 32, right: 32 },
              },
              children: [
                // Slot 1: Brand Logo
                {
                  id: 'logo_img',
                  kind: 'image',
                  label: 'logo',
                  assetId: 'asset_brand_logo',
                  confidence: 0.98,
                  styles: { width: 140, height: 36 },
                },
                // Slot 2: Navigation Menu Links
                {
                  id: 'nav_menu_container',
                  kind: 'container',
                  label: 'navigation-menu',
                  confidence: 0.95,
                  gap: 32,
                  styles: {},
                  children: [
                    { id: 'link_features', kind: 'link', text: 'Features', url: '#features', confidence: 0.95, styles: { color: '#a0a0a0', fontSize: 15 } },
                    { id: 'link_pricing', kind: 'link', text: 'Pricing', url: '#pricing', confidence: 0.95, styles: { color: '#a0a0a0', fontSize: 15 } },
                    { id: 'link_about', kind: 'link', text: 'About', url: '#about', confidence: 0.95, styles: { color: '#a0a0a0', fontSize: 15 } },
                  ],
                },
                // Slot 3: Actions Container (Buttons)
                {
                  id: 'header_actions_container',
                  kind: 'container',
                  label: 'header-actions',
                  direction: 'row',
                  gap: 16,
                  confidence: 0.95,
                  styles: {},
                  children: [
                    {
                      id: 'btn_login',
                      kind: 'button',
                      text: 'Log In',
                      variant: 'outline',
                      confidence: 0.95,
                      styles: { color: '#ffffff', backgroundColor: 'transparent' },
                    },
                    {
                      id: 'btn_signup',
                      kind: 'button',
                      text: 'Get Started',
                      variant: 'primary',
                      confidence: 0.95,
                      styles: { color: '#000000', backgroundColor: '#b7f34c' },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const normalized = normalizeDIR(rawDIR) as DIRDocument;
    const { document, report } = convertDIRToElementor(normalized);

    const validation = validateElementor(document);
    expect(validation.valid).toBe(true);

    // 1. Verify Header Section is a horizontal row with space-between
    const headerContainer = document.content[0];
    expect(headerContainer.elType).toBe('container');
    expect(headerContainer.settings.flex_direction).toBe('row');
    expect(headerContainer.settings.flex_justify_content).toBe('space-between');
    expect(headerContainer.settings.flex_align_items).toBe('center');

    // 2. Verify Slot 1: Logo has initial width and left align
    const logoWidget = headerContainer.elements[0];
    expect(logoWidget.widgetType).toBe('image');
    expect(logoWidget.settings.align).toBe('left');
    expect(logoWidget.settings.align_self).toBe('center');
    expect(logoWidget.settings._element_width).toBe('initial');
    expect(logoWidget.settings._flex_shrink).toBe(0);

    // 3. Verify Slot 2: Navigation Menu is compiled to inline icon-list with initial width
    const navWidget = headerContainer.elements[1];
    expect(navWidget.widgetType).toBe('icon-list');
    expect(navWidget.settings.view).toBe('inline');
    expect(navWidget.settings._element_width).toBe('initial');
    expect(navWidget.settings.align_self).toBe('center');
    expect(navWidget.settings._flex_shrink).toBe(0);
    expect(navWidget.settings._flex_grow).toBe(0);
    expect(navWidget.settings.icon_list.length).toBe(3);

    // 4. Verify Slot 3: Actions Container maintains row nowrap with initial width child buttons
    const actionsContainer = headerContainer.elements[2];
    expect(actionsContainer.elType).toBe('container');
    expect(actionsContainer.settings.flex_direction).toBe('row');
    expect(actionsContainer.settings.flex_wrap).toBe('nowrap');
    expect(actionsContainer.settings.flex_justify_content).toBe('flex-end');
    expect(actionsContainer.settings.flex_align_items).toBe('center');
    expect(actionsContainer.settings._element_width).toBe('initial');

    const btn1 = actionsContainer.elements[0];
    const btn2 = actionsContainer.elements[1];
    expect(btn1.settings._element_width).toBe('initial');
    expect(btn2.settings._element_width).toBe('initial');
    expect(btn1.settings._flex_shrink).toBe(0);
    expect(btn2.settings._flex_shrink).toBe(0);
  });
});
