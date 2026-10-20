/**
 * DIR Schema Validation using Zod
 * 
 * Validates DIR JSON against the authoritative schema.
 * Used for both AI-generated output validation and user-edited DIR re-validation.
 */

import { z } from 'zod';
import type { DIRDocument, DIRNodeKind, DIRSectionRole } from './types.js';
import { normalizeDIR } from './normalizer.js';
export { normalizeDIR };

// ─── Reusable Sub-Schemas ────────────────────────────────────────────

const dirSpacing = z.object({
  top: z.number().optional(),
  right: z.number().optional(),
  bottom: z.number().optional(),
  left: z.number().optional(),
}).strict();

const dirCorners = z.object({
  topLeft: z.number().optional(),
  topRight: z.number().optional(),
  bottomRight: z.number().optional(),
  bottomLeft: z.number().optional(),
}).strict();

const dirStyles = z.object({
  // Layout
  width: z.union([z.string(), z.number()]).optional(),
  height: z.union([z.string(), z.number()]).optional(),
  minWidth: z.union([z.string(), z.number()]).optional(),
  maxWidth: z.union([z.string(), z.number()]).optional(),
  minHeight: z.union([z.string(), z.number()]).optional(),
  maxHeight: z.union([z.string(), z.number()]).optional(),
  // Spacing
  padding: dirSpacing.optional(),
  margin: dirSpacing.optional(),
  gap: z.number().optional(),
  // Background
  backgroundColor: z.string().optional(),
  backgroundImage: z.string().optional(),
  backgroundGradient: z.string().optional(),
  backgroundSize: z.string().optional(),
  backgroundPosition: z.string().optional(),
  backgroundOverlay: z.string().optional(),
  // Typography
  fontFamily: z.string().optional(),
  fontSize: z.number().optional(),
  fontWeight: z.union([z.number(), z.string()]).optional(),
  lineHeight: z.union([z.number(), z.string()]).optional(),
  letterSpacing: z.number().optional(),
  textAlign: z.enum(['left', 'center', 'right', 'justify']).optional(),
  textTransform: z.enum(['none', 'uppercase', 'lowercase', 'capitalize']).optional(),
  textDecoration: z.string().optional(),
  color: z.string().optional(),
  // Border
  borderWidth: z.number().optional(),
  borderColor: z.string().optional(),
  borderStyle: z.enum(['solid', 'dashed', 'dotted', 'none']).optional(),
  borderRadius: z.union([z.number(), dirCorners]).optional(),
  // Shadow
  boxShadow: z.string().optional(),
  textShadow: z.string().optional(),
  // Display
  display: z.string().optional(),
  position: z.string().optional(),
  overflow: z.string().optional(),
  opacity: z.number().min(0).max(1).optional(),
  zIndex: z.number().optional(),
  // Flex
  flexDirection: z.enum(['row', 'column']).optional(),
  justifyContent: z.string().optional(),
  alignItems: z.string().optional(),
  alignSelf: z.string().optional(),
  flexGrow: z.number().optional(),
  flexShrink: z.number().optional(),
  flexBasis: z.string().optional(),
  flexWrap: z.enum(['wrap', 'nowrap']).optional(),
}).strict();

const dirRect = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
}).strict();

// ─── Node Schemas (recursive via lazy) ───────────────────────────────

const nodeKinds: DIRNodeKind[] = [
  'container', 'flex-group', 'grid-group', 'heading', 'text', 'button',
  'image', 'icon', 'icon-text', 'link', 'list', 'list-item', 'divider',
  'spacer', 'card', 'form', 'input', 'video', 'map', 'social-icons',
  'counter', 'progress-bar', 'tabs', 'accordion', 'rating', 'badge', 'unknown'
];

const sectionRoles: DIRSectionRole[] = [
  'header', 'navigation', 'hero', 'feature', 'content', 'cta',
  'testimonial', 'pricing', 'stats', 'gallery', 'team', 'faq',
  'contact', 'form', 'footer', 'banner', 'logo-bar', 'generic'
];

