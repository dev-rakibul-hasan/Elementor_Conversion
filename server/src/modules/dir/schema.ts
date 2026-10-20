/**
 * Design Intermediate Representation (DIR) — Zod Runtime Schema Validation & Coercion
 * Architecture Lead: Mubasshir
 * 
 * Validates DIR JSON against the authoritative schema specification.
 * Handles AI output coercion, strict numeric enforcement, and structural sanitization.
 */

import { z } from 'zod';
import type {
  DIRDocument,
  DIRSection,
  DIRNode,
  DIRStyles,
  DIRSpacing,
  DIRCorners,
  DIRAsset,
  DIRRect,
  DIRNodeKind,
  DIRSectionRole,
} from './types.js';

// ─── Numeric & String Coercion Utilities ──────────────────────────────

/**
 * Coerces CSS-like string values (e.g. "16px", "24.5", "100%") to numbers if possible,
 * or leaves them untouched if non-numeric.
 */
function coerceNumeric(val: unknown): unknown {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const cleaned = val.trim().replace(/px$/i, '');
    const num = Number(cleaned);
    if (!isNaN(num) && cleaned !== '') {
      return num;
    }
  }
  return val;
}

const coercedNumber = z.preprocess(coerceNumeric, z.number());
const optionalCoercedNumber = z.preprocess(coerceNumeric, z.number().optional());

// ─── Reusable Style Sub-Schemas ──────────────────────────────────────

export const dirSpacingSchema: z.ZodType<DIRSpacing, z.ZodTypeDef, unknown> = z
  .object({
    top: optionalCoercedNumber,
    right: optionalCoercedNumber,
    bottom: optionalCoercedNumber,
    left: optionalCoercedNumber,
  })
  .strict();

export const dirCornersSchema: z.ZodType<DIRCorners, z.ZodTypeDef, unknown> = z
  .object({
    topLeft: optionalCoercedNumber,
    topRight: optionalCoercedNumber,
    bottomRight: optionalCoercedNumber,
    leftBottom: optionalCoercedNumber, // alias defense
    bottomLeft: optionalCoercedNumber,
  })
  .strict()
  .transform((c) => ({
    topLeft: c.topLeft,
    topRight: c.topRight,
    bottomRight: c.bottomRight,
    bottomLeft: c.bottomLeft ?? (c as any).leftBottom,
  }));

export const dirStylesSchema: z.ZodType<DIRStyles, z.ZodTypeDef, unknown> = z
  .object({
    // Geometry
    width: z.union([z.string(), coercedNumber]).optional(),
    height: z.union([z.string(), coercedNumber]).optional(),
    minWidth: z.union([z.string(), coercedNumber]).optional(),
    maxWidth: z.union([z.string(), coercedNumber]).optional(),
    minHeight: z.union([z.string(), coercedNumber]).optional(),
    maxHeight: z.union([z.string(), coercedNumber]).optional(),

    // Spacing
    padding: dirSpacingSchema.optional(),
    margin: dirSpacingSchema.optional(),
    gap: optionalCoercedNumber,

    // Background
    backgroundColor: z.string().optional(),
    backgroundImage: z.string().optional(),
    backgroundImagePath: z.string().optional(),
    backgroundImageAssetId: z.string().optional(),
    backgroundGradient: z.union([z.string(), z.record(z.unknown())]).optional(),
    backgroundSize: z.string().optional(),
    backgroundPosition: z.string().optional(),
    backgroundOverlay: z.string().optional(),

    // Typography
    fontFamily: z.string().optional(),
    fontSize: optionalCoercedNumber,
    fontWeight: z.union([coercedNumber, z.string()]).optional(),
    lineHeight: z.union([coercedNumber, z.string()]).optional(),
    letterSpacing: optionalCoercedNumber,
    textAlign: z.enum(['left', 'center', 'right', 'justify']).optional(),
    textTransform: z.enum(['none', 'uppercase', 'lowercase', 'capitalize']).optional(),
    textDecoration: z.string().optional(),
    color: z.string().optional(),

    // Border
    borderWidth: optionalCoercedNumber,
    borderColor: z.string().optional(),
    borderStyle: z.enum(['solid', 'dashed', 'dotted', 'none']).optional(),
    borderRadius: z.union([optionalCoercedNumber, dirCornersSchema]).optional(),

    // Shadow & visual
    boxShadow: z.string().optional(),
    textShadow: z.string().optional(),
    opacity: z.preprocess(coerceNumeric, z.number().min(0).max(1).optional()),
    zIndex: optionalCoercedNumber,

    // Flexbox
    display: z.string().optional(),
    position: z.string().optional(),
    overflow: z.string().optional(),
    flexDirection: z.enum(['row', 'column']).optional(),
    justifyContent: z.string().optional(),
    alignItems: z.string().optional(),
    alignSelf: z.string().optional(),
    flexGrow: optionalCoercedNumber,
    flexShrink: optionalCoercedNumber,
    flexBasis: z.string().optional(),
    flexWrap: z.enum(['wrap', 'nowrap']).optional(),
  })
  .passthrough();

