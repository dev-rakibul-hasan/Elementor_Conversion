import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env from server root or project root if not already loaded
dotenv.config();

const isTest = process.env.NODE_ENV === 'test';
const isProd = process.env.NODE_ENV === 'production';

// Helper for numeric env vars with default
const numericString = (defaultValue: number) =>
  z
    .string()
    .optional()
    .transform((val) => {
      if (val === undefined || val === '') return defaultValue;
      const parsed = parseInt(val, 10);
      return isNaN(parsed) ? defaultValue : parsed;
    });

// Helper for boolean env vars with default
const booleanString = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((val) => {
      if (val === undefined || val === '') return defaultValue;
      return val.toLowerCase() === 'true' || val === '1';
    });

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default(isTest ? 'test' : 'development'),
  API_PORT: numericString(4000),
  TRUST_PROXY_HOPS: numericString(0),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),

  DATABASE_URL: z
    .string()
    .default(
      isTest
        ? 'postgresql://postgres:postgres@localhost:5432/design_to_elementor_test'
        : 'postgresql://postgres:postgres@localhost:5432/design_to_elementor'
    ),

  JWT_SECRET: z
    .string()
    .min(isProd ? 32 : 8, 'JWT_SECRET must be at least 32 characters in production')
    .default(
      isTest
        ? 'test-jwt-secret-for-vitest-runner-32-chars-long'
        : 'super-secret-development-jwt-token-key-32-chars-long'
    ),

  UPLOAD_MAX_BYTES: numericString(524288000), // 500 MB
  UPLOAD_QUOTA_BYTES: numericString(2147483648), // 2 GB
  LOCAL_STORAGE_PATH: z
    .string()
    .default(isTest ? './storage/test-uploads' : './storage/uploads'),
  STORAGE_PROVIDER: z.enum(['local', 'b2']).default('local'),

  B2_BUCKET_NAME: z.string().optional().default('design-to-elementor'),
  B2_ENDPOINT: z
    .string()
    .optional()
    .default('https://s3.us-east-005.backblazeb2.com'),
  B2_REGION: z.string().optional().default('us-east-005'),
  B2_APPLICATION_KEY_ID: z.string().optional().default(''),
  B2_APPLICATION_KEY: z.string().optional().default(''),

  AI_PROVIDER: z.enum(['groq', 'gemini', 'openrouter', 'mock']).default('groq'),
  AI_API_KEY: z.string().optional().default(''),
  AI_MODEL: z.string().optional().default('openai/gpt-oss-120b'),
  GROQ_MODEL: z.string().optional().default('openai/gpt-oss-120b'),

  GEMINI_API_KEY: z.string().optional().default(''),
  ENABLE_GEMINI: booleanString(true),
  GEMINI_MODEL: z.string().optional().default('gemini-3.8-flash'),

  OPENROUTER_API_KEY: z.string().optional().default(''),
  OPENROUTER_MODEL: z
    .string()
    .optional()
    .default('anthropic/claude-3.5-sonnet'),

  AI_REQUEST_TIMEOUT_MS: numericString(60000),

  SITE_CREDENTIAL_ENCRYPTION_KEY: z
    .string()
    .min(
      isProd ? 32 : 16,
      'SITE_CREDENTIAL_ENCRYPTION_KEY must be at least 32 characters'
    )
    .default(
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    ),

  CONVERSION_WORKER_CONCURRENCY: numericString(2),
  CONVERSION_MAX_ATTEMPTS: numericString(3),

  VISION_AI_PROVIDER: z
    .enum(['gemini', 'groq', 'openrouter', 'mock'])
    .optional()
    .default('gemini'),
  VISION_AI_MODEL: z.string().optional().default('gemini-3.8-flash'),

  STRUCTURE_AI_PROVIDER: z
    .enum(['groq', 'gemini', 'openrouter', 'mock'])
    .optional()
    .default('groq'),
  STRUCTURE_AI_MODEL: z
    .string()
    .optional()
    .default('openai/gpt-oss-120b'),

  REVIEW_AI_PROVIDER: z
    .enum(['openrouter', 'groq', 'gemini', 'mock'])
    .optional()
    .default('openrouter'),
  REVIEW_AI_MODEL: z
    .string()
    .optional()
    .default('anthropic/claude-3.5-sonnet'),

  POLLINATIONS_ENDPOINT: z
    .string()
    .optional()
    .default('https://image.pollinations.ai/prompt'),
  POLLINATIONS_MODEL: z.string().optional().default('flux'),
  POLLINATIONS_API_KEY: z.string().optional().default(''),
  ENABLE_POLLINATIONS: booleanString(true),
  POLLINATIONS_TIMEOUT_MS: numericString(30000),
  POLLINATIONS_MAX_RETRIES: numericString(2),

  RUN_LIVE_AI_TESTS: booleanString(false),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.error(`[CONFIG ERROR] Invalid environment configuration:\n${issues}`);
    if (!isTest) {
      throw new Error(`Invalid environment configuration:\n${issues}`);
    }
    // In test mode, fallback to schema with empty object
    return envSchema.parse({});
  }
  return result.data;
}

