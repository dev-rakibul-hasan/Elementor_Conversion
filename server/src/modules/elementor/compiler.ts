import type {
  ElementorAssetManifest,
  NativeElementorTemplate,
} from '../../contracts/api.js';
import type {
  IElementorCompilerAdapter,
} from '../orchestration/adapters.js';
import type {
  Stage5ElementorGenerationInput,
  Stage5ElementorGenerationOutput,
} from '../orchestration/registry.js';
import { createElementorAssetManifest } from './assets.js';
import { createElementorIdFactory } from './ids.js';
import { mapDIRSection } from './mapper.js';
import { validateElementorTemplate } from './validator.js';

function createPageSettings(
  background: string,
  canvasBounds: Stage5ElementorGenerationInput['validatedDIRDocument']['canvas_bounds']
): Record<string, unknown> {
  const settings: Record<string, unknown> = {
    template: 'elementor_canvas',
    background_background: 'classic',
    background_color: background,
  };

  if (
    canvasBounds?.inner_bg_type === 'gradient' &&
    canvasBounds.primary_hex &&
    canvasBounds.secondary_hex
  ) {
    settings.background_background = 'gradient';
    settings.background_color = canvasBounds.primary_hex;
    settings.background_color_b = canvasBounds.secondary_hex;
    settings.background_gradient_type = 'linear';
    settings.background_gradient_angle = {
      unit: 'deg',
      size: canvasBounds.gradient_angle ?? 180,
    };
    settings.background_color_stop = { unit: '%', size: 0 };
    settings.background_color_b_stop = { unit: '%', size: 100 };
  } else if (canvasBounds?.primary_hex) {
    settings.background_color = canvasBounds.primary_hex;
  }

  return settings;
}

export interface CompiledElementorTemplate {
  template: NativeElementorTemplate;
  assetManifest: ElementorAssetManifest;
  totalSections: number;
  totalContainers: number;
  totalWidgets: number;
  widgetSlugs: string[];
}

export function compileDIRToElementor(
  document: Stage5ElementorGenerationInput['validatedDIRDocument']
): CompiledElementorTemplate {
  if (document.pages.length !== 1) {
    throw new Error(
      `Cannot compile DIR: one Elementor page template requires exactly one DIR page; received ${document.pages.length}`
    );
  }

  const makeId = createElementorIdFactory();
  const content = document.pages.flatMap((page, pageIndex) =>
    page.sections.map((section, sectionIndex) =>
      mapDIRSection(
        section,
        `${pageIndex}-${page.id}/${sectionIndex}-${section.id}`,
        {
          document,
          makeId,
          sectionRole: section.role,
        }
      )
    )
  );

  const template: NativeElementorTemplate = {
    version: '0.4',
    title: document.pages[0]?.name || 'Elementor Template',
    type: 'page',
    page_settings: createPageSettings(document.globals.colors.background, document.canvas_bounds),
    content,
  };
  const validation = validateElementorTemplate(template);
  if (!validation.valid) {
    throw new Error(`Compiled Elementor template is invalid: ${validation.errors.join('; ')}`);
  }

  return {
    template,
    assetManifest: createElementorAssetManifest(document),
    totalSections: document.pages.reduce((total, page) => total + page.sections.length, 0),
    totalContainers: validation.containerCount,
    totalWidgets: validation.widgetCount,
    widgetSlugs: validation.widgetSlugs,
  };
}

export class ElementorCompilerAdapter implements IElementorCompilerAdapter {
  public async compileToElementor(
    input: Stage5ElementorGenerationInput,
    _signal?: AbortSignal
  ): Promise<Stage5ElementorGenerationOutput> {
    const result = compileDIRToElementor(input.validatedDIRDocument);
    return {
      elementorTemplate: result.template,
      assetManifest: result.assetManifest,
      totalSections: result.totalSections,
      totalContainers: result.totalContainers,
      totalWidgets: result.totalWidgets,
      widgetSlugs: result.widgetSlugs,
      compiledAt: new Date().toISOString(),
    };
  }
}
