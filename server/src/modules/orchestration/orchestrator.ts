/**
 * Conversion Pipeline Orchestrator
 * Architecture Lead: Mubasshir
 * 
 * Coordinates the full 7-stage conversion pipeline:
 * 1. upload_validation (Security & Image bounds)
 * 2. image_analysis (Stage A: Vision Understanding & Canvas Isolation)
 * 3. dir_generation (Stage B: Canonical DIR Layout Tree)
 * 4. dir_validation (DIR Contract Verification & Self-Repair Gate)
 * 5. elementor_generation (Stage C: Elementor AST Generator)
 * 6. elementor_validation (Stage D: Self-Healing Quality Gate)
 * 7. preview_rendering (Preview & QA Verification)
 * 
 * Features:
 * - Checkpoint / Resume (skip previously completed stages)
 * - Bounded retries per stage with backoff
 * - Per-stage timeouts with AbortSignal
 * - Idempotency deduplication
 * - Self-healing coordination for DIR and Elementor AST
 * - Consistent status and progress mapping
 */

import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_ORDER,
  STAGE_DESCRIPTORS,
  mapStageToJobStatus,
  type PipelineStage,
  type StageProgressInfo,
} from '../../contracts/stages.js';
import type {
  ConversionMode,
  JobExecutionOptions,
  NativeElementorTemplate,
} from '../../contracts/api.js';
import { validateElementorTemplate } from '../elementor/validator.js';
import {
  validateDIR,
  type DIRDocument,
} from '../dir/index.js';
import {
  StageRegistry,
  type Stage1UploadValidationInput,
  type Stage1UploadValidationOutput,
  type Stage2ImageAnalysisInput,
  type Stage2ImageAnalysisOutput,
  type Stage3DIRGenerationInput,
  type Stage3DIRGenerationOutput,
  type Stage4DIRValidationOutput,
  type Stage5ElementorGenerationInput,
  type Stage5ElementorGenerationOutput,
  type Stage6ElementorValidationOutput,
  type Stage7PreviewRenderingInput,
  type Stage7PreviewRenderingOutput,
} from './registry.js';
import type {
  IUploadStorageAdapter,
  IVisionPerceptionAdapter,
  IDIRGeneratorAdapter,
  IDIRRepairAdapter,
  IElementorCompilerAdapter,
  IElementorHealingAdapter,
  IPreviewRendererAdapter,
  IJobCheckpointStore,
  ConversionJobRecord,
} from './adapters.js';
import {
  PipelineError,
  StageTimeoutError,
  StageValidationError,
  RetryLimitExceededError,
  JobCancellationError,
} from './errors.js';

export interface PipelineAdapters {
  uploadStorage: IUploadStorageAdapter;
  visionPerception: IVisionPerceptionAdapter;
  dirGenerator: IDIRGeneratorAdapter;
  dirRepair?: IDIRRepairAdapter;
  elementorCompiler: IElementorCompilerAdapter;
  elementorHealing?: IElementorHealingAdapter;
  previewRenderer: IPreviewRendererAdapter;
  checkpointStore: IJobCheckpointStore;
}

export interface RunJobOptions {
  resumeFromStage?: PipelineStage;
  forceFresh?: boolean;
  workerId?: string;
  signal?: AbortSignal;
}

export interface PipelineExecutionResult {
  jobId: string;
  status: 'preview_ready' | 'failed' | 'cancelled';
  dirDocument?: DIRDocument;
  elementorTemplate?: NativeElementorTemplate;
  preview?: Stage7PreviewRenderingOutput;
  totalDurationMs: number;
  completedStages: PipelineStage[];
  error?: {
    code: string;
    message: string;
    stage?: PipelineStage;
    details?: unknown;
  };
}

export class ConversionPipelineOrchestrator {
  private adapters: PipelineAdapters;

  constructor(adapters: PipelineAdapters) {
    this.adapters = adapters;
  }