export const env: Env = parseEnv();

/**
 * Diagnostic logger for configuration status.
 * NEVER logs actual secret values, only logs presence, lengths, and safe URLs.
 */
export function printConfigDiagnostics(): void {
  const maskUrl = (rawUrl: string): string => {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.password) {
        parsed.password = '***';
      }
      return parsed.toString();
    } catch {
      return '[INVALID_URL]';
    }
  };

  const status = (val: string | undefined | null): string => {
    if (!val || val.trim() === '') return '[NOT SET]';
    return `[SET, len=${val.length}]`;
  };

  const diagnostics = {
    NODE_ENV: env.NODE_ENV,
    API_PORT: env.API_PORT,
    WEB_ORIGIN: env.WEB_ORIGIN,
    TRUST_PROXY_HOPS: env.TRUST_PROXY_HOPS,
    DATABASE_URL: maskUrl(env.DATABASE_URL),
    JWT_SECRET: status(env.JWT_SECRET),
    SITE_CREDENTIAL_ENCRYPTION_KEY: status(env.SITE_CREDENTIAL_ENCRYPTION_KEY),
    STORAGE: {
      provider: env.STORAGE_PROVIDER,
      localPath: path.resolve(env.LOCAL_STORAGE_PATH),
      b2Endpoint: env.B2_ENDPOINT,
      b2Bucket: env.B2_BUCKET_NAME,
      b2KeyId: status(env.B2_APPLICATION_KEY_ID),
      b2Key: status(env.B2_APPLICATION_KEY),
      maxBytes: `${(env.UPLOAD_MAX_BYTES / (1024 * 1024)).toFixed(1)}MB`,
      quotaBytes: `${(env.UPLOAD_QUOTA_BYTES / (1024 * 1024)).toFixed(1)}MB`,
    },
    AI: {
      defaultProvider: env.AI_PROVIDER,
      defaultModel: env.AI_MODEL,
      aiApiKey: status(env.AI_API_KEY),
      geminiEnabled: env.ENABLE_GEMINI,
      geminiKey: status(env.GEMINI_API_KEY),
      geminiModel: env.GEMINI_MODEL,
      openRouterKey: status(env.OPENROUTER_API_KEY),
      openRouterModel: env.OPENROUTER_MODEL,
      timeoutMs: env.AI_REQUEST_TIMEOUT_MS,
      visionProvider: env.VISION_AI_PROVIDER,
      structureProvider: env.STRUCTURE_AI_PROVIDER,
      reviewProvider: env.REVIEW_AI_PROVIDER,
      runLiveTests: env.RUN_LIVE_AI_TESTS,
    },
    WORKER: {
      concurrency: env.CONVERSION_WORKER_CONCURRENCY,
      maxAttempts: env.CONVERSION_MAX_ATTEMPTS,
    },
  };

  console.log('[CONFIG] Configuration Diagnostics:');
  console.log(JSON.stringify(diagnostics, null, 2));
}