export const dirRectSchema: z.ZodType<DIRRect, z.ZodTypeDef, unknown> = z
  .object({
    x: z.preprocess(coerceNumeric, z.number().min(0)),
    y: z.preprocess(coerceNumeric, z.number().min(0)),
    width: z.preprocess(coerceNumeric, z.number().positive()),
    height: z.preprocess(coerceNumeric, z.number().positive()),
  })
  .strict();

export const dirCanvasBoundsSchema = z
  .object({
    crop_mockup: z.boolean().optional(),
    inner_bg_type: z.enum(['gradient', 'solid']).optional(),
    primary_hex: z.string().optional(),
    secondary_hex: z.string().optional(),
    gradient_angle: optionalCoercedNumber,
    x: optionalCoercedNumber,
    y: optionalCoercedNumber,
    width: optionalCoercedNumber,
    height: optionalCoercedNumber,
  })
  .passthrough();

export const dirTypographyDetailsSchema = z
  .object({
    font_family_guess: z.string().optional(),
    font_size_px: optionalCoercedNumber,
    font_weight: z.union([coercedNumber, z.string()]).optional(),
    line_height_em: z.union([coercedNumber, z.string()]).optional(),
    letter_spacing_px: optionalCoercedNumber,
    color_hex: z.string().optional(),
    inline_color_spans: z
      .array(
        z.object({
          text: z.string(),
          color_hex: z.string(),
        })
      )
      .optional(),
  })
  .passthrough();

export const dirFormDetailsSchema = z
  .object({
    fields: z
      .array(
        z.object({
          placeholder: z.string().optional(),
          type: z.string().optional(),
          background_hex: z.string().optional(),
          border_radius_px: optionalCoercedNumber,
        })
      )
      .optional(),
    placeholder: z.string().optional(),
    background_hex: z.string().optional(),
    border_radius_px: optionalCoercedNumber,
    field_gap_px: optionalCoercedNumber,
    submit_button: z
      .object({
        text: z.string().optional(),
        width_type: z.enum(['auto', 'full']).optional(),
        gradient_hex: z.string().optional(),
        background_hex: z.string().optional(),
        color_hex: z.string().optional(),
        border_radius_px: optionalCoercedNumber,
        icon_position: z.enum(['left', 'right', 'none']).optional(),
      })
      .optional(),
  })
  .passthrough();

// ─── Asset Schema ────────────────────────────────────────────────────

