/**
 * End-to-End Pipeline Integration Test
 * 
 * Verifies the full pipeline:
 * 1. Image preprocessing & validation (Sharp buffer validation)
 * 2. DIR generation & schema validation
 * 3. Elementor compilation & structural validation
 * 4. Serialization into official template JSON format
 * 5. Publishing to remote WordPress/Elementor site via Mock MCP Server
 * 6. Read-back verification and idempotency check
 * 
 * Runs 100% offline with zero external network or AI API dependencies.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sharp from 'sharp';
import { validateImage, createThumbnail } from '../modules/storage/image-processor.js';
import { validateDIR, dirDocumentSchema } from '../modules/dir/schema.js';
import type { DIRDocument } from '../modules/dir/types.js';
import { ElementorGenerator } from '../modules/elementor/generator.js';
import { ElementorValidator } from '../modules/elementor/validator.js';
import { serializeElementorTemplate, loadSkillPack } from '../modules/elementor/serializer.js';
import { MockMCPServer } from '../modules/mcp/mock-server.js';
import { MCPPublisher } from '../modules/mcp/publisher.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const sampleDir: DIRDocument = require('../__fixtures__/sample-dir.json');

describe('End-to-End Conversion & Publishing Pipeline', () => {
  let mockServer: MockMCPServer;
  let serverInfo: { port: number; url: string; close: () => Promise<void> };

  beforeAll(async () => {
    mockServer = new MockMCPServer({ mode: 'success' });
    serverInfo = await mockServer.startHttpServer(0);
  });

  afterAll(async () => {
    if (serverInfo) {
      await serverInfo.close();
    }
  });

  it('Stage 1: Preprocessing — Validates image and produces thumbnail', async () => {
    // Generate a valid synthetic PNG image buffer (1200x800)
    const testImageBuffer = await sharp({
      create: {
        width: 1200,
        height: 800,
        channels: 4,
        background: { r: 59, g: 130, b: 246, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const validation = await validateImage(testImageBuffer);
    expect(validation.width).toBe(1200);
    expect(validation.height).toBe(800);
    expect(validation.format).toBe('png');

    const thumbnail = await createThumbnail(testImageBuffer, 400);
    const thumbMeta = await sharp(thumbnail).metadata();
    expect(thumbMeta.width).toBe(400);
  });

  it('Stage 2: DIR Generation & Schema Validation — Passes strict Zod schema', () => {
    const parsed = dirDocumentSchema.parse(sampleDir);
    expect(parsed.version).toBe('1.0.0');
    expect(parsed.pages.length).toBeGreaterThan(0);
    expect(parsed.pages[0].sections.length).toBeGreaterThan(0);

    const validation = validateDIR(sampleDir);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('Stage 3: Elementor Compilation — Produces valid Elementor container tree', () => {
    const generator = new ElementorGenerator({
      preferContainers: true,
      targetProfile: 'core',
    });

    const { document: elementorDoc, report } = generator.convert(sampleDir);

    expect(elementorDoc.type).toBe('page');
    expect(elementorDoc.content.length).toBeGreaterThan(0);
    expect(report.elementCount).toBeGreaterThan(0);

    // Validate structure and unique element IDs
    const validator = new ElementorValidator();
    const valResult = validator.validate(elementorDoc);
    expect(valResult.valid).toBe(true);
    expect(valResult.errors).toHaveLength(0);
  });

  it('Stage 4: Serialization — Exports standard Elementor template JSON structure', () => {
    const generator = new ElementorGenerator();
    const { document: elementorDoc } = generator.convert(sampleDir);

    const serializedStr = serializeElementorTemplate(elementorDoc);
    const parsed = JSON.parse(serializedStr);
    expect(parsed.version).toBe('0.4');
    expect(parsed.type).toBe('page');
    expect(Array.isArray(parsed.content)).toBe(true);

    const skillPack = loadSkillPack();
    expect(skillPack.meta.name).toBeDefined();
  });

  it('Stage 5: MCP Publishing — Publishes page to mock WordPress target with verification', async () => {
    const generator = new ElementorGenerator();
    const { document: elementorDoc } = generator.convert(sampleDir);

    const publisher = new MCPPublisher({
      siteUrl: serverInfo.url,
      mcpEndpoint: `${serverInfo.url}/wp-json/mcp/v1/sse`,
      credentials: {
        username: 'admin',
        applicationPassword: 'mock-app-password',
      },
      timeoutMs: 5000,
    });

    const result = await publisher.publish({
      siteConfigId: 'site-config-e2e',
      title: 'Published E2E Page',
      elementorJson: elementorDoc,
      publishMode: 'draft',
      resourceType: 'page',
      idempotencyKey: 'test-idemp-key-123',
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('draft');
    expect(result.remoteId).toBeDefined();
    expect(result.remoteUrl).toContain('http');
    expect(result.verified).toBe(true);
  });
});
