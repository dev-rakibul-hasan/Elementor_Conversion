/**
 * DIR Compatibility & Version Migration Adapter
 * Architecture Lead: Mubasshir
 * 
 * Provides backward compatibility transformations for older DIR schemas (v0.x)
 * and auto-normalizes imperfect AI responses into canonical DIR v1.0.0.
 */

import type {
  DIRDocument,
  DIRMeta,
  DIRPage,
  DIRSection,
  DIRNode,
  DIRGlobals,
  DIRBreakpoints,
  DIRStyles,
  DIRSpacing,
  DIRCorners,
} from './types.js';
import { validateDIR, type DIRValidationResult } from './schema.js';

function cleanNum(val: any): number | undefined {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const stripped = val.trim().replace(/px$/i, '');
    const parsed = Number(stripped);
    if (!isNaN(parsed) && stripped !== '') return parsed;
  }
  return undefined;
}

/**
 * Normalizes any raw or legacy object into a fully compliant canonical DIRDocument (v1.0.0).
 */
export function normalizeDIRDocument(raw: any): DIRDocument {
  if (!raw || typeof raw !== 'object') {
    return createEmptyCanonicalDIR();
  }

  // 1. Version Normalization
  const version = '1.0.0';

  // 2. Meta Normalization
  const rawMeta = raw.meta || {};
  const meta: DIRMeta = {
    sourceImageHash: typeof rawMeta.sourceImageHash === 'string' ? rawMeta.sourceImageHash : 'sha256_mock_source',
    sourceWidth: cleanNum(rawMeta.sourceWidth) && cleanNum(rawMeta.sourceWidth)! > 0 ? cleanNum(rawMeta.sourceWidth)! : 1440,
    sourceHeight: cleanNum(rawMeta.sourceHeight) && cleanNum(rawMeta.sourceHeight)! > 0 ? cleanNum(rawMeta.sourceHeight)! : 900,
    analysisProvider: typeof rawMeta.analysisProvider === 'string' ? rawMeta.analysisProvider : 'unknown',
    analysisModel: typeof rawMeta.analysisModel === 'string' ? rawMeta.analysisModel : 'unknown',
    analysisTimestamp: typeof rawMeta.analysisTimestamp === 'string' ? rawMeta.analysisTimestamp : new Date().toISOString(),
    confidenceScore: typeof rawMeta.confidenceScore === 'number' ? Math.max(0, Math.min(1, rawMeta.confidenceScore)) : 0.9,
    schemaVersion: '1.0.0',
    promptVersion: typeof rawMeta.promptVersion === 'string' ? rawMeta.promptVersion : '2.0.0',
    elementorVersion: rawMeta.elementorVersion || '4.3.5',
    notes: Array.isArray(rawMeta.notes) ? rawMeta.notes.filter((n: any) => typeof n === 'string') : [],
  };

  // 3. Breakpoints Normalization
  const rawBp = raw.breakpoints || {};
  const breakpoints: DIRBreakpoints = {
    desktop: {
      min: typeof rawBp.desktop?.min === 'number' ? rawBp.desktop.min : 1025,
      max: typeof rawBp.desktop?.max === 'number' ? rawBp.desktop.max : undefined,
    },
    tablet: {
      min: typeof rawBp.tablet?.min === 'number' ? rawBp.tablet.min : 768,
      max: typeof rawBp.tablet?.max === 'number' ? rawBp.tablet.max : 1024,
    },
    mobile: {
      min: typeof rawBp.mobile?.min === 'number' ? rawBp.mobile.min : 0,
      max: typeof rawBp.mobile?.max === 'number' ? rawBp.mobile.max : 767,
    },
  };

  // 4. Globals Normalization
  const rawGlobals = raw.globals || {};
  const rawColors = rawGlobals.colors || {};
  const globals: DIRGlobals = {
    colors: {
      background: typeof rawColors.background === 'string' && rawColors.background.trim() ? rawColors.background : '#ffffff',
      text: typeof rawColors.text === 'string' && rawColors.text.trim() ? rawColors.text : '#111827',
      primary: typeof rawColors.primary === 'string' ? rawColors.primary : '#3b82f6',
      secondary: typeof rawColors.secondary === 'string' ? rawColors.secondary : '#6b7280',
      accent: typeof rawColors.accent === 'string' ? rawColors.accent : '#10b981',
      surface: typeof rawColors.surface === 'string' ? rawColors.surface : '#f9fafb',
      border: typeof rawColors.border === 'string' ? rawColors.border : '#e5e7eb',
    },
    typography: {
      fontFamilies: Array.isArray(rawGlobals.typography?.fontFamilies) && rawGlobals.typography.fontFamilies.length > 0
        ? rawGlobals.typography.fontFamilies
        : ['Inter', 'sans-serif'],
      headingFont: rawGlobals.typography?.headingFont || 'Inter',
      bodyFont: rawGlobals.typography?.bodyFont || 'Inter',
      baseSize: typeof rawGlobals.typography?.baseSize === 'number' ? rawGlobals.typography.baseSize : 16,
      scale: typeof rawGlobals.typography?.scale === 'number' ? rawGlobals.typography.scale : 1.25,
    },
    spacing: {
      unit: rawGlobals.spacing?.unit === 'rem' ? 'rem' : 'px',
      base: typeof rawGlobals.spacing?.base === 'number' ? rawGlobals.spacing.base : 8,
      sectionGap: typeof rawGlobals.spacing?.sectionGap === 'number' ? rawGlobals.spacing.sectionGap : 48,
      containerMaxWidth: typeof rawGlobals.spacing?.containerMaxWidth === 'number' ? rawGlobals.spacing.containerMaxWidth : 1200,
    },
  };

  // 5. Assets Normalization
  const rawAssets = Array.isArray(raw.assets) ? raw.assets : [];
  const assets = rawAssets.map((a: any, idx: number) => {
    return {
      id: typeof a.id === 'string' ? a.id : `asset_${idx + 1}`,
      type: ['image', 'icon', 'logo', 'background', 'video', 'placeholder'].includes(a.type) ? a.type : 'image',
      role: typeof a.role === 'string' ? a.role : 'graphic',
      sourceRect: a.sourceRect && typeof a.sourceRect.x === 'number' && typeof a.sourceRect.y === 'number'
        ? {
            x: Math.max(0, a.sourceRect.x),
            y: Math.max(0, a.sourceRect.y),
            width: Math.max(1, a.sourceRect.width || 100),
            height: Math.max(1, a.sourceRect.height || 100),
          }
        : undefined,
      description: a.description,
      placeholder: a.placeholder,
      url: a.url,
      path: a.path,
      confidence: typeof a.confidence === 'number' ? Math.max(0, Math.min(1, a.confidence)) : 0.9,
      width: typeof a.width === 'number' ? a.width : undefined,
      height: typeof a.height === 'number' ? a.height : undefined,
      composite_graphic_asset: !!a.composite_graphic_asset,
      metadata: typeof a.metadata === 'object' ? a.metadata : undefined,
    };
  });

  // 6. Pages & Hierarchy Normalization
  let pages: DIRPage[] = [];

  // Defense against raw AI format emitting top-level sections array instead of pages
  if (Array.isArray(raw.pages) && raw.pages.length > 0) {
    pages = raw.pages.map((p: any, pIdx: number) => ({
      id: typeof p.id === 'string' ? p.id : `page_${pIdx + 1}`,
      name: typeof p.name === 'string' ? p.name : `Page ${pIdx + 1}`,
      sections: normalizeSectionList(p.sections || []),
    }));
  } else if (Array.isArray(raw.sections)) {
    // Legacy / flattened format migration
    pages = [
      {
        id: 'page_main',
        name: 'Main Page',
        sections: normalizeSectionList(raw.sections),
      },
    ];
  } else {
    pages = [
      {
        id: 'page_main',
        name: 'Main Page',
        sections: [],
      },
    ];
  }

  return {
    version,
    meta,
    breakpoints,
    globals,
    assets,
    pages,
    canvas_bounds: raw.canvas_bounds,
  };
}

