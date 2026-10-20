import type { DIRDocument, DIRNode, DIRSection, DIRStyles } from '../dir/types.js';
import { createHash } from 'node:crypto';
import {
  resolveDIRAssetReference,
  resolveImageAsset,
  resolvePublicAssetUrl,
} from './assets.js';

export interface ElementorElement extends Record<string, unknown> {
  id: string;
  elType: 'container' | 'widget';
  widgetType?: string;
  settings: Record<string, unknown>;
  elements: ElementorElement[];
  isInner?: boolean;
}

export interface ElementorMapperContext {
  document: DIRDocument;
  makeId(sourcePath: string): string;
  sectionRole: DIRSection['role'];
}

const FONT_ALIASES: Array<[RegExp, string]> = [
  [/jakarta/i, 'Plus Jakarta Sans'],
  [/inter|sans-serif|sans|clean/i, 'Inter'],
  [/poppins/i, 'Poppins'],
  [/montserrat/i, 'Montserrat'],
  [/roboto(?! mono)/i, 'Roboto'],
  [/outfit/i, 'Outfit'],
  [/serif|playfair/i, 'Playfair Display'],
  [/merriweather/i, 'Merriweather'],
  [/dm\s?sans/i, 'DM Sans'],
  [/lato/i, 'Lato'],
  [/open\s?sans/i, 'Open Sans'],
  [/raleway/i, 'Raleway'],
  [/work\s?sans/i, 'Work Sans'],
  [/space\s?gro/i, 'Space Grotesk'],
  [/syne/i, 'Syne'],
  [/clash/i, 'Clash Display'],
  [/satoshi/i, 'Satoshi'],
  [/manrope/i, 'Manrope'],
  [/urbanist/i, 'Urbanist'],
  [/mono/i, 'Roboto Mono'],
];

function normalizeFontFamily(value?: string): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/^['"]|['"]$/g, '').trim();
  return FONT_ALIASES.find(([pattern]) => pattern.test(cleaned))?.[1] ?? cleaned;
}

function parseUnitValue(value: string | number): { unit: string; size: number } | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { unit: 'px', size: value } : undefined;
  }

  const match = /^(-?\d+(?:\.\d+)?)\s*(px|%|vw|vh|em|rem)?$/i.exec(value.trim());
  if (!match) return undefined;
  const size = Number(match[1]);
  const unit = (match[2] || 'px').toLowerCase();
  return Number.isFinite(size) ? { unit, size } : undefined;
}

function spacingValue(value: DIRStyles['padding']): Record<string, unknown> | undefined {
  if (!value) return undefined;
  return {
    unit: 'px',
    top: value.top ?? 0,
    right: value.right ?? 0,
    bottom: value.bottom ?? 0,
    left: value.left ?? 0,
    isLinked: false,
  };
}

function mapFlexValue(value?: string): string | undefined {
  if (!value) return undefined;
  const values: Record<string, string> = {
    'flex-start': 'flex-start',
    start: 'flex-start',
    center: 'center',
    'flex-end': 'flex-end',
    end: 'flex-end',
    'space-between': 'space-between',
    'space-around': 'space-around',
    'space-evenly': 'space-evenly',
    stretch: 'stretch',
  };
  return values[value] ?? value;
}

function isTransparentColor(value?: string): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'transparent' || /^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(normalized);
}

