/**
 * Deterministic Mock MCP Server for WordPress & Elementor Testing
 * Simulates WordPress 6.8+ and Elementor 4.3+ MCP protocol over SSE/HTTP
 */

import http from 'http';
import { AddressInfo } from 'net';
import {
  MCPTool,
  MCPToolResult,
  MCPServerInfo,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCNotification,
} from './types.js';

export type MockServerMode =
  | 'success'
  | 'permission_denied'
  | 'timeout'
  | 'duplicate'
  | 'partial_failure'
  | 'server_error'
  | 'invalid_schema';

export interface RecordedToolCall {
  name: string;
  args: Record<string, unknown>;
  timestamp: Date;
}

export interface RecordedMessageCall {
  method: string;
  params?: unknown;
  timestamp: Date;
}

export interface MockPost {
  id: number;
  title: string;
  content: string;
  status: string;
  post_type: string;
  slug?: string;
  meta_input: Record<string, unknown>;
  elementor_data?: unknown;
  permalink: string;
  created_at: string;
  modified_at: string;
}

export interface MockTemplate {
  id: number;
  title: string;
  type: string;
  content: unknown;
  status: string;
  permalink: string;
  created_at: string;
}

export class MockMCPServer {
  public mode: MockServerMode = 'success';
  public latencyMs = 0;
  public wordpressVersion = '6.8.0';
  public elementorVersion = '4.3.0';

  private nextId = 101;
  public posts: Map<number, MockPost> = new Map();
  public templates: Map<number, MockTemplate> = new Map();

  public recordedCalls: RecordedMessageCall[] = [];
  public recordedToolCalls: RecordedToolCall[] = [];

  private sseClients: Set<http.ServerResponse> = new Set();
  private httpServer?: http.Server;

  // Custom tool list override if desired
  private customTools?: MCPTool[];

  constructor(options?: {
    mode?: MockServerMode;
    wordpressVersion?: string;
    elementorVersion?: string;
    latencyMs?: number;
    initialTools?: MCPTool[];
  }) {
    if (options?.mode) this.mode = options.mode;
    if (options?.wordpressVersion) this.wordpressVersion = options.wordpressVersion;
    if (options?.elementorVersion) this.elementorVersion = options.elementorVersion;
    if (options?.latencyMs) this.latencyMs = options.latencyMs;
    if (options?.initialTools) this.customTools = options.initialTools;
  }

