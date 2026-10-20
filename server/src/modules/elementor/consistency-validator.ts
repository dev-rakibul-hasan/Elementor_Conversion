/**
 * Elementor Consistency Validator
 * 
 * Verifies consistency across:
 * 1. Widget Registry (widget-registry.json)
 * 2. Per-widget and layout reference files (widgets/*.json, layout-elements/*.json)
 * 3. ElementorGenerator mapping coverage
 * 4. Canonical DIR node kinds
 * 5. Responsive capabilities matrix
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DIRNodeKind } from '../dir/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ConsistencyValidationReport {
  valid: boolean;
  isValid: boolean;
  totalRegistryEntries: number;
  totalWidgetsInRegistry: number;
  totalWidgetProfiles: number;
  totalProfilesOnDisk: number;
  registeredSlugs: string[];
  missingReferenceFiles: string[];
  corruptReferenceFiles: string[];
  unmappedDIRNodeKinds: string[];
  nodeKindsCovered: DIRNodeKind[];
  responsiveCapabilityGaps: string[];
  responsiveCapabilitiesCount: number;
  errors: string[];
  warnings: string[];
}

export class ConsistencyValidator {
  private skillDir: string;

  constructor(customSkillDir?: string) {
    this.skillDir = customSkillDir || path.resolve(__dirname, '../../skills/elementor');
  }

  public validate(): ConsistencyValidationReport {
    const warnings: string[] = [];
    const missingReferenceFiles: string[] = [];
    const corruptReferenceFiles: string[] = [];
    const unmappedDIRNodeKinds: string[] = [];
    const responsiveCapabilityGaps: string[] = [];

    const registryPath = path.join(this.skillDir, 'widget-registry.json');
    if (!fs.existsSync(registryPath)) {
      throw new Error(`Widget registry not found at ${registryPath}`);
    }

    const registryData = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const registeredWidgets = registryData.widgets || [];
    const registeredSlugs: string[] = registeredWidgets.map((w: any) => w.slug);

    // 1. Verify every registry entry has an accessible reference file
    for (const item of registeredWidgets) {
      let refPath = path.join(this.skillDir, item.reference_file.replace(/^references\//, ''));
      if (!fs.existsSync(refPath)) {
        // Try fallback direct under widgets or layout-elements
        const directWidgetPath = path.join(this.skillDir, 'widgets', `${item.slug}.json`);
        const directLayoutPath = path.join(this.skillDir, 'layout-elements', `${item.slug}.json`);
        if (fs.existsSync(directWidgetPath)) {
          refPath = directWidgetPath;
        } else if (fs.existsSync(directLayoutPath)) {
          refPath = directLayoutPath;
        } else {
          missingReferenceFiles.push(item.slug);
          continue;
        }
      }

      try {
        const parsed = JSON.parse(fs.readFileSync(refPath, 'utf8'));
        if (!parsed.native_elementor_node_example) {
          corruptReferenceFiles.push(`${item.slug}: missing native_elementor_node_example`);
        }
      } catch (err: any) {
        corruptReferenceFiles.push(`${item.slug}: ${err.message}`);
      }
    }

    // 2. Verify all canonical DIR node kinds are mapped in the generator
    const canonicalDIRNodeKinds: DIRNodeKind[] = [
      'container', 'flex-group', 'grid-group', 'heading', 'text', 'button',
      'image', 'icon', 'icon-text', 'link', 'list', 'list-item', 'divider',
      'spacer', 'card', 'form', 'input', 'video', 'map', 'social-icons',
      'counter', 'progress-bar', 'tabs', 'accordion', 'rating', 'badge', 'unknown'
    ];

    // Every canonical node kind is handled in convertNode in generator.ts
    // Verify generator has definitions
    const generatorPath = path.join(__dirname, 'generator.ts');
    if (fs.existsSync(generatorPath)) {
      const generatorCode = fs.readFileSync(generatorPath, 'utf8');
      for (const kind of canonicalDIRNodeKinds) {
        if (!generatorCode.includes(`case '${kind}'`)) {
          unmappedDIRNodeKinds.push(kind);
        }
      }
    }

    let responsiveCapabilitiesCount = 0;
    const respCapPath = path.join(this.skillDir, 'responsive-capabilities.json');
    if (fs.existsSync(respCapPath)) {
      const respCaps = JSON.parse(fs.readFileSync(respCapPath, 'utf8'));
      if (!respCaps.breakpoints || !respCaps.breakpoints.tablet || !respCaps.breakpoints.mobile) {
        responsiveCapabilityGaps.push('Missing tablet or mobile breakpoint definitions');
      }
      if (!respCaps.layoutElements || !respCaps.layoutElements.container) {
        responsiveCapabilityGaps.push('Missing container layout element responsive capabilities');
      }
      responsiveCapabilitiesCount = Object.keys(respCaps.widgets || {}).length + Object.keys(respCaps.layoutElements || {}).length;
    } else {
      warnings.push(`Responsive capabilities matrix not found at ${respCapPath}`);
    }

    const errors = [
      ...missingReferenceFiles.map(s => `Missing reference file for: ${s}`),
      ...corruptReferenceFiles,
      ...unmappedDIRNodeKinds.map(k => `Unmapped DIR node kind: ${k}`),
      ...responsiveCapabilityGaps,
    ];

    const valid = errors.length === 0;

    let totalProfilesOnDisk = 0;
    try {
      const wDir = path.join(this.skillDir, 'widgets');
      const lDir = path.join(this.skillDir, 'layout-elements');
      if (fs.existsSync(wDir)) totalProfilesOnDisk += fs.readdirSync(wDir).filter(f => f.endsWith('.json')).length;
      if (fs.existsSync(lDir)) totalProfilesOnDisk += fs.readdirSync(lDir).filter(f => f.endsWith('.json')).length;
    } catch {
      // ignore
    }

    return {
      valid,
      isValid: valid,
      totalRegistryEntries: registeredWidgets.length,
      totalWidgetsInRegistry: registeredWidgets.length,
      totalWidgetProfiles: registeredWidgets.filter((w: any) => w.element_type === 'widget').length,
      totalProfilesOnDisk,
      registeredSlugs,
      missingReferenceFiles,
      corruptReferenceFiles,
      unmappedDIRNodeKinds,
      nodeKindsCovered: canonicalDIRNodeKinds,
      responsiveCapabilityGaps,
      responsiveCapabilitiesCount,
      errors,
      warnings,
    };
  }
}

export function validateConsistency(skillDir?: string): ConsistencyValidationReport {
  const validator = new ConsistencyValidator(skillDir);
  return validator.validate();
}
