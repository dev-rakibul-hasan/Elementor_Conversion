/**
 * Design Intermediate Representation (DIR) — Authoritative TypeScript Types
 * 
 * This is the canonical DIR schema for the Design-to-Elementor pipeline.
 * The DIR is a structured JSON representation of a webpage design analyzed
 * from a screenshot/image. It captures layout hierarchy, content, styles,
 * and responsive behavior observations.
 * 
 * IMPORTANT: Do not create parallel IR/DIR schemas. This is THE contract.
 */

// ─── Core Types ──────────────────────────────────────────────────────

export type DIRVersion = '1.0.0';

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

export interface DIRDocument {
  version: DIRVersion;
  meta: DIRMeta;
  breakpoints: DIRBreakpoints;
  globals: DIRGlobals;
  assets: DIRAsset[];
  pages: DIRPage[];
  canvas_bounds?: DIRCanvasBounds;
}

export interface DIRMeta {
  sourceImageHash: string;
  sourceWidth: number;
  sourceHeight: number;
  analysisProvider: string;
  analysisModel: string;
  analysisTimestamp: string;
  confidenceScore: number; // 0-1
  schemaVersion: DIRVersion;
  promptVersion: string;
  elementorVersion?: string;
  notes?: string[];
}

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
  primary?: string;
  secondary?: string;
  accent?: string;
  background: string;
  surface?: string;
  text: string;
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

export interface DIRAsset {
  id: string;
  type: 'image' | 'icon' | 'logo' | 'background' | 'video' | 'placeholder';
  role: string;
  sourceRect?: DIRRect;
  description?: string;
  placeholder?: string;
  confidence: number; // 0-1
  width?: number;
  height?: number;
  seed?: number;
  prompt?: string;
  generated?: boolean;
  composite_graphic_asset?: boolean;
  metadata?: Record<string, any>;
}

export interface DIRRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Pages ───────────────────────────────────────────────────────────

export interface DIRPage {
  id: string;
  name: string;
  sections: DIRSection[];
}

// ─── Sections ────────────────────────────────────────────────────────

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
  direction?: 'row' | 'column';
  gap?: number;
  justifyContent?: string;
  alignItems?: string;
  layout_tree?: Record<string, any>;
}

// ─── Nodes ───────────────────────────────────────────────────────────

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
  | 'testimonial'
  | 'toggle'
  | 'gallery'
  | 'image-gallery'
  | 'unknown';

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
  layout_tree?: Record<string, any>;
}

// ─── Layout Nodes ────────────────────────────────────────────────────

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

// ─── Content Nodes ───────────────────────────────────────────────────

export interface DIRHeadingNode extends DIRNodeBase {
  kind: 'heading';
  text: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  htmlTag?: string;
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
  width?: number;
  height?: number;
  seed?: number;
  prompt?: string;
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

export interface DIRListNode extends DIRNodeBase {
  kind: 'list';
  ordered?: boolean;
  children: DIRListItemNode[];
}

export interface DIRListItemNode extends DIRNodeBase {
  kind: 'list-item';
  text: string;
  icon?: string;
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
  suffix?: string;
  prefix?: string;
  title?: string;
}

export interface DIRProgressBarNode extends DIRNodeBase {
  kind: 'progress-bar';
  value: number;
  max?: number;
  label?: string;
}

export interface DIRTabsNode extends DIRNodeBase {
  kind: 'tabs';
  tabs: Array<{ title: string; children: DIRNode[] }>;
}

export interface DIRAccordionNode extends DIRNodeBase {
  kind: 'accordion';
  items: Array<{ title: string; children: DIRNode[] }>;
}

export interface DIRRatingNode extends DIRNodeBase {
  kind: 'rating';
  value: number;
  max?: number;
}

export interface DIRBadgeNode extends DIRNodeBase {
  kind: 'badge';
  text: string;
}

export interface DIRUnknownNode extends DIRNodeBase {
  kind: 'unknown';
  description?: string;
  children?: DIRNode[];
}

// ─── Union Type ──────────────────────────────────────────────────────

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
  | DIRUnknownNode;

// ─── Styles ──────────────────────────────────────────────────────────

export interface DIRStyles {
  // Layout
  width?: string | number;
  height?: string | number;
  minWidth?: string | number;
  maxWidth?: string | number;
  minHeight?: string | number;
  maxHeight?: string | number;
  
  // Spacing
  padding?: DIRSpacing;
  margin?: DIRSpacing;
  gap?: number;

  // Background
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundGradient?: string;
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

  // Border
  borderWidth?: number;
  borderColor?: string;
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'none';
  borderRadius?: number | DIRCorners;

  // Shadow
  boxShadow?: string;
  textShadow?: string;

  // Display & Position
  display?: string;
  position?: string;
  overflow?: string;
  opacity?: number;
  zIndex?: number;

  // Flex properties
  flexDirection?: 'row' | 'column';
  justifyContent?: string;
  alignItems?: string;
  alignSelf?: string;
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: string;
  flexWrap?: 'wrap' | 'nowrap';
}

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

