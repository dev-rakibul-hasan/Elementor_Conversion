export interface SafeSerializedError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode = 500,
    code = 'INTERNAL_SERVER_ERROR',
    details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  public toJSON(requestId?: string): SafeSerializedError {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        ...(this.details !== undefined ? { details: this.details } : {}),
        ...(requestId ? { requestId } : {}),
      },
    };
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource', identifier?: string) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' was not found`
      : `${resource} was not found`;
    super(message, 404, 'NOT_FOUND');
  }
}

export class AuthError extends AppError {
  constructor(
    message = 'Authentication required',
    statusCode: 401 | 403 = 401,
    code: 'UNAUTHORIZED' | 'FORBIDDEN' = statusCode === 403 ? 'FORBIDDEN' : 'UNAUTHORIZED',
    details?: unknown
  ) {
    super(message, statusCode, code, details);
  }
}

export class QuotaError extends AppError {
  constructor(
    message = 'Usage or storage quota exceeded',
    details?: unknown
  ) {
    super(message, 429, 'QUOTA_EXCEEDED', details);
  }
}

export class StorageError extends AppError {
  constructor(
    message = 'Storage operation failed',
    details?: unknown
  ) {
    super(message, 500, 'STORAGE_ERROR', details);
  }
}

export class AIProviderError extends AppError {
  public readonly provider?: string;
  public readonly isRetryable: boolean;

  constructor(
    message = 'AI provider request failed',
    provider?: string,
    isRetryable = false,
    details?: unknown,
    statusCode = 502
  ) {
    super(message, statusCode, 'AI_PROVIDER_ERROR', details);
    this.provider = provider;
    this.isRetryable = isRetryable;
  }
}

export class MCPError extends AppError {
  public readonly toolName?: string;

  constructor(
    message = 'Elementor MCP communication failed',
    toolName?: string,
    details?: unknown
  ) {
    super(message, 502, 'MCP_ERROR', details);
    this.toolName = toolName;
  }
}
