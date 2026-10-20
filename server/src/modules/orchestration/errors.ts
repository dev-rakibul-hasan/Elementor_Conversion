/**
 * Pipeline Orchestration Errors & Codes
 * Architecture Lead: Mubasshir
 */

import type { PipelineStage } from '../../contracts/stages.js';
import type { ApiErrorCode } from '../../contracts/api.js';

export class PipelineError extends Error {
  public readonly stage?: PipelineStage;
  public readonly code: ApiErrorCode;
  public readonly retryable: boolean;
  public readonly details?: unknown;
  public readonly timestamp: string;

  constructor(message: string, options: {
    stage?: PipelineStage;
    code: ApiErrorCode;
    retryable?: boolean;
    details?: unknown;
    cause?: Error;
  }) {
    super(message, { cause: options.cause });
    this.name = 'PipelineError';
    this.stage = options.stage;
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
    this.timestamp = new Date().toISOString();
  }
}

export class StageTimeoutError extends PipelineError {
  constructor(stage: PipelineStage, timeoutMs: number) {
    super(`Stage "${stage}" timed out after ${timeoutMs}ms`, {
      stage,
      code: 'STAGE_TIMEOUT',
      retryable: true,
      details: { timeoutMs },
    });
    this.name = 'StageTimeoutError';
  }
}

export class StageValidationError extends PipelineError {
  constructor(stage: PipelineStage, issues: unknown[], message?: string) {
    super(message || `Validation failed for stage "${stage}"`, {
      stage,
      code: stage === 'dir_validation' ? 'DIR_VALIDATION_FAILED' : 'ELEMENTOR_VALIDATION_FAILED',
      retryable: false,
      details: issues,
    });
    this.name = 'StageValidationError';
  }
}

export class SelfHealingExhaustedError extends PipelineError {
  constructor(stage: PipelineStage, attempts: number, details?: unknown) {
    super(`Self-healing exhausted for stage "${stage}" after ${attempts} attempts`, {
      stage,
      code: stage === 'dir_validation' ? 'DIR_REPAIR_FAILED' : 'ELEMENTOR_HEALING_FAILED',
      retryable: false,
      details,
    });
    this.name = 'SelfHealingExhaustedError';
  }
}

export class RetryLimitExceededError extends PipelineError {
  constructor(stage: PipelineStage, attempts: number, lastError?: Error) {
    super(`Retry limit exceeded for stage "${stage}" (${attempts} attempts)`, {
      stage,
      code: 'RETRY_LIMIT_EXCEEDED',
      retryable: false,
      details: { attempts, lastErrorMessage: lastError?.message },
      cause: lastError,
    });
    this.name = 'RetryLimitExceededError';
  }
}

export class JobCancellationError extends PipelineError {
  constructor(jobId: string, reason?: string) {
    super(`Job ${jobId} was cancelled: ${reason || 'User requested cancellation'}`, {
      code: 'JOB_CANCELLED',
      retryable: false,
      details: { jobId, reason },
    });
    this.name = 'JobCancellationError';
  }
}

export class IdempotencyConflictError extends PipelineError {
  constructor(idempotencyKey: string, existingJobId: string) {
    super(`Idempotent request conflict: Key "${idempotencyKey}" already in progress by job "${existingJobId}"`, {
      code: 'CONFLICT',
      retryable: false,
      details: { idempotencyKey, existingJobId },
    });
    this.name = 'IdempotencyConflictError';
  }
}

