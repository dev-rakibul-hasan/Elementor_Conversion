/**
 * MCP (Model Context Protocol) Type Definitions
 * For WordPress 6.8+ and Elementor 4.3+ Integration
 */

export interface JSONSchema {
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema | JSONSchema[];
  enum?: unknown[];
  description?: string;
  default?: unknown;
  additionalProperties?: boolean | JSONSchema;
  oneOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  allOf?: JSONSchema[];
  [key: string]: unknown;
}

export interface MCPServerInfo {
  name: string;
  version: string;
  capabilities: string[];
  description?: string;
  protocolVersion?: string;
  metadata?: Record<string, unknown>;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
}

export interface MCPToolContent {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
  [key: string]: unknown;
}

export interface MCPToolResult {
  content: Array<MCPToolContent>;
  isError?: boolean;
  structuredData?: unknown;
  [key: string]: unknown;
}

export interface MCPCredentials {
  username: string;
  applicationPassword: string;
}

export interface MCPConnectionConfig {
  siteUrl: string;
  mcpEndpoint?: string;
  credentials: MCPCredentials;
  timeoutMs?: number;
  useMock?: boolean;
  siteConfigId?: string;
  headers?: Record<string, string>;
}

export interface MCPCapabilities {
  canCreatePage: boolean;
  canUpdatePage: boolean;
  canPublishPage: boolean;
  canCreateTemplate: boolean;
  canUploadMedia: boolean;
  elementorVersion?: string;
  wordpressVersion?: string;
  availableTools: MCPTool[];
}

export interface PublishRequest {
  elementorJson: unknown;
  title: string;
  resourceType: 'page' | 'template';
  publishMode: 'draft' | 'publish';
  siteConfigId: string;
  idempotencyKey?: string;
  slug?: string;
  templateType?: 'page' | 'section' | 'header' | 'footer' | 'container' | string;
  pageSettings?: Record<string, unknown>;
  elementorVersion?: string;
  metadata?: Record<string, unknown>;
}

export interface PublishResult {
  success: boolean;
  remoteId?: string | number;
  remoteUrl?: string;
  resourceType: 'page' | 'template';
  status: 'draft' | 'publish' | 'failed' | 'pending';
  error?: string;
  verified?: boolean;
  details?: unknown;
  durationMs?: number;
  idempotencyKey?: string;
}

// ─── MCP Protocol & JSON-RPC 2.0 Structures ─────────────────────────

export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown> | unknown[];
}

export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface JSONRPCNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown> | unknown[];
}

export interface MCPInitializeParams {
  protocolVersion: string;
  capabilities: {
    roots?: { listChanged?: boolean };
    sampling?: Record<string, unknown>;
    tools?: { listChanged?: boolean };
    [key: string]: unknown;
  };
  clientInfo: {
    name: string;
    version: string;
  };
}

export interface MCPInitializeResult {
  protocolVersion: string;
  capabilities: {
    tools?: { listChanged?: boolean };
    resources?: Record<string, unknown>;
    prompts?: Record<string, unknown>;
    logging?: Record<string, unknown>;
    [key: string]: unknown;
  };
  serverInfo: MCPServerInfo;
  wordpressVersion?: string;
  elementorVersion?: string;
}

export interface MCPClientOptions {
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  userAgent?: string;
  mockMode?: boolean;
}

export interface PublishRecord {
  idempotencyKey: string;
  siteConfigId: string;
  resourceType: 'page' | 'template';
  remoteId?: string | number;
  remoteUrl?: string;
  status: 'draft' | 'publish' | 'failed' | 'pending';
  createdAt: Date;
  updatedAt: Date;
  attempts: number;
  lastError?: string;
}
