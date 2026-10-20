/**
 * Elementor Module — Authoritative TypeScript Type Definitions
 * 
 * Defines standard Elementor data structures, widget profile contracts,
 * registry interfaces, and conversion report models for the Design-to-Elementor pipeline.
 */

import type {
  DIRDocument,
  DIRNode,
  DIRSection,
  DIRStyles,
  DIRSpacing,
  DIRCorners,
  DIRAsset,
} from '../dir/types.js';

// ─── 1. Elementor JSON Document Types ─────────────────────────────────────────

export type ElementorElementType = 'container' | 'widget' | 'section' | 'column';

export interface ElementorElement {
  id: string; // 8-character hex string (e.g., 'a1b2c3d4')
  elType: ElementorElementType;
  widgetType?: string; // Required when elType is 'widget'
  isInner?: boolean;
  settings: Record<string, any>;
  elements: ElementorElement[];
}

export interface ElementorDocument {
  version: string; // Typically '0.4'
  elementor_version?: string; // Explicit plugin version e.g. '3.24.7'
  wp_version?: string; // e.g. '6.6.2'
  title: string;
  type: 'page' | 'post' | 'header' | 'footer' | 'popup' | 'section' | 'single' | 'archive' | string;
  page_settings?: Record<string, any>;
  content: ElementorElement[];
}

// ─── 2. Elementor Setting Primitives ─────────────────────────────────────────

export interface ElementorDimension {
  unit?: 'px' | '%' | 'em' | 'rem' | 'vh' | 'vw' | 'fr' | string;
  size?: number;
  sizes?: any[];
  column?: string;
  row?: string;
  isLinked?: boolean;
}

export interface ElementorSpacingSetting {
  unit?: 'px' | '%' | 'em' | 'rem' | string;
  top?: string | number;
  right?: string | number;
  bottom?: string | number;
  left?: string | number;
  isLinked?: boolean;
}

export interface ElementorImageSetting {
  url: string;
  id?: string | number;
  alt?: string;
  source?: 'library' | 'custom' | string;
}

export interface ElementorIconSetting {
  value: string; // e.g. "fas fa-check"
  library: string; // e.g. "fa-solid", "fa-regular", "fa-brands"
}

export interface ElementorLinkSetting {
  url: string;
  is_external?: boolean | string;
  nofollow?: boolean | string;
  custom_attributes?: string;
}

export interface ElementorBoxShadowSetting {
  horizontal?: number;
  vertical?: number;
  blur?: number;
  spread?: number;
  color?: string;
  position?: 'outline' | 'inset';
}

export interface ElementorTypographySettings {
  typography_typography?: 'custom' | 'default';
  typography_font_family?: string;
  typography_font_size?: ElementorDimension;
  typography_font_size_tablet?: ElementorDimension;
  typography_font_size_mobile?: ElementorDimension;
  typography_font_weight?: string | number;
  typography_text_transform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize' | string;
  typography_font_style?: 'normal' | 'italic' | 'oblique' | string;
  typography_text_decoration?: 'none' | 'underline' | 'overline' | 'line-through' | string;
  typography_line_height?: ElementorDimension;
  typography_line_height_tablet?: ElementorDimension;
  typography_line_height_mobile?: ElementorDimension;
  typography_letter_spacing?: ElementorDimension;
  typography_letter_spacing_tablet?: ElementorDimension;
  typography_letter_spacing_mobile?: ElementorDimension;
  typography_word_spacing?: ElementorDimension;
}

export interface ElementorContainerSettings {
  content_width?: 'boxed' | 'full';
  boxed_width?: ElementorDimension;
  width?: ElementorDimension;
  min_height?: ElementorDimension;
  container_type?: 'flex' | 'grid';
  
  // Flex layout
  flex_direction?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  flex_direction_tablet?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  flex_direction_mobile?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  flex_justify_content?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly';
  flex_align_items?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
  flex_wrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
  flex_gap?: ElementorDimension;
  flex_gap_tablet?: ElementorDimension;
  flex_gap_mobile?: ElementorDimension;

  // Grid layout
  grid_columns_grid?: ElementorDimension;
  grid_columns_grid_tablet?: ElementorDimension;
  grid_columns_grid_mobile?: ElementorDimension;
  grid_rows_grid?: ElementorDimension;
  grid_gap?: {
    unit?: string;
    column?: string | number;
    row?: string | number;
    isLinked?: boolean;
  };

