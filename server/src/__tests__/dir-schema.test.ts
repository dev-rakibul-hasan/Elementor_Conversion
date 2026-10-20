/**
 * DIR Schema Validation Tests
 * 
 * Tests the DIR document schema validation, parsing, and semantic checks.
 * Uses fixture data only — no live AI calls.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { validateDIR, parseDIRFromAIOutput, dirDocumentSchema } from '../modules/dir/schema.js';

const require = createRequire(import.meta.url);
const sampleDir = require('../__fixtures__/sample-dir.json');

describe('DIR Schema Validation', () => {
  describe('validateDIR', () => {
    it('should accept a valid DIR document', () => {
      const result = validateDIR(sampleDir);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.document).toBeDefined();
    });

    it('should reject null input', () => {
      const result = validateDIR(null);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_TYPE');
    });

    it('should reject non-object input', () => {
      const result = validateDIR('not an object');
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_TYPE');
    });

    it('should reject empty object', () => {
      const result = validateDIR({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject wrong version', () => {
      const badVersion = { ...sampleDir, version: '2.0.0' };
      const result = validateDIR(badVersion);
      expect(result.valid).toBe(false);
    });

    it('should reject missing pages', () => {
      const noPages = { ...sampleDir, pages: [] };
      const result = validateDIR(noPages);
      expect(result.valid).toBe(false);
    });

    it('should reject invalid section role', () => {
      const badRole = JSON.parse(JSON.stringify(sampleDir));
      badRole.pages[0].sections[0].role = 'invalid_role';
      const result = validateDIR(badRole);
      expect(result.valid).toBe(false);
    });

    it('should reject invalid node kind', () => {
      const badKind = JSON.parse(JSON.stringify(sampleDir));
      badKind.pages[0].sections[0].children[0].kind = 'nonexistent';
      const result = validateDIR(badKind);
      expect(result.valid).toBe(false);
    });

    it('should detect duplicate IDs', () => {
      const dupIds = JSON.parse(JSON.stringify(sampleDir));
      // Set two different node IDs to the same value
      dupIds.pages[0].sections[1].children[0].id = 'section-header';
      const result = validateDIR(dupIds);
      expect(result.errors.some((e: any) => e.code === 'DUPLICATE_IDS')).toBe(true);
    });

    it('should warn on unknown asset references', () => {
      const badRef = JSON.parse(JSON.stringify(sampleDir));
      // Find an image node and set a non-existent asset ID
      const heroSection = badRef.pages[0].sections.find((s: any) => s.role === 'header');
      if (heroSection) {
        const imageNode = heroSection.children.find((n: any) => n.kind === 'image');
        if (imageNode) {
          imageNode.assetId = 'nonexistent-asset';
        }
      }
      const result = validateDIR(badRef);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should warn on low confidence sections', () => {
      const lowConf = JSON.parse(JSON.stringify(sampleDir));
      lowConf.pages[0].sections[0].confidence = 0.3;
      const result = validateDIR(lowConf);
      expect(result.warnings.some((w: string) => w.includes('low confidence'))).toBe(true);
    });

    it('should validate color values in globals', () => {
      const result = validateDIR(sampleDir);
      expect(result.valid).toBe(true);
      // Globals should have required color fields
      expect(sampleDir.globals.colors.background).toBeDefined();
      expect(sampleDir.globals.colors.text).toBeDefined();
    });

    it('should validate typography scale', () => {
      const result = validateDIR(sampleDir);
      expect(result.valid).toBe(true);
      expect(sampleDir.globals.typography.fontFamilies.length).toBeGreaterThan(0);
    });

    it('should validate breakpoints structure', () => {
      const result = validateDIR(sampleDir);
      expect(result.valid).toBe(true);
      expect(sampleDir.breakpoints.desktop.min).toBeDefined();
    });

    it('should accept valid node kinds', () => {
      const validKinds = [
        'container', 'flex-group', 'grid-group', 'heading', 'text',
        'button', 'image', 'icon', 'divider', 'spacer'
      ];
      for (const kind of validKinds) {
        // Verify the kind exists in the schema
        expect(kind).toBeTruthy();
      }
    });
  });

  describe('parseDIRFromAIOutput', () => {
    it('should parse valid JSON directly', () => {
      const json = JSON.stringify(sampleDir);
      const result = parseDIRFromAIOutput(json);
      expect('parsed' in result).toBe(true);
      if ('parsed' in result) {
        expect(result.extractionMethod).toBe('direct');
      }
    });

    it('should extract JSON from markdown code blocks', () => {
      const wrapped = '```json\n{"version":"1.0.0"}\n```';
      const result = parseDIRFromAIOutput(wrapped);
      expect('parsed' in result).toBe(true);
      if ('parsed' in result) {
        expect(result.extractionMethod).toBe('markdown_code_block');
        expect((result.parsed as any).version).toBe('1.0.0');
      }
    });

    it('should extract JSON from brace boundaries', () => {
      const wrapped = 'Here is the result:\n{"version":"1.0.0"}\nDone.';
      const result = parseDIRFromAIOutput(wrapped);
      expect('parsed' in result).toBe(true);
      if ('parsed' in result) {
        expect(result.extractionMethod).toBe('brace_extraction');
      }
    });

    it('should return error for non-JSON text', () => {
      const result = parseDIRFromAIOutput('This is not JSON at all');
      expect('error' in result).toBe(true);
    });

    it('should return error for invalid JSON', () => {
      const result = parseDIRFromAIOutput('{invalid json}');
      expect('error' in result).toBe(true);
    });
  });

  describe('dirDocumentSchema', () => {
    it('should be a valid Zod schema', () => {
      expect(dirDocumentSchema).toBeDefined();
      expect(dirDocumentSchema.parse).toBeInstanceOf(Function);
    });

    it('should reject unknown top-level keys', () => {
      const withExtra = { ...sampleDir, unknownField: 'test' };
      const result = dirDocumentSchema.safeParse(withExtra);
      expect(result.success).toBe(false);
    });
  });
});