function normalizeSectionList(rawSections: any[]): DIRSection[] {
  if (!Array.isArray(rawSections)) return [];

  return rawSections.map((s: any, idx: number) => {
    const validRoles = [
      'header', 'navigation', 'hero', 'feature', 'content', 'cta',
      'testimonial', 'pricing', 'stats', 'gallery', 'team', 'faq',
      'contact', 'form', 'footer', 'banner', 'logo-bar', 'generic'
    ];

    const role = validRoles.includes(s.role) ? s.role : 'generic';

    return {
      id: typeof s.id === 'string' ? s.id : `sec_${idx + 1}`,
      role,
      label: s.label || s.role,
      confidence: typeof s.confidence === 'number' ? Math.max(0, Math.min(1, s.confidence)) : 0.9,
      styles: normalizeStyles(s.styles),
      children: normalizeNodeList(s.children || []),
      responsiveNotes: Array.isArray(s.responsiveNotes) ? s.responsiveNotes : undefined,
      responsiveOverrides: s.responsiveOverrides,
      canvas_bounds: s.canvas_bounds,
    };
  });
}

function normalizeNodeList(rawNodes: any[]): DIRNode[] {
  if (!Array.isArray(rawNodes)) return [];

  return rawNodes.map((n: any, idx: number): DIRNode => {
    const baseId = typeof n.id === 'string' ? n.id : `node_${idx + 1}`;
    const kind = typeof n.kind === 'string' ? n.kind : 'container';
    const confidence = typeof n.confidence === 'number' ? Math.max(0, Math.min(1, n.confidence)) : 0.9;
    const styles = normalizeStyles(n.styles);

    const base: any = {
      ...n,
      id: baseId,
      kind,
      confidence,
      styles,
    };

    if (Array.isArray(n.children)) {
      base.children = normalizeNodeList(n.children);
    }

    return base as DIRNode;
  });
}