const dirCanvasBoundsSchema = z.object({
  crop_mockup: z.boolean().optional(),
  inner_bg_type: z.enum(['gradient', 'solid']).optional(),
  primary_hex: z.string().optional(),
  secondary_hex: z.string().optional(),
  gradient_angle: z.number().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
}).strict();

const dirTypographyDetailsSchema = z.object({
  font_family_guess: z.string().optional(),
  font_size_px: z.number().optional(),
  font_weight: z.union([z.number(), z.string()]).optional(),
  line_height_em: z.union([z.number(), z.string()]).optional(),
  letter_spacing_px: z.number().optional(),
  color_hex: z.string().optional(),
  inline_color_spans: z.array(z.object({
    text: z.string(),
    color_hex: z.string(),
  })).optional(),
}).strict();

const dirFormDetailsSchema = z.object({
  fields: z.array(z.object({
    placeholder: z.string().optional(),
    type: z.string().optional(),
    background_hex: z.string().optional(),
    border_radius_px: z.number().optional(),
  })).optional(),
  placeholder: z.string().optional(),
  background_hex: z.string().optional(),
  border_radius_px: z.number().optional(),
  field_gap_px: z.number().optional(),
  submit_button: z.object({
    text: z.string().optional(),
    width_type: z.enum(['auto', 'full']).optional(),
    gradient_hex: z.string().optional(),
    background_hex: z.string().optional(),
    color_hex: z.string().optional(),
    border_radius_px: z.number().optional(),
    icon_position: z.enum(['left', 'right', 'none']).optional(),
  }).optional(),
}).strict();

const baseNodeFields = {
  id: z.string().min(1),
  kind: z.enum(nodeKinds as [string, ...string[]]),
  label: z.string().optional(),
  confidence: z.number().min(0).max(1),
  styles: dirStyles,
  responsiveOverrides: z.record(
    z.enum(['tablet', 'mobile']),
    dirStyles.partial()
  ).optional(),
  typography: dirTypographyDetailsSchema.optional(),
  form_details: dirFormDetailsSchema.optional(),
  composite_graphic_asset: z.boolean().optional(),
  layout_tree: z.record(z.any()).optional(),
};