  /**
   * Default WordPress and Elementor tools exposed by the MCP server.
   */
  public getDefaultTools(): MCPTool[] {
    return [
      {
        name: 'wp_create_post',
        description: 'Create a new WordPress post or page',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Post title' },
            status: { type: 'string', enum: ['draft', 'publish', 'pending'], default: 'draft' },
            post_type: { type: 'string', default: 'post' },
            content: { type: 'string' },
            slug: { type: 'string' },
            meta_input: { type: 'object' },
          },
          required: ['title'],
        },
      },
      {
        name: 'wp_update_post',
        description: 'Update an existing WordPress post or page',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: ['number', 'string'], description: 'Post ID' },
            title: { type: 'string' },
            status: { type: 'string', enum: ['draft', 'publish', 'pending'] },
            content: { type: 'string' },
            meta_input: { type: 'object' },
          },
          required: ['id'],
        },
      },
      {
        name: 'wp_get_post',
        description: 'Retrieve a post or page by ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: ['number', 'string'], description: 'Post ID' },
          },
          required: ['id'],
        },
      },
      {
        name: 'wp_upload_media',
        description: 'Upload a media attachment to WordPress',
        inputSchema: {
          type: 'object',
          properties: {
            filename: { type: 'string' },
            mime_type: { type: 'string' },
            file_base64: { type: 'string' },
          },
          required: ['filename'],
        },
      },
      {
        name: 'wp_get_site_info',
        description: 'Retrieve WordPress site configuration and versions',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'elementor_set_post_data',
        description: 'Set Elementor JSON content and metadata on a page or template',
        inputSchema: {
          type: 'object',
          properties: {
            post_id: { type: ['number', 'string'], description: 'Target post ID' },
            data: { type: ['object', 'array'], description: 'Elementor elements tree JSON' },
            page_settings: { type: 'object', description: 'Page level Elementor settings' },
          },
          required: ['post_id', 'data'],
        },
      },
      {
        name: 'elementor_create_template',
        description: 'Create an Elementor library template',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Template title' },
            type: { type: 'string', description: 'Template type (page, section, header, footer)', default: 'page' },
            content: { type: ['object', 'array'], description: 'Elementor elements JSON' },
            status: { type: 'string', enum: ['draft', 'publish'], default: 'publish' },
          },
          required: ['title', 'content'],
        },
      },
      {
        name: 'elementor_get_template',
        description: 'Retrieve an Elementor template by ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: ['number', 'string'], description: 'Template ID' },
          },
          required: ['id'],
        },
      },
      {
        name: 'elementor_get_info',
        description: 'Retrieve Elementor plugin version, pro status, and capabilities',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ];
  }

  public getTools(): MCPTool[] {
    return this.customTools || this.getDefaultTools();
  }

  public setTools(tools: MCPTool[]): void {
    this.customTools = tools;
  }

  public getServerInfo(): MCPServerInfo {
    return {
      name: 'wordpress-elementor-mcp-server',
      version: '1.0.0',
      capabilities: ['tools', 'resources', 'prompts'],
      description: 'WordPress and Elementor Model Context Protocol Server',
      protocolVersion: '2024-11-05',
      metadata: {
        wordpress_version: this.wordpressVersion,
        elementor_version: this.elementorVersion,
      },
    };
  }

  /**
   * Reset all state, recorded calls, and in-memory posts.
   */
  public reset(): void {
    this.nextId = 101;
    this.posts.clear();
    this.templates.clear();
    this.recordedCalls = [];
    this.recordedToolCalls = [];
    this.mode = 'success';
    this.customTools = undefined;
  }

  public clearCalls(): void {
    this.recordedCalls = [];
    this.recordedToolCalls = [];
  }

  public getRecordedToolCalls(name?: string): RecordedToolCall[] {
    if (!name) return [...this.recordedToolCalls];
    return this.recordedToolCalls.filter((c) => c.name === name);
  }

  public assertCalled(toolName: string, times?: number): void {
    const matches = this.getRecordedToolCalls(toolName);
    if (times !== undefined) {
      if (matches.length !== times) {
        throw new Error(
          `Assertion failed: Expected tool '${toolName}' to be called ${times} times, but was called ${matches.length} times`
        );
      }
    } else {
      if (matches.length === 0) {
        throw new Error(`Assertion failed: Expected tool '${toolName}' to be called at least once, but it was not`);
      }
    }
  }

  public assertCalledWith(toolName: string, partialArgs: Record<string, unknown>): void {
    const matches = this.getRecordedToolCalls(toolName);
    if (matches.length === 0) {
      throw new Error(`Assertion failed: Tool '${toolName}' was never called`);
    }

    const matched = matches.some((call) => {
      return Object.entries(partialArgs).every(([key, value]) => {
        const actual = call.args[key];
        return JSON.stringify(actual) === JSON.stringify(value);
      });
    });

    if (!matched) {
      throw new Error(
        `Assertion failed: Tool '${toolName}' was not called with arguments matching ${JSON.stringify(partialArgs)}. Calls were: ${JSON.stringify(matches.map((m) => m.args))}`
      );
    }
  }

  /**
   * Handle an MCP JSON-RPC 2.0 request or notification in memory.
   */
  public async handleMessage(
    request: JSONRPCRequest | JSONRPCNotification
  ): Promise<JSONRPCResponse | null> {
    if (this.latencyMs > 0) {
      await new Promise((res) => setTimeout(res, this.latencyMs));
    }

    // Record the message call
    this.recordedCalls.push({
      method: request.method,
      params: 'params' in request ? request.params : undefined,
      timestamp: new Date(),
    });

    // Check for simulated timeout mode
    if (this.mode === 'timeout') {
      await new Promise((resolve) => setTimeout(resolve, 60000));
    }

    // Check for simulated global server error
    if (this.mode === 'server_error') {
      if ('id' in request && request.id !== undefined) {
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32603,
            message: 'Internal server error in WordPress MCP provider',
          },
        };
      }
      return null;
    }

    // Handle JSON-RPC methods
    switch (request.method) {
      case 'initialize': {
        const id = 'id' in request ? request.id : 1;
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: { listChanged: true },
              resources: {},
            },
            serverInfo: this.getServerInfo(),
            wordpressVersion: this.wordpressVersion,
            elementorVersion: this.elementorVersion,
          },
        };
      }

      case 'notifications/initialized':
      case 'initialized': {
        // Notification, no JSON-RPC response returned
        return null;
      }

      case 'tools/list': {
        const id = 'id' in request ? request.id : 1;
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: this.getTools(),
          },
        };
      }

      case 'tools/call': {
        const id = 'id' in request ? request.id : 1;
        const params = (request.params || {}) as { name: string; arguments?: Record<string, unknown> };
        const toolName = params.name;
        const args = params.arguments || {};

        this.recordedToolCalls.push({
          name: toolName,
          args,
          timestamp: new Date(),
        });

        // Mode: permission denied
        if (this.mode === 'permission_denied') {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: 'Unauthorized: User does not have sufficient WordPress permissions for this action.',
                },
              ],
              isError: true,
            },
          };
        }

        // Mode: invalid schema
        if (this.mode === 'invalid_schema') {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: `Invalid parameters for tool ${toolName}: schema validation failed`,
            },
          };
        }

        const toolResult = await this.executeTool(toolName, args);
        return {
          jsonrpc: '2.0',
          id,
          result: toolResult,
        };
      }

      default: {
        if ('id' in request && request.id !== undefined) {
          return {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32601,
              message: `Method '${request.method}' not found`,
            },
          };
        }
        return null;
      }
    }
  }

  /**
   * Deterministic execution of registered tools.
   */
  private async executeTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<MCPToolResult> {
    switch (name) {
      case 'wp_create_post': {
        if (this.mode === 'duplicate') {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  code: 'duplicate_entry',
                  message: `A post with title "${args.title}" or slug already exists.`,
                }),
              },
            ],
          };
        }

        const id = this.nextId++;
        const title = String(args.title || 'Untitled');
        const status = String(args.status || 'draft');
        const postType = String(args.post_type || 'post');
        const slug = args.slug ? String(args.slug) : `post-${id}`;
        const metaInput = (args.meta_input as Record<string, unknown>) || {};
        const permalink = `https://mock.elementor.local/${slug}/`;

        const newPost: MockPost = {
          id,
          title,
          content: String(args.content || ''),
          status,
          post_type: postType,
          slug,
          meta_input: metaInput,
          elementor_data: metaInput._elementor_data
            ? (typeof metaInput._elementor_data === 'string'
                ? JSON.parse(metaInput._elementor_data)
                : metaInput._elementor_data)
            : undefined,
          permalink,
          created_at: new Date().toISOString(),
          modified_at: new Date().toISOString(),
        };

        this.posts.set(id, newPost);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                id,
                title,
                status,
                post_type: postType,
                url: permalink,
                permalink,
                meta: metaInput,
              }),
            },
          ],
          isError: false,
        };
      }

      case 'wp_update_post': {
        const id = Number(args.id);
        const post = this.posts.get(id);
        if (!post) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  code: 'not_found',
                  message: `Post with ID ${id} was not found`,
                }),
              },
            ],
          };
        }

        if (args.title !== undefined) post.title = String(args.title);
        if (args.status !== undefined) post.status = String(args.status);
        if (args.content !== undefined) post.content = String(args.content);
        if (args.meta_input) {
          post.meta_input = { ...post.meta_input, ...(args.meta_input as Record<string, unknown>) };
          if (post.meta_input._elementor_data) {
            post.elementor_data =
              typeof post.meta_input._elementor_data === 'string'
                ? JSON.parse(post.meta_input._elementor_data)
                : post.meta_input._elementor_data;
          }
        }
        post.modified_at = new Date().toISOString();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(post),
            },
          ],
          isError: false,
        };
      }

      case 'wp_get_post': {
        const id = Number(args.id);
        const post = this.posts.get(id);
        if (!post) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  code: 'post_not_found',
                  message: `Post with ID ${id} does not exist`,
                }),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                id: post.id,
                title: post.title,
                status: post.status,
                post_type: post.post_type,
                permalink: post.permalink,
                url: post.permalink,
                content: post.content,
                meta_input: post.meta_input,
                elementor_data: post.elementor_data,
              }),
            },
          ],
          isError: false,
        };
      }

      case 'elementor_set_post_data': {
        // Partial failure simulation
        if (this.mode === 'partial_failure') {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  code: 'elementor_sync_failed',
                  message: 'Elementor failed to parse or serialize widget tree structure',
                }),
              },
            ],
          };
        }

        const postId = Number(args.post_id);
        const post = this.posts.get(postId);
        if (!post) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  code: 'post_not_found',
                  message: `Target post ${postId} not found for Elementor data assignment`,
                }),
              },
            ],
          };
        }

        post.elementor_data = args.data;
        post.meta_input = {
          ...post.meta_input,
          _elementor_edit_mode: 'builder',
          _elementor_data: typeof args.data === 'string' ? args.data : JSON.stringify(args.data),
          ...(args.page_settings ? { _elementor_page_settings: args.page_settings } : {}),
        };
        post.modified_at = new Date().toISOString();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                post_id: postId,
                elements_count: Array.isArray(args.data) ? args.data.length : 1,
              }),
            },
          ],
          isError: false,
        };
      }

      case 'elementor_create_template': {
        if (this.mode === 'duplicate') {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  code: 'duplicate_template',
                  message: `Template "${args.title}" already exists in Elementor library`,
                }),
              },
            ],
          };
        }

        const id = this.nextId++;
        const title = String(args.title || 'Untitled Template');
        const type = String(args.type || 'page');
        const status = String(args.status || 'publish');
        const permalink = `https://mock.elementor.local/?elementor_library=${id}`;

        const template: MockTemplate = {
          id,
          title,
          type,
          content: args.content,
          status,
          permalink,
          created_at: new Date().toISOString(),
        };

        this.templates.set(id, template);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                id,
                title,
                type,
                status,
                url: permalink,
                permalink,
              }),
            },
          ],
          isError: false,
        };
      }

      case 'elementor_get_template': {
        const id = Number(args.id);
        const template = this.templates.get(id);
        if (!template) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  code: 'template_not_found',
                  message: `Template ${id} not found`,
                }),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(template),
            },
          ],
          isError: false,
        };
      }

      case 'wp_upload_media': {
        const id = this.nextId++;
        const filename = String(args.filename || 'asset.png');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                id,
                title: filename,
                source_url: `https://mock.elementor.local/wp-content/uploads/2026/10/${filename}`,
                mime_type: args.mime_type || 'image/png',
              }),
            },
          ],
          isError: false,
        };
      }

      case 'wp_get_site_info': {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                name: 'WordPress Elementor Sandbox',
                url: 'https://mock.elementor.local',
                wordpress_version: this.wordpressVersion,
                elementor_version: this.elementorVersion,
                timezone: 'UTC',
                multisite: false,
              }),
            },
          ],
          isError: false,
        };
      }

      case 'elementor_get_info': {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                version: this.elementorVersion,
                is_pro: true,
                features: {
                  container: true,
                  nested_elements: true,
                  flexbox: true,
                },
              }),
            },
          ],
          isError: false,
        };
      }

      default: {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                code: 'unknown_tool',
                message: `Tool '${name}' is not recognized by mock server`,
              }),
            },
          ],
          isError: true,
        };
      }
    }
  }

  /**
   * Broadcast an SSE message to all connected SSE clients.
   */
  public broadcastSSE(event: string, data: unknown): void {
    const payload = `event: ${event}\ndata: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  /**
   * Starts an embedded HTTP + SSE server on a random available port.
   * Useful for end-to-end testing with real HTTP/SSE transports.
   */
  public async startHttpServer(port = 0): Promise<{
    port: number;
    url: string;
    close: () => Promise<void>;
  }> {
    if (this.httpServer) {
      const addr = this.httpServer.address() as AddressInfo;
      return {
        port: addr.port,
        url: `http://127.0.0.1:${addr.port}`,
        close: () => this.stopHttpServer(),
      };
    }

    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);

        // 1. SSE Stream Endpoint: /wp-json/mcp/v1/sse
        if (req.method === 'GET' && url.pathname.endsWith('/sse')) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
          });

          this.sseClients.add(res);

          // In standard MCP SSE specification, first send the POST endpoint
          const messageUrl = `${url.origin}/wp-json/mcp/v1/messages?session_id=mock-session-${Date.now()}`;
          res.write(`event: endpoint\ndata: ${messageUrl}\n\n`);

          req.on('close', () => {
            this.sseClients.delete(res);
          });
          return;
        }

        // 2. Message Post Endpoint: /wp-json/mcp/v1/messages or fallback
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });

          req.on('end', async () => {
            try {
              const parsed = JSON.parse(body);
              const response = await this.handleMessage(parsed);

              // Send response directly via HTTP
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(response ? JSON.stringify(response) : '');

              // Also echo back over SSE stream if clients are listening
              if (response) {
                this.broadcastSSE('message', response);
              }
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id: null,
                  error: { code: -32700, message: `Parse error: ${err.message}` },
                })
              );
            }
          });
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Endpoint not found' }));
      });

      server.listen(port, '127.0.0.1', () => {
        this.httpServer = server;
        const addr = server.address() as AddressInfo;
        const baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve({
          port: addr.port,
          url: baseUrl,
          close: () => this.stopHttpServer(),
        });
      });

      server.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Stop the embedded HTTP server and close all SSE connections.
   */
  public async stopHttpServer(): Promise<void> {
    for (const client of this.sseClients) {
      try {
        client.end();
      } catch {
        // ignore
      }
    }
    this.sseClients.clear();

    if (this.httpServer) {
      await new Promise<void>((resolve, reject) => {
        this.httpServer!.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      this.httpServer = undefined;
    }
  }
}

export const defaultMockServer = new MockMCPServer();
