/**
 * Integration Adapters & Team Module Boundary Interfaces
 * Architecture Lead: Mubasshir
 * 
 * Defines clean adapter contracts for teammate modules:
 * - Rakib: Upload, Storage & Canvas Isolation
 * - AI Provider: Vision & DIR Generation
 * - Provash: Elementor AST Generator & WordPress MCP/REST Bridge
 * - Database/Persistence: Checkpoint & State Storage
 */

import type {
  Stage1UploadValidationInput,
  Stage1UploadValidationOutput,
  Stage2ImageAnalysisInput,
  Stage2ImageAnalysisOutput,
  Stage3DIRGenerationInput,
  Stage3DIRGenerationOutput,
  Stage5ElementorGenerationInput,
  Stage5ElementorGenerationOutput,
  Stage7PreviewRenderingInput,
  Stage7PreviewRenderingOutput,
} from './registry.js';
import type { DIRDocument, DIRValidationIssue, DIRCanvasBounds } from '../dir/index.js';
import type { NativeElementorTemplate } from '../../contracts/api.js';
import type { PipelineStage, JobStatus, StageProgressInfo } from '../../contracts/stages.js';
import type { PublishJobRequest, PublishJobResponse } from '../../contracts/api.js';

// ─── Teammate Module Interface: Rakib (Storage & Upload) ────────────

export interface IUploadStorageAdapter {
  validateUpload(input: Stage1UploadValidationInput): Promise<Stage1UploadValidationOutput>;
  isolateCanvas?(filePath: string): Promise<DIRCanvasBounds>;
  prepareDIRAssets?(
    document: DIRDocument,
    input: { projectId: string; sourceAssetPath: string }
  ): Promise<DIRDocument>;
}

// ─── AI Pipeline Interfaces ──────────────────────────────────────────

export interface IVisionPerceptionAdapter {
  analyzePerception(
    input: Stage2ImageAnalysisInput,
    signal?: AbortSignal
  ): Promise<Stage2ImageAnalysisOutput>;
}

export interface IDIRGeneratorAdapter {
  generateDIR(
    input: Stage3DIRGenerationInput,
    signal?: AbortSignal
  ): Promise<Stage3DIRGenerationOutput>;
}

export interface IDIRRepairAdapter {
  repairDIR(
    document: DIRDocument,
    issues: DIRValidationIssue[],
    attempt: number,
    signal?: AbortSignal
  ): Promise<DIRDocument>;
}

// ─── Teammate Module Interface: Provash (Elementor AST) ─────────────

export interface IElementorCompilerAdapter {
  compileToElementor(
    input: Stage5ElementorGenerationInput,
    signal?: AbortSignal
  ): Promise<Stage5ElementorGenerationOutput>;
}

export interface IElementorHealingAdapter {
  healElementor(
    template: NativeElementorTemplate,
    syntaxErrors: string[],
    referenceDIR: DIRDocument,
    attempt: number,
    signal?: AbortSignal
  ): Promise<NativeElementorTemplate>;
}

export interface IWordPressPublisher {
  publishTemplate(
    jobId: string,
    template: NativeElementorTemplate,
    options?: Pick<PublishJobRequest, 'postTitle' | 'postStatus'>,
    signal?: AbortSignal
  ): Promise<PublishJobResponse>;
}

// ─── Preview & Quality Assurance Adapter ─────────────────────────────

export interface IPreviewRendererAdapter {
  renderPreview(
    input: Stage7PreviewRenderingInput,
    signal?: AbortSignal
  ): Promise<Stage7PreviewRenderingOutput>;
}

// ─── Checkpoint & Persistence Contract ───────────────────────────────

