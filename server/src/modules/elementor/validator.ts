import type { NativeElementorTemplate } from '../../contracts/api.js';

const SUPPORTED_WIDGETS = new Set([
  'accordion',
  'button',
  'counter',
  'divider',
  'google_maps',
  'heading',
  'icon',
  'icon-box',
  'icon-list',
  'image',
  'image-box',
  'progress',
  'social-icons',
  'spacer',
  'star-rating',
  'tabs',
  'text-editor',
  'video',
]);

export interface ElementorValidationResult {
  valid: boolean;
  errors: string[];
  elementCount: number;
  containerCount: number;
  widgetCount: number;
  widgetSlugs: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateWidgetSettings(
  widgetType: string,
  settings: Record<string, unknown>,
  path: string,
  errors: string[]
): void {
  if (widgetType === 'heading' && typeof settings.title !== 'string') {
    errors.push(`${path}.settings.title must be a string`);
  }
  if (widgetType === 'text-editor' && typeof settings.editor !== 'string') {
    errors.push(`${path}.settings.editor must be a string`);
  }
  if (
    widgetType === 'button' &&
    (typeof settings.text !== 'string' || !isRecord(settings.link) || typeof settings.link.url !== 'string')
  ) {
    errors.push(`${path} button requires text and a link.url string`);
  }
  if (widgetType === 'image' || widgetType === 'image-box') {
    if (!isRecord(settings.image)) {
      errors.push(`${path}.settings.image must be a media object`);
    } else if (typeof settings.image.url !== 'string' || typeof settings.image.id !== 'number') {
      errors.push(`${path}.settings.image requires string url and numeric id`);
    }
  }
  if (widgetType === 'icon' || widgetType === 'icon-box') {
    if (!isRecord(settings.selected_icon) || typeof settings.selected_icon.value !== 'string') {
      errors.push(`${path}.settings.selected_icon must contain an icon value`);
    }
  }
  if (widgetType === 'icon-list' || widgetType === 'social-icons') {
    const repeaterKey = widgetType === 'icon-list' ? 'icon_list' : 'social_icon_list';
    const rows = settings[repeaterKey];
    if (!Array.isArray(rows)) {
      errors.push(`${path}.settings.${repeaterKey} must be an array`);
    } else {
      rows.forEach((row, index) => {
        if (!isRecord(row) || typeof row._id !== 'string') {
          errors.push(`${path}.settings.${repeaterKey}[${index}] must have a repeater _id`);
        }
      });
    }
  }
  if (widgetType === 'counter' && typeof settings.ending_number !== 'number') {
    errors.push(`${path}.settings.ending_number must be a number`);
  }
  if (widgetType === 'progress') {
    if (!isRecord(settings.percent) || typeof settings.percent.size !== 'number') {
      errors.push(`${path}.settings.percent must contain a numeric size`);
    }
  }
  if (widgetType === 'star-rating' && typeof settings.rating !== 'number') {
    errors.push(`${path}.settings.rating must be a number`);
  }
  if (widgetType === 'image-box') {
    if (typeof settings.title_text !== 'string' || typeof settings.description_text !== 'string') {
      errors.push(`${path} image-box requires title_text and description_text strings`);
    }
  }
  if (widgetType === 'icon-box') {
    if (typeof settings.title_text !== 'string' || typeof settings.description_text !== 'string') {
      errors.push(`${path} icon-box requires title_text and description_text strings`);
    }
  }
  if (widgetType === 'tabs' || widgetType === 'accordion') {
    if (!Array.isArray(settings.tabs)) {
      errors.push(`${path}.settings.tabs must be an array`);
    } else {
      settings.tabs.forEach((tab, index) => {
        if (
          !isRecord(tab) ||
          typeof tab._id !== 'string' ||
          typeof tab.tab_title !== 'string' ||
          typeof tab.tab_content !== 'string'
        ) {
          errors.push(`${path}.settings.tabs[${index}] requires _id, tab_title, and tab_content`);
        }
      });
    }
  }
  if (widgetType === 'video') {
    const type = settings.video_type;
    const urlKey = type === 'vimeo' ? 'vimeo_url' : type === 'hosted' ? 'hosted_url' : 'youtube_url';
    if (typeof settings[urlKey] !== 'string' || settings[urlKey] === '') {
      errors.push(`${path}.settings.${urlKey} must be a non-empty string`);
    }
  }
  if (widgetType === 'google_maps' && typeof settings.address !== 'string') {
    errors.push(`${path}.settings.address must be a string`);
  }
}

export function validateElementorTemplate(
  template: NativeElementorTemplate
): ElementorValidationResult {
  const errors: string[] = [];
  const usedIds = new Set<string>();
  const widgetSlugs = new Set<string>();
  let elementCount = 0;
  let containerCount = 0;
  let widgetCount = 0;

  if (!isRecord(template)) {
    return {
      valid: false,
      errors: ['Template root must be an object'],
      elementCount,
      containerCount,
      widgetCount,
      widgetSlugs: [],
    };
  }
  if (typeof template.version !== 'string' || template.version === '') {
    errors.push('Template version must be a non-empty string');
  }
  if (typeof template.title !== 'string' || template.title === '') {
    errors.push('Template title must be a non-empty string');
  }
  if (template.type !== 'page') {
    errors.push('Template type must be "page"');
  }
  if (!Array.isArray(template.content) || template.content.length === 0) {
    errors.push('Template content must be a non-empty array');
  }
  if (!isRecord(template.page_settings)) {
    errors.push('Template page_settings must be an object');
  } else if (template.page_settings.template !== 'elementor_canvas') {
    errors.push('Template page_settings.template must be "elementor_canvas"');
  }

  const visit = (candidate: unknown, path: string): void => {
    if (!isRecord(candidate)) {
      errors.push(`${path} must be an element object`);
      return;
    }
    elementCount += 1;

    if (typeof candidate.id !== 'string' || candidate.id.length !== 8 || !/^[a-f0-9]{8}$/.test(candidate.id)) {
      errors.push(`${path}.id must be an 8-character lowercase hexadecimal Elementor ID`);
    } else if (usedIds.has(candidate.id)) {
      errors.push(`${path}.id duplicates "${candidate.id}"`);
    } else {
      usedIds.add(candidate.id);
    }

    if (candidate.elType === 'section' || candidate.elType === 'column') {
      errors.push(`${path} uses legacy "${candidate.elType}"; use modern containers`);
      return;
    }
    if (candidate.elType !== 'container' && candidate.elType !== 'widget') {
      errors.push(`${path}.elType must be "container" or "widget"`);
      return;
    }
    if (!isRecord(candidate.settings)) {
      errors.push(`${path}.settings must be an object`);
    }
    if (!Array.isArray(candidate.elements)) {
      errors.push(`${path}.elements must be an array`);
      return;
    }

    if (candidate.elType === 'container') {
      containerCount += 1;
      if ('widgetType' in candidate) errors.push(`${path} container must not define widgetType`);
    } else {
      widgetCount += 1;
      if (typeof candidate.widgetType !== 'string' || !SUPPORTED_WIDGETS.has(candidate.widgetType)) {
        errors.push(`${path}.widgetType is not a supported Elementor Core widget slug`);
      } else {
        widgetSlugs.add(candidate.widgetType);
        if (isRecord(candidate.settings)) {
          validateWidgetSettings(candidate.widgetType, candidate.settings, path, errors);
        }
      }
      if (candidate.elements.length > 0) {
        errors.push(`${path} widget elements must be empty for classic Elementor widgets`);
      }
    }

    candidate.elements.forEach((child, index) => visit(child, `${path}.elements[${index}]`));
  };

  if (Array.isArray(template.content)) {
    template.content.forEach((element, index) => {
      if (!isRecord(element) || element.elType !== 'container') {
        errors.push(`content[${index}] must be a top-level section container`);
      }
      visit(element, `content[${index}]`);
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    elementCount,
    containerCount,
    widgetCount,
    widgetSlugs: [...widgetSlugs].sort(),
  };
}

export function serializeElementorTemplate(template: NativeElementorTemplate): string {
  const result = validateElementorTemplate(template);
  if (!result.valid) {
    throw new Error(`Cannot export invalid Elementor JSON: ${result.errors.join('; ')}`);
  }
  return JSON.stringify(template, null, 2);
}