// Lazy recursive node schema
const dirNodeSchema: z.ZodType<any> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    // Container
    z.object({
      ...baseNodeFields,
      kind: z.literal('container'),
      direction: z.enum(['row', 'column']).optional(),
      wrap: z.boolean().optional(),
      gap: z.number().optional(),
      children: z.array(dirNodeSchema),
    }).strict(),
    // Flex Group
    z.object({
      ...baseNodeFields,
      kind: z.literal('flex-group'),
      direction: z.enum(['row', 'column']),
      justifyContent: z.string().optional(),
      alignItems: z.string().optional(),
      wrap: z.boolean().optional(),
      gap: z.number().optional(),
      children: z.array(dirNodeSchema),
    }).strict(),
    // Grid Group
    z.object({
      ...baseNodeFields,
      kind: z.literal('grid-group'),
      columns: z.number().int().positive(),
      rows: z.number().int().positive().optional(),
      gap: z.number().optional(),
      children: z.array(dirNodeSchema),
    }).strict(),
    // Heading
    z.object({
      ...baseNodeFields,
      kind: z.literal('heading'),
      text: z.string(),
      level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
      htmlTag: z.string().optional(),
    }).strict(),
    // Text
    z.object({
      ...baseNodeFields,
      kind: z.literal('text'),
      html: z.string(),
      text: z.string().optional(),
    }).strict(),
    // Button
    z.object({
      ...baseNodeFields,
      kind: z.literal('button'),
      text: z.string(),
      url: z.string().optional(),
      variant: z.enum(['primary', 'secondary', 'outline', 'ghost', 'link']).optional(),
      size: z.enum(['small', 'medium', 'large']).optional(),
      icon: z.string().optional(),
      iconPosition: z.enum(['left', 'right']).optional(),
    }).strict(),
    // Image
    z.object({
      ...baseNodeFields,
      kind: z.literal('image'),
      assetId: z.string().optional(),
      alt: z.string().optional(),
      caption: z.string().optional(),
      objectFit: z.enum(['cover', 'contain', 'fill', 'none']).optional(),
      aspectRatio: z.string().optional(),
      url: z.string().optional(),
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
      seed: z.number().int().optional(),
      prompt: z.string().optional(),
    }).strict(),
    // Icon
    z.object({
      ...baseNodeFields,
      kind: z.literal('icon'),
      iconName: z.string().optional(),
      iconLibrary: z.string().optional(),
    }).strict(),
    // Icon-Text
    z.object({
      ...baseNodeFields,
      kind: z.literal('icon-text'),
      iconName: z.string().optional(),
      iconLibrary: z.string().optional(),
      text: z.string(),
      title: z.string().optional(),
    }).strict(),
    // Link
    z.object({
      ...baseNodeFields,
      kind: z.literal('link'),
      text: z.string(),
      url: z.string().optional(),
    }).strict(),
    // List
    z.object({
      ...baseNodeFields,
      kind: z.literal('list'),
      ordered: z.boolean().optional(),
      children: z.array(z.lazy(() => dirNodeSchema)),
    }).strict(),
    // List Item
    z.object({
      ...baseNodeFields,
      kind: z.literal('list-item'),
      text: z.string(),
      icon: z.string().optional(),
    }).strict(),
    // Divider
    z.object({
      ...baseNodeFields,
      kind: z.literal('divider'),
      thickness: z.number().optional(),
    }).strict(),
    // Spacer
    z.object({
      ...baseNodeFields,
      kind: z.literal('spacer'),
      height: z.number(),
    }).strict(),
    // Card
    z.object({
      ...baseNodeFields,
      kind: z.literal('card'),
      children: z.array(dirNodeSchema),
    }).strict(),
    // Form
    z.object({
      ...baseNodeFields,
      kind: z.literal('form'),
      children: z.array(dirNodeSchema),
    }).strict(),
    // Input
    z.object({
      ...baseNodeFields,
      kind: z.literal('input'),
      inputType: z.enum(['text', 'email', 'password', 'textarea', 'select', 'checkbox', 'radio']).optional(),
      placeholder: z.string().optional(),
      label: z.string().optional(),
    }).strict(),
    // Video
    z.object({
      ...baseNodeFields,
      kind: z.literal('video'),
      url: z.string().optional(),
      provider: z.enum(['youtube', 'vimeo', 'self-hosted']).optional(),
    }).strict(),
    // Map
    z.object({
      ...baseNodeFields,
      kind: z.literal('map'),
      location: z.string().optional(),
    }).strict(),
    // Social Icons
    z.object({
      ...baseNodeFields,
      kind: z.literal('social-icons'),
      platforms: z.array(z.object({
        name: z.string(),
        url: z.string().optional(),
      })),
    }).strict(),
    // Counter
    z.object({
      ...baseNodeFields,
      kind: z.literal('counter'),
      value: z.number(),
      suffix: z.string().optional(),
      prefix: z.string().optional(),
      title: z.string().optional(),
    }).strict(),
    // Progress Bar
    z.object({
      ...baseNodeFields,
      kind: z.literal('progress-bar'),
      value: z.number(),
      max: z.number().optional(),
      label: z.string().optional(),
    }).strict(),
    // Tabs
    z.object({
      ...baseNodeFields,
      kind: z.literal('tabs'),
      tabs: z.array(z.object({
        title: z.string(),
        children: z.array(dirNodeSchema),
      })),
    }).strict(),
    // Accordion
    z.object({
      ...baseNodeFields,
      kind: z.literal('accordion'),
      items: z.array(z.object({
        title: z.string(),
        children: z.array(dirNodeSchema),
      })),
    }).strict(),
    // Rating
    z.object({
      ...baseNodeFields,
      kind: z.literal('rating'),
      value: z.number(),
      max: z.number().optional(),
    }).strict(),
    // Badge
    z.object({
      ...baseNodeFields,
      kind: z.literal('badge'),
      text: z.string(),
    }).strict(),
    // Unknown
    z.object({
      ...baseNodeFields,
      kind: z.literal('unknown'),
      description: z.string().optional(),
      children: z.array(dirNodeSchema).optional(),
    }).strict(),
  ])
);