export interface ConversionJobRecord {
  id: string;
  projectId: string;
  sourceAssetId: string;
  status: JobStatus;
  currentStage: PipelineStage | null;
  attempts: number;
  maxAttempts: number;
  idempotencyKey?: string | null;
  workerId?: string | null;
  leaseExpiresAt?: string | null;
  dirArtifact?: DIRDocument | null;
  elementorArtifact?: NativeElementorTemplate | null;
  elementorAssetManifest?: import('../../contracts/api.js').ElementorAssetManifest | null;
  previewArtifact?: Stage7PreviewRenderingOutput | null;
  errorMessage?: string | null;
  errorDetails?: unknown;
  stages: Record<PipelineStage, StageProgressInfo>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

export interface IJobCheckpointStore {
  getJob(jobId: string): Promise<ConversionJobRecord | null>;
  findJobByIdempotencyKey(key: string): Promise<ConversionJobRecord | null>;
  saveJob(job: ConversionJobRecord): Promise<void>;
  saveStageCheckpoint<T>(jobId: string, stage: PipelineStage, output: T, attempt: number): Promise<void>;
  getStageCheckpoint<T>(jobId: string, stage: PipelineStage): Promise<T | null>;
  updateStageProgress(jobId: string, progress: StageProgressInfo): Promise<void>;
  claimJobLock(jobId: string, workerId: string, ttlMs: number): Promise<boolean>;
  releaseJobLock(jobId: string, workerId: string): Promise<void>;
}

// ─── In-Memory Checkpoint Store (Reference & Testing Implementation) ──

export class InMemoryJobCheckpointStore implements IJobCheckpointStore {
  private jobs = new Map<string, ConversionJobRecord>();
  private checkpoints = new Map<string, Map<PipelineStage, unknown>>();
  private locks = new Map<string, { workerId: string; expiresAt: number }>();

  public async getJob(jobId: string): Promise<ConversionJobRecord | null> {
    const job = this.jobs.get(jobId);
    return job ? JSON.parse(JSON.stringify(job)) : null;
  }

  public async findJobByIdempotencyKey(key: string): Promise<ConversionJobRecord | null> {
    for (const job of this.jobs.values()) {
      if (job.idempotencyKey === key) {
        return JSON.parse(JSON.stringify(job));
      }
    }
    return null;
  }

  public async saveJob(job: ConversionJobRecord): Promise<void> {
    this.jobs.set(job.id, JSON.parse(JSON.stringify(job)));
  }

  public async saveStageCheckpoint<T>(
    jobId: string,
    stage: PipelineStage,
    output: T,
    _attempt: number
  ): Promise<void> {
    if (!this.checkpoints.has(jobId)) {
      this.checkpoints.set(jobId, new Map());
    }
    this.checkpoints.get(jobId)!.set(stage, JSON.parse(JSON.stringify(output)));
  }

  public async getStageCheckpoint<T>(jobId: string, stage: PipelineStage): Promise<T | null> {
    const jobCheckpoints = this.checkpoints.get(jobId);
    if (!jobCheckpoints || !jobCheckpoints.has(stage)) {
      return null;
    }
    return JSON.parse(JSON.stringify(jobCheckpoints.get(stage))) as T;
  }

  public async updateStageProgress(jobId: string, progress: StageProgressInfo): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) {
      job.stages[progress.stage] = progress;
      job.updatedAt = new Date().toISOString();
    }
  }

  public async claimJobLock(jobId: string, workerId: string, ttlMs: number): Promise<boolean> {
    const now = Date.now();
    const existing = this.locks.get(jobId);
    if (existing && existing.expiresAt > now && existing.workerId !== workerId) {
      return false;
    }
    this.locks.set(jobId, { workerId, expiresAt: now + ttlMs });
    return true;
  }

  public async releaseJobLock(jobId: string, workerId: string): Promise<void> {
    const existing = this.locks.get(jobId);
    if (existing && existing.workerId === workerId) {
      this.locks.delete(jobId);
    }
  }

  public clear(): void {
    this.jobs.clear();
    this.checkpoints.clear();
    this.locks.clear();
  }
}