function normalizeStyles(rawStyles: any): DIRStyles {
  if (!rawStyles || typeof rawStyles !== 'object') return {};

  const cleanNum = (val: any): number | undefined => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const stripped = val.trim().replace(/px$/i, '');
      const parsed = Number(stripped);
      if (!isNaN(parsed) && stripped !== '') return parsed;
    }
    return undefined;
  };

  const cleanSpacing = (sp: any): DIRSpacing | undefined => {
    if (!sp || typeof sp !== 'object') return undefined;
    return {
      top: cleanNum(sp.top),
      right: cleanNum(sp.right),
      bottom: cleanNum(sp.bottom),
      left: cleanNum(sp.left),
    };
  };

  const cleanCorners = (cn: any): DIRCorners | number | undefined => {
    if (typeof cn === 'number') return cn;
    if (typeof cn === 'string') {
      const num = cleanNum(cn);
      if (num !== undefined) return num;
    }
    if (cn && typeof cn === 'object') {
      return {
        topLeft: cleanNum(cn.topLeft),
        topRight: cleanNum(cn.topRight),
        bottomRight: cleanNum(cn.bottomRight),
        bottomLeft: cleanNum(cn.bottomLeft ?? cn.leftBottom),
      };
    }
    return undefined;
  };

  return {
    ...rawStyles,
    width: cleanNum(rawStyles.width) ?? rawStyles.width,
    height: cleanNum(rawStyles.height) ?? rawStyles.height,
    gap: cleanNum(rawStyles.gap),
    padding: cleanSpacing(rawStyles.padding),
    margin: cleanSpacing(rawStyles.margin),
    fontSize: cleanNum(rawStyles.fontSize),
    borderWidth: cleanNum(rawStyles.borderWidth),
    borderRadius: cleanCorners(rawStyles.borderRadius),
    opacity: cleanNum(rawStyles.opacity),
  };
}

export function createEmptyCanonicalDIR(): DIRDocument {
  return {
    version: '1.0.0',
    meta: {
      sourceImageHash: 'sha256_empty',
      sourceWidth: 1440,
      sourceHeight: 900,
      analysisProvider: 'system',
      analysisModel: 'default',
      analysisTimestamp: new Date().toISOString(),
      confidenceScore: 1.0,
      schemaVersion: '1.0.0',
      promptVersion: '2.0.0',
      notes: [],
    },
    breakpoints: {
      desktop: { min: 1025 },
      tablet: { min: 768, max: 1024 },
      mobile: { min: 0, max: 767 },
    },
    globals: {
      colors: {
        background: '#ffffff',
        text: '#111827',
      },
      typography: {
        fontFamilies: ['Inter', 'sans-serif'],
        baseSize: 16,
      },
    },
    assets: [],
    pages: [
      {
        id: 'page_main',
        name: 'Main Page',
        sections: [],
      },
    ],
  };
}

/**
 * Validates with automatic coercion fallback:
 * Attempts strict validation; if invalid, attempts normalization and re-validates.
 */
export function validateAndNormalizeDIR(input: unknown): DIRValidationResult {
  const firstPass = validateDIR(input);
  if (firstPass.valid) {
    return firstPass;
  }

  // Attempt normalization
  try {
    const normalized = normalizeDIRDocument(input);
    const secondPass = validateDIR(normalized);
    if (secondPass.valid) {
      return {
        valid: true,
        document: normalized,
        issues: [
          ...firstPass.issues.map((i) => ({ ...i, severity: 'warning' as const })),
        ],
        errors: [],
      };
    }
    return secondPass;
  } catch (err: any) {
    return {
      valid: false,
      issues: firstPass.issues,
      errors: [`Normalization failure: ${err?.message}`, ...firstPass.errors],
    };
  }
}