// ─── Asset Schema ────────────────────────────────────────────────────

const dirAssetSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['image', 'icon', 'logo', 'background', 'video', 'placeholder']),
  role: z.string(),
  sourceRect: dirRect.optional(),
  description: z.string().optional(),
  placeholder: z.string().optional(),
  confidence: z.number().min(0).max(1),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  seed: z.number().int().optional(),
  prompt: z.string().optional(),
  generated: z.boolean().optional(),
  composite_graphic_asset: z.boolean().optional(),
  metadata: z.record(z.any()).optional(),
}).strict();

// ─── Section Schema ──────────────────────────────────────────────────

const dirSectionSchema = z.object({
  id: z.string().min(1),
  role: z.enum(sectionRoles as [string, ...string[]]),
  label: z.string().optional(),
  confidence: z.number().min(0).max(1),
  styles: dirStyles,
  children: z.array(dirNodeSchema),
  responsiveNotes: z.array(z.string()).optional(),
  responsiveOverrides: z.record(
    z.enum(['tablet', 'mobile']),
    dirStyles.partial()
  ).optional(),
  canvas_bounds: dirCanvasBoundsSchema.optional(),
  direction: z.enum(['row', 'column']).optional(),
  gap: z.number().optional(),
  justifyContent: z.string().optional(),
  alignItems: z.string().optional(),
  layout_tree: z.record(z.any()).optional(),
}).strict();

// ─── Page Schema ─────────────────────────────────────────────────────

const dirPageSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  sections: z.array(dirSectionSchema).min(1),
  canvas_bounds: dirCanvasBoundsSchema.optional(),
}).strict();

// ─── Full DIR Document Schema ────────────────────────────────────────

export const dirDocumentSchema = z.object({
  version: z.literal('1.0.0'),
  meta: z.object({
    sourceImageHash: z.string().min(1),
    sourceWidth: z.number().positive(),
    sourceHeight: z.number().positive(),
    analysisProvider: z.string(),
    analysisModel: z.string(),
    analysisTimestamp: z.string(),
    confidenceScore: z.number().min(0).max(1),
    schemaVersion: z.literal('1.0.0'),
    promptVersion: z.string(),
    notes: z.array(z.string()).optional(),
    canvas_bounds: dirCanvasBoundsSchema.optional(),
  }).strict(),
  breakpoints: z.object({
    desktop: z.object({ min: z.number(), max: z.number().optional() }),
    tablet: z.object({ min: z.number(), max: z.number() }).optional(),
    mobile: z.object({ min: z.number(), max: z.number().optional() }).optional(),
  }).strict(),
  globals: z.object({
    colors: z.object({
      primary: z.string().optional(),
      secondary: z.string().optional(),
      accent: z.string().optional(),
      background: z.string(),
      surface: z.string().optional(),
      text: z.string(),
      textSecondary: z.string().optional(),
      border: z.string().optional(),
    }).catchall(z.string().optional()),
    typography: z.object({
      fontFamilies: z.array(z.string()),
      headingFont: z.string().optional(),
      bodyFont: z.string().optional(),
      baseSize: z.number().optional(),
      scale: z.number().optional(),
    }).strict(),
    spacing: z.object({
      unit: z.enum(['px', 'rem']),
      base: z.number(),
      sectionGap: z.number().optional(),
      containerMaxWidth: z.number().optional(),
    }).strict().optional(),
  }).strict(),
  assets: z.array(dirAssetSchema),
  pages: z.array(dirPageSchema).min(1),
  canvas_bounds: dirCanvasBoundsSchema.optional(),
}).strict();

// ─── Validation Functions ────────────────────────────────────────────