  // Box styles
  padding?: ElementorSpacingSetting;
  padding_tablet?: ElementorSpacingSetting;
  padding_mobile?: ElementorSpacingSetting;
  margin?: ElementorSpacingSetting;
  margin_tablet?: ElementorSpacingSetting;
  margin_mobile?: ElementorSpacingSetting;

  background_background?: 'classic' | 'gradient';
  background_color?: string;
  background_image?: ElementorImageSetting;
  background_position?: string;
  background_repeat?: string;
  background_size?: string;

  border_border?: 'solid' | 'double' | 'dotted' | 'dashed' | 'groove' | 'none' | string;
  border_width?: ElementorSpacingSetting;
  border_color?: string;
  border_radius?: ElementorSpacingSetting;

  box_shadow_box_shadow_type?: 'yes' | '';
  box_shadow_box_shadow?: ElementorBoxShadowSetting;
  
  // Semantic tags and classes
  html_tag?: string;
  css_classes?: string;
  _css_id?: string;
  _section_role?: string;
}

// ─── 3. Widget Registry & Profile Contracts ──────────────────────────────────

export type ControlType =
  | 'text'
  | 'textarea'
  | 'wysiwyg'
  | 'number'
  | 'select'
  | 'choose'
  | 'color'
  | 'media'
  | 'icons'
  | 'slider'
  | 'dimensions'
  | 'repeater'
  | 'switcher'
  | 'box_shadow'
  | 'popover_toggle'
  | 'typography'
  | 'heading'
  | string;

export interface ControlDef {
  id: string;
  type: ControlType;
  default?: any;
  responsive?: boolean;
  selectors?: Record<string, string>;
  label?: string;
  options?: Record<string, string>;
  fields?: ControlDef[]; // Used for repeater items
  condition?: Record<string, any>;
  description?: string;
}

export interface WidgetProfile {
  slug: string;
  name: string;
  category: 'basic' | 'general' | 'theme-elements' | 'pro-elements' | 'woocommerce-elements' | string;
  controls: ControlDef[];
  defaults: Record<string, any>;
  supportedInCore: boolean;
  isPro?: boolean;
  isThirdParty?: boolean;
  description?: string;
  icon?: string;
  keywords?: string[];
}

export type WidgetRegistry = Map<string, WidgetProfile> | any;

// ─── 4. Diagnostics & Conversion Report ──────────────────────────────────────

export interface ConversionDiagnostic {
  nodeId?: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  code?: string;
  details?: any;
}

export interface ConversionReport {
  widgetsUsed: string[];
  unsupportedFeatures: string[];
  warnings: string[];
  elementCount: number;
  containerCount: number;
  totalContainers?: number;
  widgetCount: number;
  totalWidgets?: number;
  diagnostics: ConversionDiagnostic[];
  responsiveStats?: {
    explicitOverridesCount: number;
    inferredOverridesCount: number;
    devicesTargeted: string[];
  };
}

// ─── 5. Conversion Options & Validator Results ───────────────────────────────

export interface ConversionOptions {
  targetProfile?: 'core' | 'pro';
  preferContainers?: boolean;
  pageTitle?: string;
  pageType?: string;
  includeDiagnostics?: boolean;
  assetUrlResolver?: (assetId: string) => string | undefined;
}

export interface ElementorValidationError {
  path: string;
  message: string;
  code: string;
  elementId?: string;
  widgetType?: string;
}

export interface ElementorValidationWarning {
  path: string;
  message: string;
  code: string;
  elementId?: string;
}

export interface ElementorValidationStats {
  totalElements: number;
  containers: number;
  widgets: number;
  widgetTypeCounts: Record<string, number>;
  maxDepth: number;
}

export interface ElementorValidationResult {
  valid: boolean;
  errors: ElementorValidationError[];
  warnings: ElementorValidationWarning[];
  stats: ElementorValidationStats;
}

// ─── 6. Skill Loader Types ───────────────────────────────────────────────────

export interface SkillPackMeta {
  name: string;
  version: string;
  description?: string;
  engineStandard?: string;
  targetProfile?: string;
  lastUpdated?: string;
  hash: string;
  instructionHash?: string;
}

export interface SkillPackResult {
  meta: SkillPackMeta;
  registry: WidgetRegistry;
  profilesCount: number;
  sourceDir?: string;
  operativeInstructions?: string;
  instructionPath?: string;
  warnings: string[];
  missingProfiles: string[];
  schemaMismatches: string[];
}

// Re-export DIR references for consumer convenience
export type { DIRDocument, DIRNode, DIRSection, DIRStyles, DIRSpacing, DIRCorners, DIRAsset };
