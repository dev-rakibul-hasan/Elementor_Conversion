/**
 * AI Provider System Types
 * Core type definitions for LLM and VLM provider integrations, routing,
 * model capabilities, circuit breakers, and caching.
 */

// Supported AI Providers
export type AIProvider = 'groq' | 'gemini' | 'openrouter' | 'mock';
export const AIProvider = {
  GROQ: 'groq' as AIProvider,
  GEMINI: 'gemini' as AIProvider,
  OPENROUTER: 'openrouter' as AIProvider,
  MOCK: 'mock' as AIProvider,
};

// Roles in conversion workflow
export type AIRole = 'vision' | 'structure' | 'review';
export const AIRole = {
  VISION: 'vision' as AIRole,
  STRUCTURE: 'structure' as AIRole,
  REVIEW: 'review' as AIRole,
};

// Provider & Model capabilities
export type AICapability = 'image_input' | 'json_output' | 'text_generation';
export const AICapability = {
  IMAGE_INPUT: 'image_input' as AICapability,
  JSON_OUTPUT: 'json_output' as AICapability,
  TEXT_GENERATION: 'text_generation' as AICapability,
};

// Routing & Quality Modes
export type AIRoutingMode = 'economy' | 'balanced' | 'quality';
export const AIRoutingMode = {
  ECONOMY: 'economy' as AIRoutingMode,
  BALANCED: 'balanced' as AIRoutingMode,
  QUALITY: 'quality' as AIRoutingMode,
};

// Message Content definitions (supports multimodal OpenAI-compatible schema)
export interface AIMessageContentText {
  type: 'text';
  text: string;
}

export interface AIMessageContentImageUrl {
  type: 'image_url';
  image_url: {
    url: string; // HTTP(S) URL or data:image/...;base64,...
    detail?: 'low' | 'high' | 'auto';
  };
}

export type AIMessageContentPart = AIMessageContentText | AIMessageContentImageUrl;

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | AIMessageContentPart[];
  name?: string;
}

export type AIResponseFormat =
  | 'text'
  | 'json'
  | { type: 'json_object' }
  | { type: 'text' };

export interface AIModelConfig {
  provider: AIProvider;
  modelId: string;
  capabilities: AICapability[];
  maxTokens?: number;
  supportsImages: boolean;
  costPer1kInputTokens?: number;
  costPer1kOutputTokens?: number;
}

export interface AIRequest {
  role: AIRole;
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
  responseFormat?: AIResponseFormat;
  timeout?: number;
  modelId?: string; // Optional specific model override
  correlationId?: string;
  jobId?: string;
  stageName?: string;
  systemInstruction?: string;
  bypassCache?: boolean;
  sourceImageHash?: string;
  promptVersion?: string;
  skillVersion?: string;
  schemaVersion?: string;
}

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
}

export interface AIResponse {
  content: string;
  usage: AIUsage;
  model: string;
  provider: AIProvider;
  requestId?: string;
  latencyMs: number;
  cached?: boolean;
  finishReason?: string;
  raw?: unknown;
}

export interface AIHealthCheckResult {
  ok: boolean;
  message?: string;
  latencyMs?: number;
  modelId?: string;
  details?: Record<string, unknown>;
}

export interface AIProviderAdapter {
  readonly name: AIProvider;
  sendRequest(req: AIRequest): Promise<AIResponse>;
  checkHealth(): Promise<AIHealthCheckResult>;
  validateModel(modelId: string): boolean;
  getCapabilities(): AICapability[];
}

// Circuit Breaker types
export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  lastFailure?: number | Date;
  nextRetry?: number | Date;
  successCount?: number;
}

export interface CircuitBreakerOptions {
  failureThreshold?: number; // Failures before opening circuit (default: 3)
  recoveryTimeMs?: number;    // Time before moving from open to half-open (default: 30000ms)
  halfOpenMaxAttempts?: number; // Successful requests to close circuit (default: 2)
}

// Budget tracking
export interface BudgetLimits {
  dailyCallLimit?: number;
  dailyTokenLimit?: number;
  perRequestMaxTokens?: number;
}

export interface DailyUsageStats {
  date: string; // YYYY-MM-DD
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  cacheHits: number;
}

export interface CacheEntryMetadata {
  sourceImageHash?: string;
  normalizedInput?: string;
  schemaVersion?: string;
  skillVersion?: string;
  promptVersion?: string;
  provider: AIProvider;
  model: string;
  stage?: string;
  ttlSeconds?: number;
}
