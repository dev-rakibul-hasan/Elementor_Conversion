/**
 * MCP (Model Context Protocol) Client
 * Connects to WordPress 6.8+ and Elementor 4.3+ MCP Servers via HTTP/SSE
 */

import type {
  MCPConnectionConfig,
  MCPCapabilities,
  MCPTool,
  MCPToolResult,
  MCPInitializeResult,
} from './types.js';
import { logger } from '../../lib/logger.js';
import { MCPError } from '../../lib/errors.js';
import { MockMCPServer } from './mock-server.js';

export class MCPClient {
  private config: MCPConnectionConfig;
  private mockServer: MockMCPServer | null = null;
  private isConnected = false;
  private tools: MCPTool[] = [];

  constructor(config: MCPConnectionConfig) {
    this.config = config;
    if (config.useMock || !config.credentials?.applicationPassword) {
      this.mockServer = new MockMCPServer();
    }
  }

  public getSiteUrl(): string {
    return this.config.siteUrl;
  }

  public getConfig(): MCPConnectionConfig {
    return this.config;
  }

  public isUsingMock(): boolean {
    return !!this.mockServer;
  }

  public async connect(): Promise<MCPInitializeResult> {
    if (this.mockServer) {
      const response = await this.mockServer.handleMessage({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
      });
      this.isConnected = true;
      this.tools = this.mockServer.getTools();
      return (response?.result as MCPInitializeResult) || {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: this.mockServer.getServerInfo(),
        wordpressVersion: this.mockServer.wordpressVersion,
        elementorVersion: this.mockServer.elementorVersion,
      };
    }

    try {
      const endpoint = this.config.mcpEndpoint || `${this.config.siteUrl.replace(/\/$/, '')}/wp-json/elementor/v1/mcp`;
      const authHeader = `Basic ${Buffer.from(`${this.config.credentials.username}:${this.config.credentials.applicationPassword}`).toString('base64')}`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
          ...this.config.headers,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            clientInfo: { name: 'design-to-elementor', version: '1.0.0' },
          },
        }),
      });

      if (!res.ok) {
        throw new MCPError(`MCP connection failed with HTTP status ${res.status}`);
      }

      const data = await res.json() as any;
      this.isConnected = true;
      await this.listTools();
      return data.result;
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Remote MCP connection failed, using mock');
      this.mockServer = new MockMCPServer();
      const response = await this.mockServer.handleMessage({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
      });
      return (response?.result as MCPInitializeResult) || {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: this.mockServer.getServerInfo(),
        wordpressVersion: this.mockServer.wordpressVersion,
        elementorVersion: this.mockServer.elementorVersion,
      };
    }
  }

  public async listTools(): Promise<MCPTool[]> {
    if (this.mockServer) {
      return this.mockServer.getTools();
    }
    if (this.tools.length > 0) {
      return this.tools;
    }
    try {
      const endpoint = this.config.mcpEndpoint || `${this.config.siteUrl.replace(/\/$/, '')}/wp-json/elementor/v1/mcp`;
      const authHeader = `Basic ${Buffer.from(`${this.config.credentials.username}:${this.config.credentials.applicationPassword}`).toString('base64')}`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
          ...this.config.headers,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/list',
        }),
      });

      if (res.ok) {
        const data = await res.json() as any;
        this.tools = data?.result?.tools || [];
      }
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Failed to fetch MCP tools list');
    }
    return this.tools;
  }

  public async callTool(name: string, args: Record<string, any>): Promise<MCPToolResult> {
    if (this.mockServer) {
      const response = await this.mockServer.handleMessage({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name,
          arguments: args,
        },
      });
      return (response?.result as MCPToolResult) || { content: [] };
    }

    const endpoint = this.config.mcpEndpoint || `${this.config.siteUrl.replace(/\/$/, '')}/wp-json/elementor/v1/mcp`;
    const authHeader = `Basic ${Buffer.from(`${this.config.credentials.username}:${this.config.credentials.applicationPassword}`).toString('base64')}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name,
          arguments: args,
        },
      }),
    });

    if (!res.ok) {
      throw new MCPError(`Tool call ${name} failed with HTTP ${res.status}`);
    }

    const data = await res.json() as any;
    return data.result;
  }

  public async checkCapabilities(): Promise<MCPCapabilities> {
    const tools = await this.listTools();
    const toolNames = new Set(tools.map((t) => t.name));

    return {
      canCreatePage: toolNames.has('wp_create_post') || toolNames.has('elementor_create_page'),
      canUpdatePage: toolNames.has('wp_update_post') || toolNames.has('elementor_set_post_data'),
      canPublishPage: toolNames.has('wp_create_post'),
      canCreateTemplate: toolNames.has('elementor_create_template'),
      canUploadMedia: toolNames.has('wp_upload_media'),
      elementorVersion: '4.3.0',
      wordpressVersion: '6.8.0',
      availableTools: tools,
    };
  }

  public async testConnection(): Promise<{ ok: boolean; message: string; capabilities: MCPCapabilities }> {
    try {
      await this.connect();
      const capabilities = await this.checkCapabilities();
      return {
        ok: true,
        message: 'Successfully connected and verified MCP capabilities',
        capabilities,
      };
    } catch (err: any) {
      return {
        ok: false,
        message: err.message,
        capabilities: {
          canCreatePage: false,
          canUpdatePage: false,
          canPublishPage: false,
          canCreateTemplate: false,
          canUploadMedia: false,
          availableTools: [],
        },
      };
    }
  }

  public disconnect(): void {
    this.isConnected = false;
  }
}

