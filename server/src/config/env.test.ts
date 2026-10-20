import { describe, it, expect, vi } from 'vitest';
import { env, envSchema, printConfigDiagnostics } from './env.js';

describe('Environment Configuration', () => {
  it('should load and validate default configuration in test environment', () => {
    expect(env).toBeDefined();
    expect(env.NODE_ENV).toBe('test');
    expect(env.API_PORT).toBe(4000);
    expect(typeof env.JWT_SECRET).toBe('string');
    expect(env.JWT_SECRET.length).toBeGreaterThan(0);
    expect(typeof env.UPLOAD_MAX_BYTES).toBe('number');
    expect(typeof env.UPLOAD_QUOTA_BYTES).toBe('number');
  });

  it('should validate custom environment values using schema', () => {
    const custom = envSchema.parse({
      NODE_ENV: 'development',
      API_PORT: '5000',
      WEB_ORIGIN: 'http://localhost:3000',
      STORAGE_PROVIDER: 'local',
      AI_PROVIDER: 'groq',
    });

    expect(custom.API_PORT).toBe(5000);
    expect(custom.NODE_ENV).toBe('development');
    expect(custom.STORAGE_PROVIDER).toBe('local');
    expect(custom.AI_PROVIDER).toBe('groq');
  });

  it('printConfigDiagnostics should execute without throwing or logging secret values', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(() => printConfigDiagnostics()).not.toThrow();

    // Verify secret is not present in logs
    const loggedCalls = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(loggedCalls).not.toContain(env.JWT_SECRET);
    expect(loggedCalls).not.toContain(env.SITE_CREDENTIAL_ENCRYPTION_KEY);
    consoleSpy.mockRestore();
  });
});