export interface DIRValidationResult {
  valid: boolean;
  document?: DIRDocument;
  errors: DIRValidationError[];
  warnings: string[];
}

export interface DIRValidationError {
  path: string;
  message: string;
  code: string;
}

/**
 * Validate a DIR document against the schema.
 * Returns structured validation result with errors and warnings.
 */
export function validateDIR(data: unknown): DIRValidationResult {
  const warnings: string[] = [];

  // First check if it's valid JSON object
  if (typeof data !== 'object' || data === null) {
    return {
      valid: false,
      errors: [{ path: '', message: 'DIR must be a JSON object', code: 'INVALID_TYPE' }],
      warnings,
    };
  }

  const result = dirDocumentSchema.safeParse(data);

  if (!result.success) {
    const errors: DIRValidationError[] = result.error.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }));
    return { valid: false, errors, warnings };
  }

  const doc = result.data as DIRDocument;

  // Additional semantic validations
  const ids = new Set<string>();
  const duplicateIds: string[] = [];

  function collectIds(nodes: any[]) {
    for (const node of nodes) {
      if (node.id) {
        if (ids.has(node.id)) {
          duplicateIds.push(node.id);
        }
        ids.add(node.id);
      }
      if (node.children) collectIds(node.children);
      if (node.tabs) node.tabs.forEach((t: any) => t.children && collectIds(t.children));
      if (node.items) node.items.forEach((i: any) => i.children && collectIds(i.children));
    }
  }

  for (const page of doc.pages) {
    if (ids.has(page.id)) duplicateIds.push(page.id);
    ids.add(page.id);
    for (const section of page.sections) {
      if (ids.has(section.id)) duplicateIds.push(section.id);
      ids.add(section.id);
      collectIds(section.children);
    }
  }

  const errors: DIRValidationError[] = [];

  if (duplicateIds.length > 0) {
    errors.push({
      path: '',
      message: `Duplicate IDs found: ${duplicateIds.join(', ')}`,
      code: 'DUPLICATE_IDS',
    });
  }

  // Check asset references
  const assetIds = new Set(doc.assets.map((a: { id: string }) => a.id));
  function checkAssetRefs(nodes: any[]) {
    for (const node of nodes) {
      if (node.kind === 'image' && node.assetId && !assetIds.has(node.assetId)) {
        warnings.push(`Image node ${node.id} references unknown asset: ${node.assetId}`);
      }
      if (node.children) checkAssetRefs(node.children);
    }
  }

  for (const page of doc.pages) {
    for (const section of page.sections) {
      checkAssetRefs(section.children);
    }
  }

  // Low confidence warnings
  for (const page of doc.pages) {
    for (const section of page.sections) {
      if (section.confidence < 0.5) {
        warnings.push(`Section "${section.id}" has low confidence: ${section.confidence}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    document: errors.length === 0 ? doc : undefined,
    errors,
    warnings,
  };
}

/**
 * Parse JSON string to DIR, handling common AI output issues.
 * Attempts to extract JSON from markdown code blocks if needed.
 */
export function parseDIRFromAIOutput(raw: string): { parsed: unknown; extractionMethod: string } | { error: string } {
  // Try direct parse
  try {
    const rawParsed = JSON.parse(raw);
    return { parsed: normalizeDIR(rawParsed), extractionMethod: 'direct' };
  } catch {
    // Try extracting from markdown code block
    const codeBlockMatch = raw.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      try {
        const rawParsed = JSON.parse(codeBlockMatch[1]);
        return { parsed: normalizeDIR(rawParsed), extractionMethod: 'markdown_code_block' };
      } catch {
        // continue
      }
    }

    // Try finding JSON object boundaries
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        const rawParsed = JSON.parse(raw.substring(firstBrace, lastBrace + 1));
        return { parsed: normalizeDIR(rawParsed), extractionMethod: 'brace_extraction' };
      } catch {
        // continue
      }
    }

    return { error: 'Could not parse AI output as JSON' };
  }
}