function parseGradient(
  value: string | Record<string, unknown>
): { start: string; end: string; angle: number } | undefined {
  if (typeof value === 'string') {
    const colors = value.match(/#[0-9a-f]{3,8}\b/gi);
    const angle = /(-?\d+(?:\.\d+)?)\s*deg/i.exec(value);
    if (!colors || colors.length < 2) return undefined;
    return { start: colors[0]!, end: colors[1]!, angle: angle ? Number(angle[1]) : 180 };
  }

  const start = value.startColor ?? value.color1 ?? value.primary;
  const end = value.endColor ?? value.color2 ?? value.secondary;
  const angle = value.angle;
  if (
    typeof start !== 'string' ||
    typeof end !== 'string' ||
    (angle !== undefined && typeof angle !== 'number')
  ) {
    return undefined;
  }
  return { start, end, angle: typeof angle === 'number' ? angle : 180 };
}

function applyBackground(
  settings: Record<string, unknown>,
  styles: DIRStyles,
  context: ElementorMapperContext
): void {
  if (styles.backgroundGradient !== undefined) {
    const gradient = parseGradient(styles.backgroundGradient);
    if (!gradient) {
      throw new Error('Unsupported DIR backgroundGradient; expected two color stops and an optional angle');
    }
    settings.background_background = 'gradient';
    settings.background_color = gradient.start;
    settings.background_color_b = gradient.end;
    settings.background_gradient_type = 'linear';
    settings.background_gradient_angle = { unit: 'deg', size: gradient.angle };
    settings.background_color_stop = { unit: '%', size: 0 };
    settings.background_color_b_stop = { unit: '%', size: 100 };
    return;
  }

  const backgroundAsset = resolveDIRAssetReference(
    styles.backgroundImageAssetId,
    context.document
  );
  const imageUrl =
    backgroundAsset.url ?? resolvePublicAssetUrl(styles.backgroundImage);

  if (imageUrl) {
    settings.background_background = 'classic';
    settings.background_image = {
      url: imageUrl,
      id: backgroundAsset.wordpressAttachmentId ?? 0,
    };
    if (styles.backgroundColor) settings.background_color = styles.backgroundColor;
    if (styles.backgroundSize) settings.background_size = styles.backgroundSize;
    if (styles.backgroundPosition) settings.background_position = styles.backgroundPosition;
  } else if (styles.backgroundColor) {
    settings.background_background = 'classic';
    settings.background_color = styles.backgroundColor;
  }
}

function applyBoxStyles(
  settings: Record<string, unknown>,
  styles: DIRStyles,
  suffix = ''
): void {
  const padding = spacingValue(styles.padding);
  const margin = spacingValue(styles.margin);
  if (padding) settings[`padding${suffix}`] = padding;
  if (margin) settings[`margin${suffix}`] = margin;

  if (styles.width !== undefined) {
    const width = parseUnitValue(styles.width);
    if (width) settings[`width${suffix}`] = width;
  }
  if (styles.minWidth !== undefined) {
    const minWidth = parseUnitValue(styles.minWidth);
    if (minWidth) settings[`min_width${suffix}`] = minWidth;
  }
  if (styles.maxWidth !== undefined) {
    const maxWidth = parseUnitValue(styles.maxWidth);
    if (maxWidth) settings[`max_width${suffix}`] = maxWidth;
  }
  if (styles.minHeight !== undefined) {
    const minHeight = parseUnitValue(styles.minHeight);
    if (minHeight) settings[`min_height${suffix}`] = minHeight;
  }
  if (styles.height !== undefined) {
    const height = parseUnitValue(styles.height);
    if (height) settings[`height${suffix}`] = height;
  }
  if (styles.borderRadius !== undefined) {
    const radius =
      typeof styles.borderRadius === 'number'
        ? {
            unit: 'px',
            top: styles.borderRadius,
            right: styles.borderRadius,
            bottom: styles.borderRadius,
            left: styles.borderRadius,
            isLinked: true,
          }
        : {
            unit: 'px',
            top: styles.borderRadius.topLeft ?? 0,
            right: styles.borderRadius.topRight ?? 0,
            bottom: styles.borderRadius.bottomRight ?? 0,
            left: styles.borderRadius.bottomLeft ?? 0,
            isLinked: false,
          };
    settings[`border_radius${suffix}`] = radius;
  }
  if (styles.borderWidth !== undefined) {
    settings[`border_width${suffix}`] = {
      unit: 'px',
      top: styles.borderWidth,
      right: styles.borderWidth,
      bottom: styles.borderWidth,
      left: styles.borderWidth,
      isLinked: true,
    };
  }
  if (styles.borderColor) settings[`border_color${suffix}`] = styles.borderColor;
  if (styles.borderStyle) settings[`border_border${suffix}`] = styles.borderStyle;
  if (styles.boxShadow) settings[`box_shadow${suffix}`] = styles.boxShadow;
  if (styles.opacity !== undefined) settings[`opacity${suffix}`] = styles.opacity;
  if (styles.zIndex !== undefined) settings[`z_index${suffix}`] = styles.zIndex;
}

function applyTypography(
  settings: Record<string, unknown>,
  node: DIRNode,
  styles: DIRStyles,
  context: ElementorMapperContext,
  slug: string,
  suffix = ''
): void {
  const details = node.typography;
  const family = normalizeFontFamily(
    styles.fontFamily ??
      details?.font_family_guess ??
      (slug === 'heading' || slug === 'icon-box'
        ? context.document.globals.typography.headingFont
        : context.document.globals.typography.bodyFont) ??
      context.document.globals.typography.fontFamilies[0]
  );
  const fontSize = styles.fontSize ?? details?.font_size_px;
  const fontWeight = styles.fontWeight ?? details?.font_weight;
  const lineHeight = styles.lineHeight ?? details?.line_height_em;
  const letterSpacing = styles.letterSpacing ?? details?.letter_spacing_px;
  const color = styles.color ?? details?.color_hex ?? context.document.globals.colors.text;

  const typographyPrefixByWidget: Record<string, string> = {
    heading: 'typography',
    'text-editor': 'typography',
    button: 'typography',
    'icon-list': 'typography',
    counter: 'typography_number',
    'icon-box': 'title_typography',
  };
  const typographyPrefix = typographyPrefixByWidget[slug];
  const colorKeysByWidget: Record<string, string[]> = {
    heading: ['title_color'],
    'text-editor': ['text_color'],
    button: ['button_text_color'],
    'icon-list': ['text_color'],
    counter: ['number_color', 'title_color'],
    'icon-box': ['title_color'],
  }
  for (const key of colorKeysByWidget[slug] ?? []) {
    if (color) settings[`${key}${suffix}`] = color;
  }

  const hasTypography =
    family !== undefined ||
    fontSize !== undefined ||
    fontWeight !== undefined ||
    lineHeight !== undefined ||
    letterSpacing !== undefined ||
    styles.textTransform !== undefined;
  if (!typographyPrefix || !hasTypography) return;

  settings[`${typographyPrefix}_typography${suffix}`] = 'custom';
  if (family) settings[`${typographyPrefix}_font_family${suffix}`] = family;
  if (fontSize !== undefined) {
    settings[`${typographyPrefix}_font_size${suffix}`] = { unit: 'px', size: fontSize };
  }
  if (fontWeight !== undefined) {
    settings[`${typographyPrefix}_font_weight${suffix}`] = String(fontWeight);
  }
  if (lineHeight !== undefined) {
    const parsed = typeof lineHeight === 'number' ? lineHeight : Number(lineHeight);
    settings[`${typographyPrefix}_line_height${suffix}`] = {
      unit: 'em',
      size: Number.isFinite(parsed) ? parsed : lineHeight,
    };
  }
  if (letterSpacing !== undefined) {
    settings[`${typographyPrefix}_letter_spacing${suffix}`] = {
      unit: 'px',
      size: letterSpacing,
    };
  }
  if (styles.textTransform) {
    settings[`${typographyPrefix}_text_transform${suffix}`] = styles.textTransform;
  }
}

function applyResponsiveStyles(
  settings: Record<string, unknown>,
  node: DIRNode,
  context: ElementorMapperContext,
  slug?: string
): void {
  for (const device of ['tablet', 'mobile'] as const) {
    const styles = node.responsiveOverrides?.[device];
    if (!styles) continue;
    const suffix = device === 'tablet' ? '_tablet' : '_mobile';
    applyBoxStyles(settings, styles, suffix);
    if (styles.flexDirection) settings[`flex_direction${suffix}`] = styles.flexDirection;
    if (styles.justifyContent) {
      settings[`flex_justify_content${suffix}`] = mapFlexValue(styles.justifyContent);
    }
    if (styles.alignItems) settings[`flex_align_items${suffix}`] = mapFlexValue(styles.alignItems);
    if (styles.fontSize !== undefined && slug) {
      const prefix = slug === 'heading' ? 'typography' : 'typography';
      settings[`${prefix}_font_size${suffix}`] = { unit: 'px', size: styles.fontSize };
    }
    if (slug) applyTypography(settings, node, styles, context, slug, suffix);
  }
}

function createContainer(
  sourcePath: string,
  settings: Record<string, unknown>,
  elements: ElementorElement[],
  context: ElementorMapperContext
): ElementorElement {
  return {
    id: context.makeId(sourcePath),
    elType: 'container',
    settings,
    elements,
    isInner: false,
  };
}

function createWidget(
  sourcePath: string,
  widgetType: string,
  settings: Record<string, unknown>,
  context: ElementorMapperContext
): ElementorElement {
  return {
    id: context.makeId(sourcePath),
    elType: 'widget',
    widgetType,
    settings,
    elements: [],
  };
}

function applyContainerStyles(
  settings: Record<string, unknown>,
  node: DIRNode,
  context: ElementorMapperContext
): void {
  applyBoxStyles(settings, node.styles);
  applyBackground(settings, node.styles, context);
  const direction =
    node.styles.flexDirection ??
    (node.kind === 'container' || node.kind === 'flex-group' ? node.direction : undefined) ??
    (node.kind === 'grid-group' ? 'row' : 'column');
  settings.flex_direction = direction;
  settings.flex_wrap =
    (node.kind === 'container' || node.kind === 'flex-group') && node.wrap ? 'wrap' : 'nowrap';
  const gap =
    node.styles.gap ??
    (node.kind === 'container' || node.kind === 'flex-group' || node.kind === 'grid-group'
      ? node.gap
      : undefined);
  if (gap !== undefined) {
    settings.flex_gap = {
      column: { unit: 'px', size: gap },
      row: { unit: 'px', size: gap },
      isLinked: true,
    };
  }
  if (node.styles.justifyContent) {
    settings.flex_justify_content = mapFlexValue(node.styles.justifyContent);
  } else if (node.kind === 'flex-group' && node.justifyContent) {
    settings.flex_justify_content = mapFlexValue(node.justifyContent);
  }
  if (node.styles.alignItems) {
    settings.flex_align_items = mapFlexValue(node.styles.alignItems);
  } else if (node.kind === 'flex-group' && node.alignItems) {
    settings.flex_align_items = mapFlexValue(node.alignItems);
  }
  if (node.styles.alignSelf) settings.flex_align_self = mapFlexValue(node.styles.alignSelf);
  if (node.styles.overflow) settings.overflow = node.styles.overflow;
  if (node.kind === 'grid-group') settings.flex_wrap = 'wrap';

  if (node.styles.width !== undefined) {
    const width = parseUnitValue(node.styles.width);
    if (width && width.unit === 'px' && width.size > 360 && !node.responsiveOverrides?.mobile?.width) {
      settings.width_mobile = { unit: '%', size: 100 };
    }
  }
  applyResponsiveStyles(settings, node, context);
}

function layoutChildren(
  nodes: DIRNode[],
  path: string,
  context: ElementorMapperContext
): ElementorElement[] {
  return nodes.map((child, index) => mapDIRNode(child, `${path}/${index}-${child.id}`, context));
}

function makeLayout(
  node: DIRNode,
  path: string,
  context: ElementorMapperContext,
  children: DIRNode[]
): ElementorElement {
  const settings: Record<string, unknown> = { content_width: 'full' };
  applyContainerStyles(settings, node, context);
  return createContainer(path, settings, layoutChildren(children, path, context), context);
}

function mapWidgetStyles(
  settings: Record<string, unknown>,
  node: DIRNode,
  context: ElementorMapperContext,
  slug: string
): void {
  const style = node.styles;
  applyBoxStyles(settings, style);
  applyTypography(settings, node, style, context, slug);
  applyResponsiveStyles(settings, node, context, slug);
  if (
    style.textAlign &&
    ['heading', 'text-editor', 'button', 'image', 'divider', 'icon', 'social-icons', 'icon-list'].includes(slug)
  ) {
    settings.align = style.textAlign;
  }
  if (style.backgroundColor && slug === 'button') {
    settings.button_background_color = style.backgroundColor;
  }
  if (style.borderRadius !== undefined && slug === 'button') {
    const radius = typeof style.borderRadius === 'number' ? style.borderRadius : style.borderRadius.topLeft ?? 0;
    settings.button_border_radius = { unit: 'px', size: radius };
  }
}

function repeaterId(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 7);
}