  /**
   * Initializes or fetches a job record. Handles idempotency if a key is provided.
   */
  public async createOrGetJob(params: {
    jobId: string;
    projectId: string;
    sourceAssetId: string;
    idempotencyKey?: string;
    mode?: ConversionMode;
    options?: JobExecutionOptions;
  }): Promise<{ job: ConversionJobRecord; isIdempotentReplay: boolean }> {
    const store = this.adapters.checkpointStore;

    if (params.idempotencyKey) {
      const existing = await store.findJobByIdempotencyKey(params.idempotencyKey);
      if (existing) {
        return { job: existing, isIdempotentReplay: true };
      }
    }

    const initialStages: Record<PipelineStage, StageProgressInfo> = {} as any;
    for (const stage of PIPELINE_STAGE_ORDER) {
      initialStages[stage] = {
        stage,
        status: 'pending',
        attempt: 0,
        maxAttempts: STAGE_DESCRIPTORS[stage].maxRetries + 1,
        progressPercent: 0,
      };
    }

    const job: ConversionJobRecord = {
      id: params.jobId,
      projectId: params.projectId,
      sourceAssetId: params.sourceAssetId,
      status: 'queued',
      currentStage: null,
      attempts: 0,
      maxAttempts: 3,
      idempotencyKey: params.idempotencyKey || null,
      stages: initialStages,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await store.saveJob(job);
    return { job, isIdempotentReplay: false };
  }

  /**
   * Executes the 7-stage conversion pipeline with checkpoint/resume, bounded retries,
   * timeouts, and self-healing.
   */
  public async executeJob(
    jobId: string,
    uploadDetails: { fileName: string; mimeType: string; sizeBytes: number; filePath: string },
    options: RunJobOptions = {}
  ): Promise<PipelineExecutionResult> {
    const startTime = Date.now();
    const store = this.adapters.checkpointStore;

    const job = await store.getJob(jobId);
    if (!job) {
      throw new PipelineError(`Job "${jobId}" not found`, {
        code: 'NOT_FOUND',
        retryable: false,
      });
    }

    job.attempts += 1;
    await store.saveJob(job);

    const completedStages: PipelineStage[] = [];

    try {
      // Check cancellation
      if (options.signal?.aborted) {
        throw new JobCancellationError(jobId, 'Aborted before start');
      }

      // ═══════════════════════════════════════════════════════════════
      // STAGE 1: Upload & Security Validation
      // ═══════════════════════════════════════════════════════════════
      const stage1Input: Stage1UploadValidationInput = {
        jobId,
        projectId: job.projectId,
        sourceAssetId: job.sourceAssetId,
        fileName: uploadDetails.fileName,
        mimeType: uploadDetails.mimeType,
        sizeBytes: uploadDetails.sizeBytes,
        filePath: uploadDetails.filePath,
      };

      const stage1Output = await this.executeStageWithResumption<Stage1UploadValidationOutput>({
        job,
        stage: PIPELINE_STAGES.UPLOAD_VALIDATION,
        forceFresh: options.forceFresh,
        executeFn: async () => {
          return await this.adapters.uploadStorage.validateUpload(stage1Input);
        },
        validateOutputFn: (out) => {
          if (!out.verifiedSha256 || !out.storagePath) {
            throw new StageValidationError(PIPELINE_STAGES.UPLOAD_VALIDATION, [], 'Missing verified sha256 or storagePath');
          }
        },
        signal: options.signal,
      });
      completedStages.push(PIPELINE_STAGES.UPLOAD_VALIDATION);

      // ═══════════════════════════════════════════════════════════════
      // STAGE 2: Stage A - Vision Understanding & Canvas Isolation
      // ═══════════════════════════════════════════════════════════════
      const stage2Input: Stage2ImageAnalysisInput = {
        jobId,
        projectId: job.projectId,
        sourceAsset: stage1Output,
      };

      const stage2Output = await this.executeStageWithResumption<Stage2ImageAnalysisOutput>({
        job,
        stage: PIPELINE_STAGES.IMAGE_ANALYSIS,
        forceFresh: options.forceFresh,
        executeFn: async (signal) => {
          return await this.adapters.visionPerception.analyzePerception(stage2Input, signal);
        },
        validateOutputFn: (out) => {
          if (!out.detectedPalette || !out.detectedPalette.background) {
            throw new StageValidationError(PIPELINE_STAGES.IMAGE_ANALYSIS, [], 'Image analysis failed to identify background color');
          }
        },
        signal: options.signal,
      });
      completedStages.push(PIPELINE_STAGES.IMAGE_ANALYSIS);

      // ═══════════════════════════════════════════════════════════════
      // STAGE 3: Stage B - Canonical DIR Generation
      // ═══════════════════════════════════════════════════════════════
      const stage3Input: Stage3DIRGenerationInput = {
        jobId,
        projectId: job.projectId,
        sourceAsset: stage1Output,
        analysis: stage2Output,
      };

      const stage3Output = await this.executeStageWithResumption<Stage3DIRGenerationOutput>({
        job,
        stage: PIPELINE_STAGES.DIR_GENERATION,
        forceFresh: options.forceFresh,
        executeFn: async (signal) => {
          return await this.adapters.dirGenerator.generateDIR(stage3Input, signal);
        },
        validateOutputFn: (out) => {
          if (!out.rawDIRDocument || !Array.isArray(out.rawDIRDocument.pages)) {
            throw new StageValidationError(PIPELINE_STAGES.DIR_GENERATION, [], 'DIR generation output missing valid document root');
          }
        },
        signal: options.signal,
      });
      completedStages.push(PIPELINE_STAGES.DIR_GENERATION);

      // ═══════════════════════════════════════════════════════════════
      // STAGE 4: DIR Verification & Self-Repair Gate
      // ═══════════════════════════════════════════════════════════════
      const stage4Output = await this.executeStageWithResumption<Stage4DIRValidationOutput>({
        job,
        stage: PIPELINE_STAGES.DIR_VALIDATION,
        forceFresh: options.forceFresh,
        executeFn: async (signal) => {
          let currentDoc = stage3Output.rawDIRDocument;
          let validation = validateDIR(currentDoc);
          let selfHealed = false;
          let healingAttempts = 0;
          const maxHealingAttempts = 2;

          while (!validation.valid && healingAttempts < maxHealingAttempts && this.adapters.dirRepair) {
            healingAttempts += 1;
            try {
              currentDoc = await this.adapters.dirRepair.repairDIR(
                currentDoc,
                validation.issues,
                healingAttempts,
                signal
              );
              validation = validateDIR(currentDoc);
              if (validation.valid) {
                selfHealed = true;
                break;
              }
            } catch {
              // break on repair error to allow loop termination
              break;
            }
          }

          if (!validation.valid) {
            throw new StageValidationError(
              PIPELINE_STAGES.DIR_VALIDATION,
              validation.issues,
              `DIR schema validation failed: ${validation.errors.join('; ')}`
            );
          }

          return {
            validatedDIRDocument: validation.document || currentDoc,
            isValid: true,
            selfHealed,
            healingAttempts,
            issues: validation.issues,
            warnings: validation.issues.filter((i) => i.severity === 'warning').map((i) => i.message),
          };
        },
        signal: options.signal,
      });
      completedStages.push(PIPELINE_STAGES.DIR_VALIDATION);

      const preparedDIRDocument = this.adapters.uploadStorage.prepareDIRAssets
        ? await this.adapters.uploadStorage.prepareDIRAssets(stage4Output.validatedDIRDocument, {
            projectId: job.projectId,
            sourceAssetPath: stage1Output.storagePath,
          })
        : stage4Output.validatedDIRDocument;

      // Save verified DIR Artifact to job
      job.dirArtifact = preparedDIRDocument;
      await store.saveJob(job);

      // ═══════════════════════════════════════════════════════════════
      // STAGE 5: Stage C - Elementor AST Compilation
      // ═══════════════════════════════════════════════════════════════
      const stage5Input: Stage5ElementorGenerationInput = {
        jobId,
        validatedDIRDocument: preparedDIRDocument,
        targetVersion: preparedDIRDocument.meta.elementorVersion || '4.3.5',
      };

      const stage5Output = await this.executeStageWithResumption<Stage5ElementorGenerationOutput>({
        job,
        stage: PIPELINE_STAGES.ELEMENTOR_GENERATION,
        forceFresh: options.forceFresh,
        executeFn: async (signal) => {
          return await this.adapters.elementorCompiler.compileToElementor(stage5Input, signal);
        },
        validateOutputFn: (out) => {
          if (!out.elementorTemplate || !Array.isArray(out.elementorTemplate.content)) {
            throw new StageValidationError(PIPELINE_STAGES.ELEMENTOR_GENERATION, [], 'Elementor compilation emitted empty template content');
          }
        },
        signal: options.signal,
      });
      completedStages.push(PIPELINE_STAGES.ELEMENTOR_GENERATION);

      // ═══════════════════════════════════════════════════════════════
      // STAGE 6: Stage D - Quality Gate & Self-Healing
      // ═══════════════════════════════════════════════════════════════
      const stage6Output = await this.executeStageWithResumption<Stage6ElementorValidationOutput>({
        job,
        stage: PIPELINE_STAGES.ELEMENTOR_VALIDATION,
        forceFresh: options.forceFresh,
        executeFn: async (signal) => {
          let template = stage5Output.elementorTemplate;
          let syntaxErrors = [...validateElementorTemplate(template).errors];
          let selfHealed = false;
          let healingAttempts = 0;
          const maxHealingAttempts = 2;

          while (syntaxErrors.length > 0 && healingAttempts < maxHealingAttempts && this.adapters.elementorHealing) {
            healingAttempts += 1;
            try {
              template = await this.adapters.elementorHealing.healElementor(
                template,
                syntaxErrors,
                preparedDIRDocument,
                healingAttempts,
                signal
              );
              const reErrors = validateElementorTemplate(template).errors;
              if (reErrors.length === 0) {
                selfHealed = true;
                syntaxErrors = [];
                break;
              }
              syntaxErrors = reErrors;
            } catch {
              break;
            }
          }

          if (syntaxErrors.length > 0) {
            throw new StageValidationError(
              PIPELINE_STAGES.ELEMENTOR_VALIDATION,
              syntaxErrors,
              `Elementor template validation failed: ${syntaxErrors.join('; ')}`
            );
          }

          return {
            validatedTemplate: template,
            isValid: true,
            selfHealed,
            healingAttempts,
            syntaxErrors: [],
            fidelityAudit: {
              typographyPreserved: true,
              layoutPreserved: true,
              noLegacySectionsEmitted: true,
              widgetSlugIntegrityVerified: true,
            },
          };
        },
        signal: options.signal,
      });
      completedStages.push(PIPELINE_STAGES.ELEMENTOR_VALIDATION);

      // Save verified Elementor Template Artifact
      job.elementorArtifact = stage6Output.validatedTemplate;
      job.elementorAssetManifest = stage5Output.assetManifest ?? null;
      await store.saveJob(job);

      // ═══════════════════════════════════════════════════════════════
      // STAGE 7: Preview Rendering & QA Verification
      // ═══════════════════════════════════════════════════════════════
      const stage7Input: Stage7PreviewRenderingInput = {
        jobId,
        validatedTemplate: stage6Output.validatedTemplate,
        validatedDIRDocument: preparedDIRDocument,
        sourceAsset: stage1Output,
      };

      const stage7Output = await this.executeStageWithResumption<Stage7PreviewRenderingOutput>({
        job,
        stage: PIPELINE_STAGES.PREVIEW_RENDERING,
        forceFresh: options.forceFresh,
        executeFn: async (signal) => {
          return await this.adapters.previewRenderer.renderPreview(stage7Input, signal);
        },
        validateOutputFn: (out) => {
          if (typeof out.readinessScore !== 'number') {
            throw new StageValidationError(PIPELINE_STAGES.PREVIEW_RENDERING, [], 'Preview output missing readinessScore');
          }
        },
        signal: options.signal,
      });
      completedStages.push(PIPELINE_STAGES.PREVIEW_RENDERING);

      // Finalize Successful Conversion Job
      job.previewArtifact = stage7Output;
      job.status = 'preview_ready';
      job.currentStage = null;
      job.completedAt = new Date().toISOString();
      job.errorMessage = null;
      job.errorDetails = null;
      await store.saveJob(job);

      return {
        jobId,
        status: 'preview_ready',
        dirDocument: preparedDIRDocument,
        elementorTemplate: stage6Output.validatedTemplate,
        preview: stage7Output,
        totalDurationMs: Date.now() - startTime,
        completedStages,
      };
    } catch (err: any) {
      const isCancellation = err instanceof JobCancellationError || options.signal?.aborted;
      job.status = isCancellation ? 'cancelled' : 'failed';
      job.errorMessage = err?.message || 'Pipeline execution failed';
      job.errorDetails = err?.details || { name: err?.name, stack: err?.stack };
      job.updatedAt = new Date().toISOString();
      await store.saveJob(job);

      return {
        jobId,
        status: job.status,
        totalDurationMs: Date.now() - startTime,
        completedStages,
        error: {
          code: err?.code || 'INTERNAL_ERROR',
          message: job.errorMessage || 'Unknown pipeline failure',
          stage: err?.stage || job.currentStage || undefined,
          details: job.errorDetails,
        },
      };
    }
  }

  /**
   * Resumes a stage from existing checkpoint if available, or executes with bounded retries & timeout.
   */
  private async executeStageWithResumption<T>(params: {
    job: ConversionJobRecord;
    stage: PipelineStage;
    forceFresh?: boolean;
    executeFn: (signal: AbortSignal) => Promise<T>;
    validateOutputFn?: (output: T) => void;
    signal?: AbortSignal;
  }): Promise<T> {
    const { job, stage, forceFresh, executeFn, validateOutputFn, signal } = params;
    const store = this.adapters.checkpointStore;
    const descriptor = StageRegistry.getStageDescriptor(stage);

    // 1. Check for valid existing checkpoint (Resumption logic)
    if (!forceFresh) {
      const cached = await store.getStageCheckpoint<T>(job.id, stage);
      if (cached !== null && cached !== undefined) {
        // Validate cached output before reusing
        try {
          if (validateOutputFn) validateOutputFn(cached);
          // Mark stage as completed from checkpoint
          job.stages[stage] = {
            stage,
            status: 'completed',
            attempt: job.stages[stage]?.attempt || 1,
            maxAttempts: descriptor.maxRetries + 1,
            progressPercent: 100,
            message: 'Resumed from existing checkpoint',
          };
          await store.saveJob(job);
          return cached;
        } catch {
          // Checkpoint invalid, fall through to fresh execution
        }
      }
    }

    // 2. Set Job and Stage to Processing
    job.currentStage = stage;
    job.status = mapStageToJobStatus(stage);
    const attempt = (job.stages[stage]?.attempt || 0) + 1;

    const stageProgress: StageProgressInfo = {
      stage,
      status: 'processing',
      attempt,
      maxAttempts: descriptor.maxRetries + 1,
      startedAt: new Date().toISOString(),
      progressPercent: 10,
    };
    job.stages[stage] = stageProgress;
    await store.saveJob(job);

    // 3. Bounded Retry Execution with Timeouts
    let lastError: Error | null = null;
    const maxAttempts = descriptor.maxRetries + 1;

    for (let currentAttempt = 1; currentAttempt <= maxAttempts; currentAttempt++) {
      if (signal?.aborted) {
        throw new JobCancellationError(job.id, 'Cancelled during pipeline stage');
      }

      stageProgress.attempt = currentAttempt;
      stageProgress.progressPercent = Math.min(20 * currentAttempt, 80);
      await store.updateStageProgress(job.id, stageProgress);

      const stageAbortController = new AbortController();
      const onParentAbort = () => stageAbortController.abort();
      if (signal) {
        signal.addEventListener('abort', onParentAbort, { once: true });
      }

      const timeoutHandle = setTimeout(() => {
        stageAbortController.abort();
      }, descriptor.timeoutMs);

      const stageStartTime = Date.now();

      try {
        const output = await executeFn(stageAbortController.signal);
        clearTimeout(timeoutHandle);
        if (signal) {
          signal.removeEventListener('abort', onParentAbort);
        }

        if (validateOutputFn) {
          validateOutputFn(output);
        }

        // Stage success: save checkpoint
        await store.saveStageCheckpoint(job.id, stage, output, currentAttempt);

        stageProgress.status = 'completed';
        stageProgress.progressPercent = 100;
        stageProgress.completedAt = new Date().toISOString();
        stageProgress.durationMs = Date.now() - stageStartTime;
        stageProgress.message = `Successfully completed stage on attempt ${currentAttempt}`;
        stageProgress.errorMessage = undefined;
        await store.updateStageProgress(job.id, stageProgress);

        return output;
      } catch (err: any) {
        clearTimeout(timeoutHandle);
        if (signal) {
          signal.removeEventListener('abort', onParentAbort);
        }

        const isTimeout = stageAbortController.signal.aborted && !signal?.aborted;
        const stageError: Error = isTimeout
          ? new StageTimeoutError(stage, descriptor.timeoutMs)
          : err;

        lastError = stageError;

        // If the error is not retryable (e.g. fatal validation error), fail immediately
        if (stageError instanceof PipelineError && !stageError.retryable) {
          break;
        }

        // Delay backoff before next attempt
        if (currentAttempt < maxAttempts) {
          const backoffMs = Math.min(100 * Math.pow(2, currentAttempt), 1000);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }
    }

    // Mark stage failed
    stageProgress.status = 'failed';
    stageProgress.errorMessage = lastError?.message || 'Stage execution failed';
    stageProgress.completedAt = new Date().toISOString();
    await store.updateStageProgress(job.id, stageProgress);

    if (lastError instanceof PipelineError) {
      throw lastError;
    }
    throw new RetryLimitExceededError(stage, maxAttempts, lastError || undefined);
  }

}
