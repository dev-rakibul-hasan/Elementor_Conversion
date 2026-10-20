import { describe, it, expect } from 'vitest';
import {
  validateDIR,
  normalizeDIRDocument,
  validateAndNormalizeDIR,
  type DIRDocument,
} from '../modules/dir/index.js';

describe('DIR Schema & Validation', () => {
  const createValidDIR = (): DIRDocument => ({
    version: '1.0.0',
    meta: {
      sourceImageHash: 'sha256_mock_abc123',
      sourceWidth: 1440,
      sourceHeight: 900,
      analysisProvider: 'gemini',
      analysisModel: 'gemini-3.8-flash',
      analysisTimestamp: new Date().toISOString(),
      confidenceScore: 0.95,
      schemaVersion: '1.0.0',
      promptVersion: '2.0.0',
      elementorVersion: '4.3.5',
      notes: ['Dark mode fintech landing page'],
    },
    breakpoints: {
      desktop: { min: 1025 },
      tablet: { min: 768, max: 1024 },
      mobile: { min: 0, max: 767 },
    },
    globals: {
      colors: {
        background: '#050a04',
        text: '#ffffff',
        primary: '#b7f34c',
        secondary: '#a1a1aa',
      },
      typography: {
        fontFamilies: ['Inter', 'sans-serif'],
        headingFont: 'Inter',
        bodyFont: 'Inter',
        baseSize: 16,
      },
      spacing: {
        unit: 'px',
        base: 8,
        containerMaxWidth: 1200,
      },
    },
    assets: [
      {
        id: 'asset_hero_artwork',
        type: 'image',
        role: 'hero graphic artwork',
        sourceRect: { x: 700, y: 150, width: 600, height: 500 },
        confidence: 0.98,
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
            label: 'Header Navbar',
            confidence: 0.95,
            styles: {
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: { top: 16, right: 24, bottom: 16, left: 24 },
            },
            children: [
              {
                id: 'node_logo',
                kind: 'heading',
                text: 'ApexFintech',
                level: 3,
                confidence: 0.99,
                styles: { color: '#ffffff', fontSize: 20 },
              },
              {
                id: 'node_cta',
                kind: 'button',
                text: 'Get Started',
                variant: 'primary',
                confidence: 0.98,
                styles: { backgroundColor: '#b7f34c', color: '#050a04' },
              },
            ],
          },
          {
            id: 'sec_hero',
            role: 'hero',
            label: 'Hero Section',
            confidence: 0.92,
            styles: {
              backgroundColor: '#050a04',
              padding: { top: 80, right: 24, bottom: 80, left: 24 },
            },
            children: [
              {
                id: 'node_hero_badge',
                kind: 'badge',
                text: 'Trusted Modern Fintech Platform',
                badgeStyle: 'pill',
                confidence: 0.94,
                styles: { backgroundColor: '#b7f34c', color: '#050a04', borderRadius: 9999 },
              },
              {
                id: 'node_hero_title',
                kind: 'heading',
                text: 'Simplify your financial\nManagement',
                level: 1,
                confidence: 0.99,
                styles: { color: '#ffffff', fontSize: 56 },
              },
              {
                id: 'node_hero_image',
                kind: 'image',
                assetId: 'asset_hero_artwork',
                confidence: 0.97,
                styles: { width: 600, height: 500 },
              },
            ],
          },
        ],
      },
    ],
    canvas_bounds: {
      inner_bg_type: 'solid',
      primary_hex: '#050a04',
    },
  });

  it('validates a fully compliant canonical DIR document', () => {
    const validDIR = createValidDIR();
    const result = validateDIR(validDIR);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.document?.version).toBe('1.0.0');
    expect(result.document?.pages[0]?.sections).toHaveLength(2);
  });

  it('coerces string-encoded dimensions and padding into strict numbers', () => {
    const raw = createValidDIR() as any;
    raw.pages[0].sections[0].styles.padding = {
      top: '24px',
      right: '32px',
      bottom: '24px',
      left: '32px',
    };
    raw.pages[0].sections[0].children[0].styles.fontSize = '48px';

    const result = validateDIR(raw);
    expect(result.valid).toBe(true);
    expect(result.document?.pages[0]?.sections[0]?.styles.padding?.top).toBe(24);
    expect(result.document?.pages[0]?.sections[0]?.children[0]?.styles.fontSize).toBe(48);
  });

  it('detects dangling asset references as semantic warnings', () => {
    const dirWithDanglingAsset = createValidDIR() as any;
    dirWithDanglingAsset.pages[0].sections[1].children.push({
      id: 'node_missing_asset',
      kind: 'image',
      assetId: 'nonexistent_asset_id',
      confidence: 0.9,
      styles: {},
    });

    const result = validateDIR(dirWithDanglingAsset);
    expect(result.valid).toBe(true); // Warnings do not fail validation
    const warning = result.issues.find((i) => i.code === 'DANGLING_ASSET_REFERENCE');
    expect(warning).toBeDefined();
    expect(warning?.message).toContain('nonexistent_asset_id');
  });

  it('detects asset bounding box overflow beyond image dimensions', () => {
    const dirWithOverflow = createValidDIR();
    dirWithOverflow.assets[0]!.sourceRect = {
      x: 1200,
      y: 800,
      width: 500, // 1200 + 500 = 1700 > 1440
      height: 400,
    };

    const result = validateDIR(dirWithOverflow);
    expect(result.valid).toBe(true);
    const overflowWarning = result.issues.find((i) => i.code === 'BOUNDS_OVERFLOW');
    expect(overflowWarning).toBeDefined();
  });

  it('rejects documents with invalid schema version or missing required root properties', () => {
    const invalidDoc = {
      version: '2.0.0-unsupported',
      meta: {},
    };

    const result = validateDIR(invalidDoc);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('normalizes legacy flattened AI format (bare sections) to canonical v1.0.0 hierarchy', () => {
    const legacyRaw = {
      sections: [
        {
          id: 'sec_1',
          role: 'hero',
          children: [
            {
              id: 'n_1',
              kind: 'heading',
              text: 'Legacy Title',
              styles: { fontSize: '32px' },
            },
          ],
        },
      ],
      globals: {
        colors: {
          background: '#ffffff',
          text: '#000000',
        },
      },
    };

    const normalized = normalizeDIRDocument(legacyRaw);
    expect(normalized.version).toBe('1.0.0');
    expect(normalized.pages).toHaveLength(1);
    expect(normalized.pages[0]?.sections).toHaveLength(1);
    expect(normalized.pages[0]?.sections[0]?.role).toBe('hero');
    expect(normalized.pages[0]?.sections[0]?.children[0]?.styles.fontSize).toBe(32);

    const validation = validateDIR(normalized);
    expect(validation.valid).toBe(true);
  });

  it('validateAndNormalizeDIR auto-recovers imperfect AI payload', () => {
    const unversionedInput = {
      meta: {
        sourceImageHash: 'sha256_test',
        sourceWidth: '1920px',
        sourceHeight: '1080px',
      },
      sections: [
        {
          id: 's1',
          role: 'header',
          styles: { gap: '16px' },
        },
      ],
    };

    const result = validateAndNormalizeDIR(unversionedInput);
    expect(result.valid).toBe(true);
    expect(result.document?.version).toBe('1.0.0');
    expect(result.document?.meta.sourceWidth).toBe(1920);
    expect(result.document?.meta.sourceHeight).toBe(1080);
  });
});

