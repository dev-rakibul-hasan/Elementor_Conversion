/**
 * Design Intermediate Representation (DIR) — Authoritative Canonical TypeScript Types
 * Architecture Lead: Mubasshir
 * 
 * Version: 1.0.0
 * 
 * This is the canonical intermediate representation for the Design-to-Elementor pipeline.
 * It forms the immutable contract between:
 * - Stage A: Vision Understanding & Canvas Isolation
 * - Stage B: Semantic DIR Layout Engine
 * - Stage C: Elementor AST Generator
 * - Stage D: Elementor Verification & Self-Healing Gate
 */

export type DIRVersion = '1.0.0';
export const CURRENT_DIR_VERSION: DIRVersion = '1.0.0';

// ─── Document Root ───────────────────────────────────────────────────

export interface DIRDocument {
  version: DIRVersion;
  meta: DIRMeta;
  breakpoints: DIRBreakpoints;
  globals: DIRGlobals;
  assets: DIRAsset[];
  pages: DIRPage[];
  canvas_bounds?: DIRCanvasBounds;
}

// ─── Metadata ────────────────────────────────────────────────────────

export interface DIRMeta {
  sourceImageHash: string;
  sourceWidth: number;
  sourceHeight: number;
  analysisProvider: string;
  analysisModel: string;
  analysisTimestamp: string;
  confidenceScore: number; // 0.0 to 1.0
  schemaVersion: DIRVersion;
  promptVersion: string;
  elementorVersion?: string;
  notes?: string[];
}

// ─── Canvas & Mockup Bounds ──────────────────────────────────────────

export interface DIRCanvasBounds {
  crop_mockup?: boolean;
  inner_bg_type?: 'gradient' | 'solid';
  primary_hex?: string;
  secondary_hex?: string;
  gradient_angle?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

// ─── Breakpoints & Globals ───────────────────────────────────────────

export interface DIRBreakpoints {
  desktop: { min: number; max?: number };
  tablet?: { min: number; max: number };
  mobile?: { min: number; max?: number };
}

export interface DIRGlobals {
  colors: DIRColorPalette;
  typography: DIRTypographyScale;
  spacing?: DIRSpacingScale;
}

export interface DIRColorPalette {
  background: string;
  text: string;
  primary?: string;
  secondary?: string;
  accent?: string;
  surface?: string;
  textSecondary?: string;
  border?: string;
  [key: string]: string | undefined;
}

export interface DIRTypographyScale {
  fontFamilies: string[];
  headingFont?: string;
  bodyFont?: string;
  baseSize?: number;
  scale?: number;
}

export interface DIRSpacingScale {
  unit: 'px' | 'rem';
  base: number;
  sectionGap?: number;
  containerMaxWidth?: number;
}

// ─── Assets ──────────────────────────────────────────────────────────

export type DIRAssetType = 'image' | 'icon' | 'logo' | 'background' | 'video' | 'placeholder';

export interface DIRRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DIRAsset {
  id: string;
  type: DIRAssetType;
  role: string;
  sourceRect?: DIRRect;
  description?: string;
  placeholder?: string;
  url?: string;
  path?: string;
  confidence: number; // 0.0 to 1.0
  width?: number;
  height?: number;
  composite_graphic_asset?: boolean;
  metadata?: Record<string, unknown>;
}

// ─── Structure: Pages & Sections ─────────────────────────────────────

export interface DIRPage {
  id: string;
  name: string;
  sections: DIRSection[];
}

export type DIRSectionRole =
  | 'header'
  | 'navigation'
  | 'hero'
  | 'feature'
  | 'content'
  | 'cta'
  | 'testimonial'
  | 'pricing'
  | 'stats'
  | 'gallery'
  | 'team'
  | 'faq'
  | 'contact'
  | 'form'
  | 'footer'
  | 'banner'
  | 'logo-bar'
  | 'generic';

export interface DIRSection {
  id: string;
  role: DIRSectionRole;
  label?: string;
  confidence: number;
  styles: DIRStyles;
  children: DIRNode[];
  responsiveNotes?: string[];
  responsiveOverrides?: Partial<Record<'tablet' | 'mobile', Partial<DIRStyles>>>;
  canvas_bounds?: DIRCanvasBounds;
}

// ─── Nodes Hierarchy ─────────────────────────────────────────────────

export type DIRNodeKind =
  | 'container'
  | 'flex-group'
  | 'grid-group'
  | 'heading'
  | 'text'
  | 'button'
  | 'image'
  | 'icon'
  | 'icon-text'
  | 'link'
  | 'list'
  | 'list-item'
  | 'divider'
  | 'spacer'
  | 'card'
  | 'form'
  | 'input'
  | 'video'
  | 'map'
  | 'social-icons'
  | 'counter'
  | 'progress-bar'
  | 'tabs'
  | 'accordion'
  | 'rating'
  | 'badge'
  | 'image-box'
  | 'unknown';

export interface DIRSpacing {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface DIRCorners {
  topLeft?: number;
  topRight?: number;
  bottomRight?: number;
  bottomLeft?: number;
}

export interface DIRStyles {
  // Layout geometry
  width?: string | number;
  height?: string | number;
  minWidth?: string | number;
  maxWidth?: string | number;
  minHeight?: string | number;
  maxHeight?: string | number;