function listItems(node: Extract<DIRNode, { kind: 'list' }>): Array<Record<string, unknown>> {
  return node.children.map((item, index) => ({
    _id: repeaterId(`${node.id}:${index}:${item.id}`),
    text: item.text,
    selected_icon: {
      value: item.icon || '',
      library: item.icon ? 'fa-solid' : '',
    },
    link: { url: '', is_external: '', nofollow: '' },
  }));
}

function mapDIRNode(node: DIRNode, path: string, context: ElementorMapperContext): ElementorElement {
  switch (node.kind) {
    case 'container':
    case 'flex-group':
    case 'card':
      return makeLayout(node, path, context, node.children);
    case 'grid-group': {
      const settings: Record<string, unknown> = { content_width: 'full' };
      applyContainerStyles(settings, node, context);
      settings.flex_wrap = 'wrap';
      const columns = Math.max(1, Math.floor(node.columns));
      const elements = node.children.map((child, index) => {
        const childSettings: Record<string, unknown> = {
          content_width: 'full',
          width: { unit: '%', size: 100 / columns },
          width_mobile: { unit: '%', size: 100 },
        };
        const mappedChild = mapDIRNode(child, `${path}/${index}-${child.id}`, context);
        return createContainer(
          `${path}/${index}-${child.id}/grid-cell`,
          childSettings,
          [mappedChild],
          context
        );
      });
      return createContainer(path, settings, elements, context);
    }
    case 'form':
      throw new Error(`DIR node "${node.id}" is a form; Elementor Core has no native form widget`);
    case 'input':
      throw new Error(`DIR node "${node.id}" is an input; Elementor Core has no native input widget`);
    case 'heading': {
      const settings: Record<string, unknown> = {
        title: node.text,
        header_size: `h${node.level}`,
      };
      mapWidgetStyles(settings, node, context, 'heading');
      return createWidget(path, 'heading', settings, context);
    }
    case 'text': {
      const settings: Record<string, unknown> = {
        editor: node.html || (node.text ? `<p>${node.text}</p>` : ''),
      };
      mapWidgetStyles(settings, node, context, 'text-editor');
      return createWidget(path, 'text-editor', settings, context);
    }
    case 'button': {
      const settings: Record<string, unknown> = {
        text: node.text,
        link: { url: node.url || '', is_external: '', nofollow: '' },
        size: node.size === 'small' ? 'sm' : node.size === 'large' ? 'lg' : 'md',
      };
      if (node.icon) {
        settings.selected_icon = { value: node.icon, library: 'fa-solid' };
        settings.icon_align = node.iconPosition === 'left' ? 'row-reverse' : 'row';
      }
      mapWidgetStyles(settings, node, context, 'button');
      return createWidget(path, 'button', settings, context);
    }
    case 'link': {
      const settings: Record<string, unknown> = {
        text: node.text,
        link: { url: node.url || '', is_external: '', nofollow: '' },
        size: 'sm',
        align: 'start',
      };
      mapWidgetStyles(settings, node, context, 'button');
      return createWidget(path, 'button', settings, context);
    }
    case 'image': {
      const asset = resolveImageAsset(node, context.document);
      const settings: Record<string, unknown> = {
        image: {
          id: asset.wordpressAttachmentId ?? 0,
          url: asset.url ?? '',
          alt: node.alt ?? '',
        },
        image_size: 'full',
        align: node.styles.textAlign || 'center',
        caption_source: 'none',
        link_to: 'none',
      };
      mapWidgetStyles(settings, node, context, 'image');
      return createWidget(path, 'image', settings, context);
    }
    case 'icon': {
      if (!node.iconName) {
        throw new Error(`DIR icon node "${node.id}" has no iconName`);
      }
      const settings: Record<string, unknown> = {
        selected_icon: {
          value: node.iconName,
          library: node.iconLibrary || 'fa-solid',
        },
        view: 'default',
      };
      mapWidgetStyles(settings, node, context, 'icon');
      return createWidget(path, 'icon', settings, context);
    }
    case 'icon-text': {
      if (!node.iconName) {
        throw new Error(`DIR icon-text node "${node.id}" has no iconName`);
      }
      const settings: Record<string, unknown> = {
        view: 'stacked',
        shape: 'circle',
        title_text: node.title || '',
        description_text: node.text,
        selected_icon: {
          value: node.iconName,
          library: node.iconLibrary || 'fa-solid',
        },
      };
      mapWidgetStyles(settings, node, context, 'icon-box');
      return createWidget(path, 'icon-box', settings, context);
    }
    case 'list': {
      const settings: Record<string, unknown> = {
      icon_list: listItems(node),
      view:
        context.sectionRole === 'header' || context.sectionRole === 'navigation'
          ? 'inline'
          : 'traditional',
      };
      if (settings.view === 'inline') {
        settings.space_between = node.styles.gap ?? 32;
        settings.align_self = 'center';
        settings._element_width = 'initial';
        settings._flex_shrink = 0;
        settings._flex_grow = 0;
        settings.link_click = 'full_width';
        const width = node.styles.width === undefined ? undefined : parseUnitValue(node.styles.width);
        if (width) settings.width = width;
      }
      mapWidgetStyles(settings, node, context, 'icon-list');
      return createWidget(path, 'icon-list', settings, context);
    }
    case 'list-item': {
      const settings: Record<string, unknown> = {
        icon_list: [
          {
            _id: repeaterId(node.id),
            text: node.text,
            selected_icon: {
              value: node.icon || '',
              library: node.icon ? 'fa-solid' : '',
            },
            link: { url: '', is_external: '', nofollow: '' },
          },
        ],
        view: 'traditional',
      };
      mapWidgetStyles(settings, node, context, 'icon-list');
      return createWidget(path, 'icon-list', settings, context);
    }
    case 'divider': {
      const settings: Record<string, unknown> = {
        style: node.styles.borderStyle || 'solid',
        weight: { unit: 'px', size: node.thickness ?? node.styles.borderWidth ?? 1 },
        align: 'center',
      };
      const dividerColor = node.styles.borderColor || context.document.globals.colors.border;
      if (dividerColor) settings.color = dividerColor;
      mapWidgetStyles(settings, node, context, 'divider');
      return createWidget(path, 'divider', settings, context);
    }
    case 'spacer': {
      const settings: Record<string, unknown> = { space: { unit: 'px', size: node.height } };
      mapWidgetStyles(settings, node, context, 'spacer');
      return createWidget(path, 'spacer', settings, context);
    }
    case 'video': {
      if (!node.url) throw new Error(`DIR video node "${node.id}" has no URL`);
      const provider =
        node.provider ||
        (/vimeo\.com/i.test(node.url)
          ? 'vimeo'
          : /youtube\.com|youtu\.be/i.test(node.url)
            ? 'youtube'
            : 'self-hosted');
      const videoType = provider === 'self-hosted' ? 'hosted' : provider;
      const urlKey = provider === 'vimeo' ? 'vimeo_url' : provider === 'self-hosted' ? 'hosted_url' : 'youtube_url';
      const settings: Record<string, unknown> = {
        video_type: videoType,
        [urlKey]: node.url,
        aspect_ratio: '169',
        controls: 'yes',
      };
      mapWidgetStyles(settings, node, context, 'video');
      return createWidget(path, 'video', settings, context);
    }
    case 'map': {
      if (!node.location) throw new Error(`DIR map node "${node.id}" has no location`);
      const settings: Record<string, unknown> = { address: node.location };
      mapWidgetStyles(settings, node, context, 'google_maps');
      return createWidget(path, 'google_maps', settings, context);
    }
    case 'social-icons': {
      const settings: Record<string, unknown> = {
        social_icon_list: node.platforms.map((platform, index) => ({
          _id: repeaterId(`${node.id}:${index}:${platform.name}`),
            social_icon: {
              value: `fab fa-${platform.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`,
              library: 'fa-brands',
            },
            link: { url: platform.url || '' },
          })),
        shape: 'circle',
        view: 'default',
      };
      mapWidgetStyles(settings, node, context, 'social-icons');
      return createWidget(path, 'social-icons', settings, context);
    }
    case 'counter': {
      const settings: Record<string, unknown> = {
        starting_number: node.startingNumber ?? 0,
        ending_number: node.value,
        prefix: node.prefix || '',
        suffix: node.suffix || '',
        title: node.title || '',
      };
      mapWidgetStyles(settings, node, context, 'counter');
      return createWidget(path, 'counter', settings, context);
    }
    case 'progress-bar': {
      const settings: Record<string, unknown> = {
        title: node.label || '',
        percent: {
          size: Math.min(100, Math.max(0, (node.value / (node.max || 100)) * 100)),
          unit: '%',
        },
        display_percentage: 'show',
      };
      mapWidgetStyles(settings, node, context, 'progress');
      return createWidget(path, 'progress', settings, context);
    }
    case 'tabs': {
      const settings: Record<string, unknown> = {
        tabs: node.items.map((item, index) => ({
          _id: repeaterId(`${node.id}:${index}:${item.title}`),
          tab_title: item.title,
          tab_content: item.content,
        })),
      };
      mapWidgetStyles(settings, node, context, 'tabs');
      return createWidget(path, 'tabs', settings, context);
    }
    case 'accordion': {
      const settings: Record<string, unknown> = {
        tabs: node.items.map((item, index) => ({
          _id: repeaterId(`${node.id}:${index}:${item.title}`),
          tab_title: item.title,
          tab_content: item.content,
        })),
      };
      mapWidgetStyles(settings, node, context, 'accordion');
      return createWidget(path, 'accordion', settings, context);
    }
    case 'rating': {
      const settings: Record<string, unknown> = {
        rating: node.rating,
        rating_scale: String(node.maxRating || 5),
        star_style: 'star_fontawesome',
        title: '',
        align: 'center',
      };
      mapWidgetStyles(settings, node, context, 'star-rating');
      return createWidget(path, 'star-rating', settings, context);
    }
    case 'badge': {
      const settings: Record<string, unknown> = {
        content_width: 'full',
        flex_direction: 'row',
        flex_justify_content: 'center',
        flex_align_items: 'center',
      };
      if (node.badgeStyle !== 'rectangle') {
        settings.border_radius = {
          unit: 'px',
          top: 9999,
          right: 9999,
          bottom: 9999,
          left: 9999,
          isLinked: true,
        };
      }
      if (node.styles.backgroundColor || context.document.globals.colors.primary) {
        settings.background_background = 'classic';
        settings.background_color = node.styles.backgroundColor || context.document.globals.colors.primary;
      }
      applyBoxStyles(settings, node.styles);
      const text: DIRNode = {
        id: `${node.id}-text`,
        kind: 'heading',
        text: node.text,
        level: 6,
        confidence: node.confidence,
        styles: { color: node.styles.color || context.document.globals.colors.text },
      };
      return createContainer(path, settings, [mapDIRNode(text, `${path}/badge-text`, context)], context);
    }
    case 'image-box': {
      const asset = resolveDIRAssetReference(node.assetId, context.document);
      const settings: Record<string, unknown> = {
        title_text: node.title || '',
        description_text: node.description || '',
        image: { id: asset.wordpressAttachmentId ?? 0, url: asset.url ?? '' },
        position: 'top',
      };
      mapWidgetStyles(settings, node, context, 'icon-box');
      return createWidget(path, 'image-box', settings, context);
    }
    case 'unknown':
      throw new Error(`Unsupported DIR node kind "unknown" for node "${node.id}"`);
    default: {
      const exhaustive: never = node;
      throw new Error(`Unsupported DIR node: ${String(exhaustive)}`);
    }
  }
}

