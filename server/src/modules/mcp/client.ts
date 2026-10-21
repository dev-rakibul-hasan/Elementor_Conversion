/** Authenticated MCP transport. Simulation must be explicitly requested by tests. */
import type { MCPConnectionConfig, MCPCapabilities, MCPTool, MCPToolResult, MCPInitializeResult } from './types.js';
import { MCPError } from '../../lib/errors.js';
import { MockMCPServer } from './mock-server.js';

export class MCPClient {
  private mockServer: MockMCPServer | null = null;
  private tools: MCPTool[] = [];
  private initialization?: MCPInitializeResult;
  constructor(private config: MCPConnectionConfig) {
    if (config.useMock) {
      if (process.env.NODE_ENV === 'production') throw new MCPError('Mock MCP is disabled in production');
      this.mockServer = new MockMCPServer();
    }
  }
  public getSiteUrl(): string { return this.config.siteUrl; }
  public getConfig(): MCPConnectionConfig { return this.config; }
  public isUsingMock(): boolean { return !!this.mockServer; }

  private async rpc(method: string, params?: Record<string, unknown>): Promise<any> {
    const request = { jsonrpc: '2.0' as const, id: Date.now(), method, params };
    let data: any;
    if (this.mockServer) {
      data = await this.mockServer.handleMessage(request);
    } else {
      if (!this.config.credentials?.username || !this.config.credentials?.applicationPassword) {
        throw new MCPError('WordPress username and application password are required');
      }
      const endpoint = this.config.mcpEndpoint || `${this.config.siteUrl.replace(/\/$/, '')}/wp-json/elementor/v1/mcp`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          ...this.config.headers,
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${this.config.credentials.username}:${this.config.credentials.applicationPassword}`).toString('base64')}`,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.config.timeoutMs || 30000),
      });
      if (!res.ok) throw new MCPError(`MCP ${method} failed with HTTP ${res.status}. Check credentials and the Elementor MCP Bridge plugin.`);
      data = await res.json();
    }
    if (data?.error) throw new MCPError(data.error.message || 'MCP protocol error', method, data.error);
    if (!data?.result || typeof data.result !== 'object') throw new MCPError(`MCP ${method} returned no result`);
    if (data.result.isError) {
      throw new MCPError(data.result.structuredData?.message || data.result.content?.[0]?.text || `MCP ${method} failed`, method);
    }
    if (!data.result.structuredData && Array.isArray(data.result.content)) {
      for (const item of data.result.content) {
        if (item.type !== 'text') continue;
        try { data.result.structuredData = JSON.parse(item.text); break; } catch { /* Plain text is valid MCP content. */ }
      }
    }
    return data.result;
  }

  public async connect(): Promise<MCPInitializeResult> {
    if (this.initialization) return this.initialization;
    const result = await this.rpc('initialize', {
      protocolVersion: '2024-11-05', capabilities: { tools: {} },
      clientInfo: { name: 'design-to-elementor', version: '1.0.0' },
    });
    if (!result.serverInfo || !result.protocolVersion) throw new MCPError('Invalid MCP initialization response');
    this.initialization = result;
    await this.listTools();
    return result;
  }
  public async listTools(): Promise<MCPTool[]> {
    if (this.tools.length) return this.tools;
    const result = await this.rpc('tools/list');
    if (!Array.isArray(result.tools)) throw new MCPError('Invalid MCP tools response');
    this.tools = result.tools;
    return this.tools;
  }
  public async callTool(name: string, args: Record<string, any>): Promise<MCPToolResult> {
    return this.rpc('tools/call', { name, arguments: args });
  }
  public async checkCapabilities(): Promise<MCPCapabilities> {
    await this.connect();
    const tools = await this.listTools();
    const names = new Set(tools.map((t) => t.name));
    return {
      supportsIdempotency: this.initialization?.capabilities?.idempotentPublishing === true,
      canCreatePage: names.has('wp_create_post') || names.has('elementor_create_page'),
      canUpdatePage: names.has('wp_update_post') || names.has('elementor_set_post_data'),
      canPublishPage: names.has('wp_create_post') || names.has('elementor_create_page'),
      canCreateTemplate: names.has('elementor_create_template'),
      canUploadMedia: names.has('wp_upload_media'),
      elementorVersion: this.initialization?.elementorVersion,
      wordpressVersion: this.initialization?.wordpressVersion,
      availableTools: tools,
    };
  }
  public async testConnection(): Promise<{ ok: boolean; message: string; capabilities: MCPCapabilities }> {
    try {
      const capabilities = await this.checkCapabilities();
      return { ok: true, message: 'Connected and discovered MCP capabilities', capabilities };
    } catch (err: any) {
      return { ok: false, message: err.message, capabilities: {
        canCreatePage: false, canUpdatePage: false, canPublishPage: false,
        canCreateTemplate: false, canUploadMedia: false, availableTools: [],
      } };
    }
  }
  public disconnect(): void { this.initialization = undefined; this.tools = []; }
}