  // Spacing (numbers strictly represent pixels)
  padding?: DIRSpacing;
  margin?: DIRSpacing;
  gap?: number;

  // Background
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundImagePath?: string;
  backgroundImageAssetId?: string;
  backgroundGradient?: string | Record<string, unknown>;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundOverlay?: string;

  // Typography
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number | string;
  lineHeight?: number | string;
  letterSpacing?: number;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  textDecoration?: string;
  color?: string;

  // Border & radius
  borderWidth?: number;
  borderColor?: string;
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'none';
  borderRadius?: number | DIRCorners;

  // Visual effects
  boxShadow?: string;
  textShadow?: string;
  opacity?: number;
  zIndex?: number;

  // Modern Flexbox properties
  display?: string;
  position?: string;
  overflow?: string;
  flexDirection?: 'row' | 'column';
  justifyContent?: string;
  alignItems?: string;
  alignSelf?: string;
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: string;
  flexWrap?: 'wrap' | 'nowrap';
}

export interface DIRTypographyDetails {
  font_family_guess?: string;
  font_size_px?: number;
  font_weight?: number | string;
  line_height_em?: number | string;
  letter_spacing_px?: number;
  color_hex?: string;
  inline_color_spans?: Array<{ text: string; color_hex: string }>;
}

export interface DIRFormDetails {
  fields?: Array<{
    placeholder?: string;
    type?: string;
    background_hex?: string;
    border_radius_px?: number;
  }>;
  placeholder?: string;
  background_hex?: string;
  border_radius_px?: number;
  field_gap_px?: number;
  submit_button?: {
    text?: string;
    width_type?: 'auto' | 'full';
    gradient_hex?: string;
    background_hex?: string;
    color_hex?: string;
    border_radius_px?: number;
    icon_position?: 'left' | 'right' | 'none';
  };
}

export interface DIRNodeBase {
  id: string;
  kind: DIRNodeKind;
  label?: string;
  confidence: number;
  styles: DIRStyles;
  responsiveOverrides?: Partial<Record<'tablet' | 'mobile', Partial<DIRStyles>>>;
  typography?: DIRTypographyDetails;
  form_details?: DIRFormDetails;
  composite_graphic_asset?: boolean;
}

export interface DIRContainerNode extends DIRNodeBase {
  kind: 'container';
  direction?: 'row' | 'column';
  wrap?: boolean;
  gap?: number;
  children: DIRNode[];
}

export interface DIRFlexGroupNode extends DIRNodeBase {
  kind: 'flex-group';
  direction: 'row' | 'column';
  justifyContent?: string;
  alignItems?: string;
  wrap?: boolean;
  gap?: number;
  children: DIRNode[];
}

export interface DIRGridGroupNode extends DIRNodeBase {
  kind: 'grid-group';
  columns: number;
  rows?: number;
  gap?: number;
  children: DIRNode[];
}

export interface DIRHeadingNode extends DIRNodeBase {
  kind: 'heading';
  text: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  htmlTag?: string;
  accent?: { text: string; color?: string };
  accentWord?: string;
  accentColor?: string;
}

export interface DIRTextNode extends DIRNodeBase {
  kind: 'text';
  html: string;
  text?: string;
}

export interface DIRButtonNode extends DIRNodeBase {
  kind: 'button';
  text: string;
  url?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'link';
  size?: 'small' | 'medium' | 'large';
  icon?: string;
  iconPosition?: 'left' | 'right';
}

export interface DIRImageNode extends DIRNodeBase {
  kind: 'image';
  assetId?: string;
  alt?: string;
  caption?: string;
  objectFit?: 'cover' | 'contain' | 'fill' | 'none';
  aspectRatio?: string;
  url?: string;
  path?: string;
  width?: number;
  height?: number;
}

export interface DIRIconNode extends DIRNodeBase {
  kind: 'icon';
  iconName?: string;
  iconLibrary?: string;
}

export interface DIRIconTextNode extends DIRNodeBase {
  kind: 'icon-text';
  iconName?: string;
  iconLibrary?: string;
  text: string;
  title?: string;
}

export interface DIRLinkNode extends DIRNodeBase {
  kind: 'link';
  text: string;
  url?: string;
}

export interface DIRListItemNode extends DIRNodeBase {
  kind: 'list-item';
  text: string;
  icon?: string;
}

export interface DIRListNode extends DIRNodeBase {
  kind: 'list';
  ordered?: boolean;
  children: DIRListItemNode[];
}

export interface DIRDividerNode extends DIRNodeBase {
  kind: 'divider';
  thickness?: number;
}

export interface DIRSpacerNode extends DIRNodeBase {
  kind: 'spacer';
  height: number;
}

export interface DIRCardNode extends DIRNodeBase {
  kind: 'card';
  children: DIRNode[];
}

export interface DIRFormNode extends DIRNodeBase {
  kind: 'form';
  children: DIRNode[];
}

export interface DIRInputNode extends DIRNodeBase {
  kind: 'input';
  inputType?: 'text' | 'email' | 'password' | 'textarea' | 'select' | 'checkbox' | 'radio';
  placeholder?: string;
  label?: string;
}

export interface DIRVideoNode extends DIRNodeBase {
  kind: 'video';
  url?: string;
  provider?: 'youtube' | 'vimeo' | 'self-hosted';
}

export interface DIRMapNode extends DIRNodeBase {
  kind: 'map';
  location?: string;
}

export interface DIRSocialIconsNode extends DIRNodeBase {
  kind: 'social-icons';
  platforms: Array<{ name: string; url?: string }>;
}

export interface DIRCounterNode extends DIRNodeBase {
  kind: 'counter';
  value: number;
  startingNumber?: number;
  suffix?: string;
  prefix?: string;
  title?: string;
}

export interface DIRProgressBarNode extends DIRNodeBase {
  kind: 'progress-bar';
  value: number;
  max?: number;
}

export interface DIRTabsNode extends DIRNodeBase {
  kind: 'tabs';
  items: Array<{ title: string; content: string }>;
}

export interface DIRAccordionNode extends DIRNodeBase {
  kind: 'accordion';
  items: Array<{ title: string; content: string }>;
}

export interface DIRRatingNode extends DIRNodeBase {
  kind: 'rating';
  rating: number;
  maxRating?: number;
}

export interface DIRBadgeNode extends DIRNodeBase {
  kind: 'badge';
  text: string;
  badgeStyle?: 'pill' | 'rectangle';
}

export interface DIRImageBoxNode extends DIRNodeBase {
  kind: 'image-box';
  assetId?: string;
  title?: string;
  description?: string;
}

export interface DIRUnknownNode extends DIRNodeBase {
  kind: 'unknown';
  raw?: Record<string, unknown>;
}

export type DIRNode =
  | DIRContainerNode
  | DIRFlexGroupNode
  | DIRGridGroupNode
  | DIRHeadingNode
  | DIRTextNode
  | DIRButtonNode
  | DIRImageNode
  | DIRIconNode
  | DIRIconTextNode
  | DIRLinkNode
  | DIRListNode
  | DIRListItemNode
  | DIRDividerNode
  | DIRSpacerNode
  | DIRCardNode
  | DIRFormNode
  | DIRInputNode
  | DIRVideoNode
  | DIRMapNode
  | DIRSocialIconsNode
  | DIRCounterNode
  | DIRProgressBarNode
  | DIRTabsNode
  | DIRAccordionNode
  | DIRRatingNode
  | DIRBadgeNode
  | DIRImageBoxNode
  | DIRUnknownNode;