export const dirAssetSchema: z.ZodType<DIRAsset, z.ZodTypeDef, unknown> = z
  .object({
    id: z.string(),
    type: z.enum(['image', 'icon', 'logo', 'background', 'video', 'placeholder']),
    role: z.string(),
    sourceRect: dirRectSchema.optional(),
    description: z.string().optional(),
    placeholder: z.string().optional(),
    url: z.string().optional(),
    path: z.string().optional(),
    confidence: z.preprocess(coerceNumeric, z.number().min(0).max(1).default(0.9)),
    width: optionalCoercedNumber,
    height: optionalCoercedNumber,
    composite_graphic_asset: z.boolean().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .passthrough();

// ─── Node Schema (Recursive) ─────────────────────────────────────────

export const dirNodeKindSchema = z.enum([
  'container',
  'flex-group',
  'grid-group',
  'heading',
  'text',
  'button',
  'image',
  'icon',
  'icon-text',
  'link',
  'list',
  'list-item',
  'divider',
  'spacer',
  'card',
  'form',
  'input',
  'video',
  'map',
  'social-icons',
  'counter',
  'progress-bar',
  'tabs',
  'accordion',
  'rating',
  'badge',
  'image-box',
  'unknown',
]) as z.ZodType<DIRNodeKind, z.ZodTypeDef, unknown>;

export const dirNodeSchema: z.ZodType<DIRNode, z.ZodTypeDef, unknown> = z.lazy(() =>
  z
    .object({
      id: z.string(),
      kind: dirNodeKindSchema.catch('unknown'),
      label: z.string().optional(),
      confidence: z.preprocess(coerceNumeric, z.number().min(0).max(1).default(0.9)),
      styles: dirStylesSchema.default({}),
      responsiveOverrides: z.record(z.any()).optional(),
      typography: dirTypographyDetailsSchema.optional(),
      form_details: dirFormDetailsSchema.optional(),
      composite_graphic_asset: z.boolean().optional(),

      // Kind-specific properties
      direction: z.enum(['row', 'column']).optional(),
      wrap: z.boolean().optional(),
      gap: optionalCoercedNumber,
      columns: optionalCoercedNumber,
      rows: optionalCoercedNumber,
      justifyContent: z.string().optional(),
      alignItems: z.string().optional(),

      // Heading / Text / Button / Link
      text: z.string().optional(),
      html: z.string().optional(),
      level: z.preprocess(coerceNumeric, z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]).optional()),
      htmlTag: z.string().optional(),
      accent: z.object({ text: z.string(), color: z.string().optional() }).optional(),
      accentWord: z.string().optional(),
      accentColor: z.string().optional(),
      url: z.string().optional(),
      variant: z.enum(['primary', 'secondary', 'outline', 'ghost', 'link']).optional(),
      size: z.enum(['small', 'medium', 'large']).optional(),

      // Image & Media
      assetId: z.string().optional(),
      alt: z.string().optional(),
      caption: z.string().optional(),
      objectFit: z.enum(['cover', 'contain', 'fill', 'none']).optional(),
      aspectRatio: z.string().optional(),
      width: optionalCoercedNumber,
      height: optionalCoercedNumber,

      // Icon & Lists
      icon: z.string().optional(),
      iconPosition: z.enum(['left', 'right']).optional(),
      iconName: z.string().optional(),
      iconLibrary: z.string().optional(),
      ordered: z.boolean().optional(),

      // Counter / Progress / Rating
      value: optionalCoercedNumber,
      startingNumber: optionalCoercedNumber,
      suffix: z.string().optional(),
      prefix: z.string().optional(),
      title: z.string().optional(),
      max: optionalCoercedNumber,
      rating: optionalCoercedNumber,
      maxRating: optionalCoercedNumber,

      // Form & Input
      inputType: z.enum(['text', 'email', 'password', 'textarea', 'select', 'checkbox', 'radio']).optional(),
      placeholder: z.string().optional(),

      // Tabs & Accordion items
      items: z.array(z.object({ title: z.string(), content: z.string() })).optional(),

      // Social Icons
      platforms: z.array(z.object({ name: z.string(), url: z.string().optional() })).optional(),

      // Children recursion
      children: z.array(dirNodeSchema).optional(),
    })
    .passthrough() as unknown as z.ZodType<DIRNode, z.ZodTypeDef, unknown>
);

// ─── Section Schema ──────────────────────────────────────────────────

export const dirSectionRoleSchema = z.enum([
  'header',
  'navigation',
  'hero',
  'feature',
  'content',
  'cta',
  'testimonial',
  'pricing',
  'stats',
  'gallery',
  'team',
  'faq',
  'contact',
  'form',
  'footer',
  'banner',
  'logo-bar',
  'generic',
]) as z.ZodType<DIRSectionRole, z.ZodTypeDef, unknown>;

export const dirSectionSchema: z.ZodType<DIRSection, z.ZodTypeDef, unknown> = z
  .object({
    id: z.string(),
    role: dirSectionRoleSchema.catch('generic'),
    label: z.string().optional(),
    confidence: z.preprocess(coerceNumeric, z.number().min(0).max(1).default(0.9)),
    styles: dirStylesSchema.default({}),
    children: z.array(dirNodeSchema).default([]),
    responsiveNotes: z.array(z.string()).optional(),
    responsiveOverrides: z.record(z.any()).optional(),
    canvas_bounds: dirCanvasBoundsSchema.optional(),
  })
  .passthrough();

// ─── Document Root Schema ────────────────────────────────────────────

