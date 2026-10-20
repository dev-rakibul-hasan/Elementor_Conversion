import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  NotFoundError,
  AuthError,
  QuotaError,
  StorageError,
  AIProviderError,
  MCPError,
} from './errors.js';

describe('Custom Error Classes', () => {
  it('AppError serializes correctly without stack trace leakage', () => {
    const error = new AppError('Something went wrong', 500, 'INTERNAL_ERROR', { detail: 'extra' });
    const json = error.toJSON('req-123');

    expect(json.success).toBe(false);
    expect(json.error.code).toBe('INTERNAL_ERROR');
    expect(json.error.message).toBe('Something went wrong');
    expect(json.error.requestId).toBe('req-123');
    expect(json.error.details).toEqual({ detail: 'extra' });
    expect((json as unknown as Record<string, unknown>).stack).toBeUndefined();
  });

  it('ValidationError has 400 status and VALIDATION_ERROR code', () => {
    const error = new ValidationError('Invalid email format', [{ field: 'email' }]);
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toBe('Invalid email format');
    expect(error.details).toEqual([{ field: 'email' }]);
  });

  it('NotFoundError formats resource not found correctly', () => {
    const error = new NotFoundError('Project', 'proj-999');
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toContain("Project with identifier 'proj-999' was not found");
  });

  it('AuthError handles 401 unauthorized and 403 forbidden', () => {
    const unauth = new AuthError('Token missing');
    expect(unauth.statusCode).toBe(401);
    expect(unauth.code).toBe('UNAUTHORIZED');

    const forbidden = new AuthError('Access denied', 403, 'FORBIDDEN');
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.code).toBe('FORBIDDEN');
  });

  it('QuotaError handles 429 quota limits', () => {
    const error = new QuotaError('Monthly upload quota reached');
    expect(error.statusCode).toBe(429);
    expect(error.code).toBe('QUOTA_EXCEEDED');
  });

  it('StorageError handles 500 storage failures', () => {
    const error = new StorageError('Failed to write to B2 bucket');
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('STORAGE_ERROR');
  });

  it('AIProviderError records provider and retryable flags', () => {
    const error = new AIProviderError('Rate limit exceeded', 'groq', true);
    expect(error.statusCode).toBe(502);
    expect(error.code).toBe('AI_PROVIDER_ERROR');
    expect(error.provider).toBe('groq');
    expect(error.isRetryable).toBe(true);
  });

  it('MCPError records tool name', () => {
    const error = new MCPError('Elementor tool rejected parameters', 'create_page');
    expect(error.statusCode).toBe(502);
    expect(error.code).toBe('MCP_ERROR');
    expect(error.toolName).toBe('create_page');
  });
});