export function mapDIRSection(
  section: DIRSection,
  path: string,
  context: ElementorMapperContext
): ElementorElement {
  const styles = { ...section.styles };
  if (!styles.backgroundColor || isTransparentColor(styles.backgroundColor)) {
    styles.backgroundColor = context.document.globals.colors.background;
  }

  const sectionNode: DIRNode = {
    id: section.id,
    kind: 'container',
    confidence: section.confidence,
    styles,
    direction: styles.flexDirection || 'column',
    responsiveOverrides: section.responsiveOverrides,
    children: section.children,
  };
  const sectionContext = { ...context, sectionRole: section.role };
  const settings: Record<string, unknown> = { content_width: 'full' };
  applyContainerStyles(settings, sectionNode, sectionContext);
  if (section.canvas_bounds?.inner_bg_type === 'gradient') {
    const gradient = {
      start: section.canvas_bounds.primary_hex || context.document.globals.colors.background,
      end: section.canvas_bounds.secondary_hex || context.document.globals.colors.background,
      angle: section.canvas_bounds.gradient_angle ?? 180,
    };
    settings.background_background = 'gradient';
    settings.background_color = gradient.start;
    settings.background_color_b = gradient.end;
    settings.background_gradient_type = 'linear';
    settings.background_gradient_angle = { unit: 'deg', size: gradient.angle };
    settings.background_color_stop = { unit: '%', size: 0 };
    settings.background_color_b_stop = { unit: '%', size: 100 };
  } else {
    applyBackground(settings, styles, sectionContext);
  }

  return createContainer(
    path,
    settings,
    layoutChildren(section.children, path, sectionContext),
    context
  );
}