export const dirDocumentSchema: z.ZodType<DIRDocument, z.ZodTypeDef, unknown> = z
  .object({
    version: z.literal('1.0.0'),
    meta: z
      .object({
        sourceImageHash: z.string(),
        sourceWidth: z.preprocess(coerceNumeric, z.number().positive()),
        sourceHeight: z.preprocess(coerceNumeric, z.number().positive()),
        analysisProvider: z.string(),
        analysisModel: z.string(),
        analysisTimestamp: z.string(),
        confidenceScore: z.preprocess(coerceNumeric, z.number().min(0).max(1)),
        schemaVersion: z.literal('1.0.0'),
        promptVersion: z.string(),
        elementorVersion: z.string().optional(),
        notes: z.array(z.string()).optional(),
      })
      .passthrough(),
    breakpoints: z
      .object({
        desktop: z.object({
          min: z.preprocess(coerceNumeric, z.number()),
          max: optionalCoercedNumber,
        }),
        tablet: z
          .object({
            min: z.preprocess(coerceNumeric, z.number()),
            max: z.preprocess(coerceNumeric, z.number()),
          })
          .optional(),
        mobile: z
          .object({
            min: z.preprocess(coerceNumeric, z.number()),
            max: optionalCoercedNumber,
          })
          .optional(),
      })
      .passthrough(),
    globals: z
      .object({
        colors: z
          .object({
            background: z.string(),
            text: z.string(),
            primary: z.string().optional(),
            secondary: z.string().optional(),
            accent: z.string().optional(),
            surface: z.string().optional(),
            textSecondary: z.string().optional(),
            border: z.string().optional(),
          })
          .passthrough(),
        typography: z
          .object({
            fontFamilies: z.array(z.string()).default(['Inter', 'sans-serif']),
            headingFont: z.string().optional(),
            bodyFont: z.string().optional(),
            baseSize: optionalCoercedNumber,
            scale: optionalCoercedNumber,
          })
          .passthrough(),
        spacing: z
          .object({
            unit: z.enum(['px', 'rem']).default('px'),
            base: z.preprocess(coerceNumeric, z.number()).default(8),
            sectionGap: optionalCoercedNumber,
            containerMaxWidth: optionalCoercedNumber,
          })
          .optional(),
      })
      .passthrough(),
    assets: z.array(dirAssetSchema).default([]),
    pages: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          sections: z.array(dirSectionSchema).default([]),
        })
      )
      .min(1),
    canvas_bounds: dirCanvasBoundsSchema.optional(),
  })
  .passthrough() as unknown as z.ZodType<DIRDocument, z.ZodTypeDef, unknown>;

// ─── Validation Result Interface ─────────────────────────────────────

export interface DIRValidationIssue {
  path: string;
  message: string;
  code: string;
  severity: 'error' | 'warning';
}

export interface DIRValidationResult {
  valid: boolean;
  document?: DIRDocument;
  issues: DIRValidationIssue[];
  errors: string[];
}

/**
 * Validates any arbitrary JSON object against canonical DIR schema.
 */
export function validateDIR(input: unknown): DIRValidationResult {
  const result = dirDocumentSchema.safeParse(input);

  if (result.success) {
    const doc = result.data;
    const semanticIssues: DIRValidationIssue[] = [];

    // Semantic cross-validation rule 1: Bounding boxes within source dimensions
    const meta = doc.meta;
    for (const asset of doc.assets) {
      if (asset.sourceRect) {
        const { x, y, width, height } = asset.sourceRect;
        if (x + width > meta.sourceWidth || y + height > meta.sourceHeight) {
          semanticIssues.push({
            path: `assets[${asset.id}].sourceRect`,
            message: `Asset rect (${x}+${width}, ${y}+${height}) overflows source image boundary (${meta.sourceWidth}x${meta.sourceHeight})`,
            code: 'BOUNDS_OVERFLOW',
            severity: 'warning',
          });
        }
      }
    }

    // Semantic cross-validation rule 2: Referencing nonexistent asset IDs
    const assetIdSet = new Set(doc.assets.map((a) => a.id));
    function checkNodeAssets(nodes: DIRNode[], prefix: string) {
      for (const node of nodes) {
        if ('assetId' in node && node.assetId && !assetIdSet.has(node.assetId)) {
          semanticIssues.push({
            path: `${prefix}.nodes[${node.id}].assetId`,
            message: `Node references assetId "${node.assetId}" which is not defined in root assets`,
            code: 'DANGLING_ASSET_REFERENCE',
            severity: 'warning',
          });
        }
        if ('children' in node && Array.isArray(node.children)) {
          checkNodeAssets(node.children, `${prefix}.nodes[${node.id}]`);
        }
      }
    }

    for (const page of doc.pages) {
      for (const section of page.sections) {
        checkNodeAssets(section.children, `pages[${page.id}].sections[${section.id}]`);
      }
    }

    const errors = semanticIssues.filter((i) => i.severity === 'error').map((i) => i.message);

    return {
      valid: errors.length === 0,
      document: doc,
      issues: semanticIssues,
      errors,
    };
  }

  // Zod formatting
  const issues: DIRValidationIssue[] = result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
    severity: 'error',
  }));

  return {
    valid: false,
    issues,
    errors: issues.map((i) => `${i.path}: ${i.message}`),
  };
}

