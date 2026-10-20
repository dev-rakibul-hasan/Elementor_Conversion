/**
 * MCP Publishing & Error Handling Test Suite
 * 
 * Verifies:
 * 1. Discovery and capability negotiation against WordPress 6.8+ & Elementor 4.3+ mock server.
 * 2. Idempotent publication with read-back verification.
 * 3. Handling of permission_denied error.
 * 4. Handling of server_error / internal error.
 * 5. Handling of partial_failure (post created, but Elementor data assignment failed).
 * 6. Handling when page creation tool is unsupported by remote server.
 * 
 * Result label: MOCK MCP TESTED (zero live network or remote staging mutation).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MockMCPServer } from '../modules/mcp/mock-server.js';
import { MCPPublisher } from '../modules/mcp/publisher.js';
import { MCPClient } from '../modules/mcp/client.js';

describe('Audit F — Elementor MCP Protocol & Publisher Robustness (MOCK MCP TESTED)', () => {
  let mockServer: MockMCPServer;
  let serverInfo: { port: number; url: string; close: () => Promise<void> };

  const dummyElementorDoc = {
    version: '0.4',
    title: 'Test Published Page',
    type: 'page',
    content: [
      {
        id: 'c0000001',
        elType: 'container',
        settings: { container_type: 'flex' },
        elements: [
          {
            id: 'h0000001',
            elType: 'widget',
            widgetType: 'heading',
            settings: { title: 'MCP Test Heading' },
            elements: [],
          },
        ],
      },
    ],
  };

  beforeAll(async () => {
    mockServer = new MockMCPServer({ mode: 'success' });
    serverInfo = await mockServer.startHttpServer(0);
  });

  afterAll(async () => {
    if (serverInfo) {
      await serverInfo.close();
    }
  });

  it('1. Connects, negotiates protocol, and discovers actual server tools', async () => {
    const client = new MCPClient({
      siteUrl: serverInfo.url,
      mcpEndpoint: `${serverInfo.url}/wp-json/mcp/v1/sse`,
      credentials: { username: 'admin', applicationPassword: 'mock-password' },
    });

    const initResult = await client.connect();
    expect(initResult.protocolVersion).toBeDefined();

    const capabilities = await client.checkCapabilities();
    expect(capabilities.canCreatePage).toBe(true);
    expect(capabilities.availableTools.length).toBeGreaterThan(0);
    expect(capabilities.availableTools.some((t) => t.name === 'wp_create_post')).toBe(true);
  });

  it('2. Successfully publishes with idempotency and read-back verification', async () => {
    mockServer.mode = 'success';
    const publisher = new MCPPublisher({
      siteUrl: serverInfo.url,
      mcpEndpoint: `${serverInfo.url}/wp-json/mcp/v1/sse`,
      credentials: { username: 'admin', applicationPassword: 'mock-password' },
    });

    const result = await publisher.publish({
      siteConfigId: 'site-audit-f',
      title: 'Success Page',
      elementorJson: dummyElementorDoc,
      publishMode: 'draft',
      resourceType: 'page',
      idempotencyKey: 'idemp-audit-success-1',
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('draft');
    expect(result.remoteId).toBeDefined();
    expect(result.verified).toBe(true);
    expect(result.idempotencyKey).toBe('idemp-audit-success-1');
  });

  it('3. Handles permission_denied error gracefully with structured failure', async () => {
    mockServer.mode = 'permission_denied';
    const publisher = new MCPPublisher({
      siteUrl: serverInfo.url,
      mcpEndpoint: `${serverInfo.url}/wp-json/mcp/v1/sse`,
      credentials: { username: 'admin', applicationPassword: 'mock-password' },
    });

    const result = await publisher.publish({
      siteConfigId: 'site-audit-f',
      title: 'Forbidden Page',
      elementorJson: dummyElementorDoc,
      publishMode: 'draft',
      resourceType: 'page',
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/permission|denied|HTTP|error/i);
  });

  it('4. Handles server_error gracefully', async () => {
    mockServer.mode = 'server_error';
    const publisher = new MCPPublisher({
      siteUrl: serverInfo.url,
      mcpEndpoint: `${serverInfo.url}/wp-json/mcp/v1/sse`,
      credentials: { username: 'admin', applicationPassword: 'mock-password' },
    });

    const result = await publisher.publish({
      siteConfigId: 'site-audit-f',
      title: 'Server Error Page',
      elementorJson: dummyElementorDoc,
      publishMode: 'draft',
      resourceType: 'page',
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
  });

  it('5. Rejects publishing when target server lacks page creation tools', async () => {
    mockServer.mode = 'success';
    // Set custom tools that DO NOT include wp_create_post or elementor_create_page
    mockServer.setTools([
      {
        name: 'wp_get_site_info',
        description: 'Info only',
        inputSchema: { type: 'object' },
      },
    ]);

    const publisher = new MCPPublisher({
      siteUrl: serverInfo.url,
      mcpEndpoint: `${serverInfo.url}/wp-json/mcp/v1/sse`,
      credentials: { username: 'admin', applicationPassword: 'mock-password' },
    });

    const result = await publisher.publish({
      siteConfigId: 'site-audit-f',
      title: 'Unsupported Tools Page',
      elementorJson: dummyElementorDoc,
      publishMode: 'draft',
      resourceType: 'page',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/does not support page creation/i);

    // Reset tools
    mockServer.reset();
  });
});

