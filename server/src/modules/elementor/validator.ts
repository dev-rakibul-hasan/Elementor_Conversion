/**
 * Elementor Module — Validator
 * Validates Elementor documents, checking element IDs, unique constraints,
 * valid elTypes, widget registration, and nesting structure.
 */

import type {
  ElementorValidationResult,
  ElementorValidationError,
  ElementorValidationWarning,
  ElementorValidationStats,
} from './types.js';
import { getRegistry } from './registry.js';

export class ElementorValidator {
  private registry = getRegistry();

  public validate(document: any): ElementorValidationResult {
    const errors: ElementorValidationError[] = [];
    const warnings: ElementorValidationWarning[] = [];
    const stats: ElementorValidationStats = {
      totalElements: 0,
      containers: 0,
      widgets: 0,
      widgetTypeCounts: {},
      maxDepth: 0,
    };

    if (!document || typeof document !== 'object') {
      errors.push({
        path: '',
        message: 'Document must be a non-null object',
        code: 'INVALID_DOCUMENT',
      });
      return { valid: false, errors, warnings, stats };
    }

    if (!document.version) {
      warnings.push({
        path: 'version',
        message: 'Missing document version',
        code: 'MISSING_VERSION',
      });
    }

    if (!Array.isArray(document.content)) {
      errors.push({
        path: 'content',
        message: 'Document content must be an array of elements',
        code: 'INVALID_CONTENT',
      });
      return { valid: false, errors, warnings, stats };
    }

    const seenIds = new Set<string>();

    const traverse = (element: any, path: string, depth: number) => {
      stats.totalElements++;
      if (depth > stats.maxDepth) {
        stats.maxDepth = depth;
      }

      if (!element || typeof element !== 'object') {
        errors.push({
          path,
          message: 'Element must be an object',
          code: 'INVALID_ELEMENT',
        });
        return;
      }

      // Check ID
      if (!element.id || typeof element.id !== 'string') {
        errors.push({
          path: `${path}.id`,
          message: 'Element missing valid id string',
          code: 'MISSING_ELEMENT_ID',
        });
      } else {
        if (seenIds.has(element.id)) {
          errors.push({
            path: `${path}.id`,
            message: `Duplicate element ID "${element.id}" detected`,
            code: 'DUPLICATE_ELEMENT_ID',
            elementId: element.id,
          });
        }
        seenIds.add(element.id);
      }

      // Check elType
      const validTypes = ['container', 'widget', 'section', 'column'];
      if (!element.elType || !validTypes.includes(element.elType)) {
        errors.push({
          path: `${path}.elType`,
          message: `Invalid or missing elType "${element.elType}". Must be one of: ${validTypes.join(', ')}`,
          code: 'INVALID_ELTYPE',
          elementId: element.id,
        });
      }

      if (element.elType === 'container' || element.elType === 'section' || element.elType === 'column') {
        stats.containers++;
        if (element.elType === 'section' || element.elType === 'column') {
          warnings.push({
            path: `${path}.elType`,
            message: `Legacy element type "${element.elType}" detected. Modern Elementor requires Flexbox Containers ("container").`,
            code: 'LEGACY_ELTYPE',
            elementId: element.id,
          });
        }
      }

      // Check widgetType
      if (element.elType === 'widget') {
        stats.widgets++;
        if (!element.widgetType || typeof element.widgetType !== 'string') {
          errors.push({
            path: `${path}.widgetType`,
            message: 'Widget elements must specify a widgetType string',
            code: 'MISSING_WIDGET_TYPE',
            elementId: element.id,
          });
        } else {
          stats.widgetTypeCounts[element.widgetType] = (stats.widgetTypeCounts[element.widgetType] || 0) + 1;

          if (!this.registry.has(element.widgetType)) {
            warnings.push({
              path: `${path}.widgetType`,
              message: `Unknown or unregistered widgetType "${element.widgetType}"`,
              code: 'UNKNOWN_WIDGET_TYPE',
              elementId: element.id,
            });
          }

          if (element.widgetType === 'html' || element.widgetType === 'shortcode') {
            const codeContent = element.settings?.html || element.settings?.shortcode || '';
            if (typeof codeContent === 'string' && /<(section|header|footer|nav)\b/i.test(codeContent)) {
              warnings.push({
                path: `${path}.settings`,
                message: `Prohibited full-section custom HTML shortcut detected in widget "${element.widgetType}". Design sections must be built using native Elementor containers and widgets.`,
                code: 'PROHIBITED_CUSTOM_CODE_SHORTCUT',
                elementId: element.id,
              });
            }
          }
        }
      }

      // Check settings
      if (element.settings && typeof element.settings !== 'object') {
        errors.push({
          path: `${path}.settings`,
          message: 'Settings must be an object',
          code: 'INVALID_SETTINGS',
          elementId: element.id,
        });
      } else if (element.settings?.__globals__) {
        warnings.push({
          path: `${path}.settings.__globals__`,
          message: 'Settings contains __globals__ reference which may be overridden by WordPress theme styles.',
          code: 'THEME_GLOBALS_DETECTED',
          elementId: element.id,
        });
      }

      // Traverse children
      if (Array.isArray(element.elements)) {
        element.elements.forEach((child: any, idx: number) => {
          traverse(child, `${path}.elements[${idx}]`, depth + 1);
        });
      }
    };

    document.content.forEach((el: any, idx: number) => {
      traverse(el, `content[${idx}]`, 1);
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      stats,
    };
  }
}

export function validateElementor(document: any): ElementorValidationResult {
  const validator = new ElementorValidator();
  return validator.validate(document);
}

