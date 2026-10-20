/**
 * Canonical Versioned API Contracts (v1)
 * Architecture Lead: Mubasshir
 * 
 * Defines the public REST/JSON API contract schemas, request/response models,
 * uniform error envelopes, idempotency contracts, and shared TypeScript types.
 */

import type { PipelineStage, JobStatus, StageProgressInfo } from './stages.js';
import type { DIRDocument } from '../modules/dir/types.js';

export const API_VERSION = 'v1' as const;

// ─── Standardized Error Envelopes ───────────────────────────────────

export const API_ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  DIR_VALIDATION_FAILED: 'DIR_VALIDATION_FAILED',
  DIR_REPAIR_FAILED: 'DIR_REPAIR_FAILED',
  ELEMENTOR_VALIDATION_FAILED: 'ELEMENTOR_VALIDATION_FAILED',
  ELEMENTOR_HEALING_FAILED: 'ELEMENTOR_HEALING_FAILED',
  STAGE_TIMEOUT: 'STAGE_TIMEOUT',
  STAGE_FAILED: 'STAGE_FAILED',
  RETRY_LIMIT_EXCEEDED: 'RETRY_LIMIT_EXCEEDED',
  JOB_CANCELLED: 'JOB_CANCELLED',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

export interface ApiErrorDetail {
  code: ApiErrorCode;
  message: string;
  stage?: PipelineStage;
  field?: string;
  details?: unknown;
  retryable: boolean;
  timestamp: string;
  requestId?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetail;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    apiVersion: typeof API_VERSION;
    timestamp: string;
    requestId?: string;
    [key: string]: unknown;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ─── Shared Domain Entities ──────────────────────────────────────────

export interface UserSummary {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN';
}

export interface ProjectSummary {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetSummary {
  id: string;
  projectId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  sha256: string;
  width?: number | null;
  height?: number | null;
  createdAt: string;
}

// ─── Conversion Job DTOs ─────────────────────────────────────────────

export type ConversionMode = 'balanced' | 'fast' | 'fidelity';

export interface JobExecutionOptions {
  bypassCache?: boolean;
  targetElementorVersion?: string;
  containerMaxWidth?: number;
  enableSelfHealing?: boolean;
  maxSelfHealingAttempts?: number;
  preferredThemeBackground?: string;
}

/**
 * Request payload for POST /api/v1/jobs
 */
export interface CreateJobRequest {
  projectId: string;
  sourceAssetId: string;
  mode?: ConversionMode;
  idempotencyKey?: string;
  options?: JobExecutionOptions;
}

/**
 * Response payload for POST /api/v1/jobs (201 Created or 200 OK if idempotent replay)
 */
export interface CreateJobResponse {
  jobId: string;
  projectId: string;
  status: JobStatus;
  currentStage: PipelineStage;
  progressPercent: number;
  idempotencyKey?: string;
  isIdempotentReplay: boolean;
  createdAt: string;
}

/**
 * Response payload for GET /api/v1/jobs/:id
 */
export interface GetJobResponse {
  jobId: string;
  projectId: string;
  status: JobStatus;
  currentStage: PipelineStage | null;
  progressPercent: number;
  attempts: number;
  maxAttempts: number;
  idempotencyKey?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  stages: Record<PipelineStage, StageProgressInfo>;
  error?: ApiErrorDetail | null;
  artifacts: {
    hasDir: boolean;
    hasElementor: boolean;
    hasPreview: boolean;
  };
}

/**
 * Response payload for GET /api/v1/jobs/:id/dir
 */
export interface GetDIRArtifactResponse {
  jobId: string;
  ready: boolean;
  schemaVersion: string;
  data: DIRDocument | null;
  validationSummary?: {
    valid: boolean;
    errorCount: number;
    warningCount: number;
  };
}

/**
 * Elementor Document Structure (Native 4.3.5 Template shape)
 */
export interface NativeElementorTemplate {
  version: string; // e.g. "0.4"
  title: string;
  type: 'page' | 'section' | 'container';
  content: Array<Record<string, unknown>>;
  page_settings?: Record<string, unknown>;
}

/**
 * Response payload for GET /api/v1/jobs/:id/elementor
 */
export interface GetElementorArtifactResponse {
  jobId: string;
  ready: boolean;
  targetVersion: string;
  data: NativeElementorTemplate | null;
  stats?: {
    totalSections: number;
    totalContainers: number;
    totalWidgets: number;
    widgetSlugs: string[];
  };
}

/**
 * Request payload for POST /api/v1/jobs/:id/retry
 */
export interface RetryJobRequest {
  resumeFromStage?: PipelineStage;
  forceFresh?: boolean;
  reason?: string;
}

/**
 * Response payload for POST /api/v1/jobs/:id/retry
 */
export interface RetryJobResponse {
  jobId: string;
  status: JobStatus;
  resumedFromStage: PipelineStage;
  attempt: number;
  maxAttempts: number;
  message: string;
}

/**
 * Request payload for POST /api/v1/jobs/:id/cancel
 */
export interface CancelJobRequest {
  reason?: string;
}

/**
 * Response payload for POST /api/v1/jobs/:id/cancel
 */
export interface CancelJobResponse {
  jobId: string;
  status: 'cancelled';
  cancelledAt: string;
  message: string;
}

/**
 * Request payload for POST /api/v1/jobs/:id/self-heal
 */
export interface TriggerSelfHealingRequest {
  targetStage: 'dir_validation' | 'elementor_validation';
  instructionNotes?: string;
}

/**
 * Response payload for POST /api/v1/jobs/:id/self-heal
 */
export interface TriggerSelfHealingResponse {
  jobId: string;
  targetStage: PipelineStage;
  healed: boolean;
  issuesResolved: number;
  message: string;
}

/**
 * Request payload for POST /api/v1/jobs/:id/publish
 */
export interface PublishJobRequest {
  siteConnectionId: string;
  postTitle?: string;
  postStatus?: 'draft' | 'publish';
}

/**
 * Response payload for POST /api/v1/jobs/:id/publish
 */
export interface PublishJobResponse {
  jobId: string;
  siteConnectionId: string;
  wordpressPostId: number | string;
  postStatus: 'draft' | 'publish';
  previewUrl?: string;
  editUrl?: string;
  publishedAt: string;
}

/**
 * Health check status response
 */
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  timestamp: string;
  uptimeSeconds: number;
  stages: Record<PipelineStage, { available: boolean }>;
}

