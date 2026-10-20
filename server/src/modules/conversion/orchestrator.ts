/**
 * Conversion Module — Orchestrator
 * Coordinates image analysis -> DIR generation -> validation & repair -> Elementor compilation -> artifact persistence
 */

import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/index.js';
import { getAIRouter } from '../ai/router.js';
import { validateDIR, parseDIRFromAIOutput } from '../dir/schema.js';
import { normalizeDIR, normalizeSection } from '../dir/normalizer.js';
import { convertDIRToElementor } from '../elementor/generator.js';
import { validateElementor } from '../elementor/validator.js';
import { serializeElementorTemplate } from '../elementor/serializer.js';
import { getStorage } from '../storage/factory.js';
import {
  getImageAnalysisPrompt,
  getDIRRepairPrompt,
  getSectionRepairPrompt,
  getElementorSelfHealingGatePrompt,
  getElementorConversionPrompt,
} from './prompts.js';
import { cropAsset, getImageMetadata, computeContentHash } from '../storage/image-processor.js';
import type { DIRDocument } from '../dir/types.js';
import type { ConversionReport, ElementorValidationStats } from '../elementor/types.js';
import type { StageName } from '@prisma/client';

export interface QualityAuditResult {
  passed: boolean;
  totalPages: number;
  totalSections: number;
  totalDirNodes: number;
  totalContainers: number;
  totalWidgets: number;
  imageCount: number;
  resolvedImageCount: number;
  details: string;
}

export interface ProcessJobOptions {
  workerId?: string;
  attempt?: number;
}

export function buildConversionReport(
  elementorDoc: any,
  validationStats?: ElementorValidationStats,
  existingReport?: ConversionReport | null
): ConversionReport {
  let elementCount = 0;
  let containerCount = 0;
  let widgetCount = 0;
  const widgetsUsedSet = new Set<string>();

  if (existingReport?.widgetsUsed && Array.isArray(existingReport.widgetsUsed)) {
    for (const w of existingReport.widgetsUsed) {
      widgetsUsedSet.add(w);
    }
  }

  const inspect = (el: any) => {
    if (!el || typeof el !== 'object') return;
    elementCount++;
    if (el.elType === 'container' || el.elType === 'section' || el.elType === 'column') {
      containerCount++;
    } else if (el.elType === 'widget') {
      widgetCount++;
      if (el.widgetType) {
        widgetsUsedSet.add(el.widgetType);
      }
    }
    if (Array.isArray(el.elements)) {
      for (const child of el.elements) {
        inspect(child);
      }
    }
  };

  if (elementorDoc && Array.isArray(elementorDoc.content)) {
    for (const rootEl of elementorDoc.content) {
      inspect(rootEl);
    }
  }

  if (validationStats && elementCount === 0) {
    elementCount = validationStats.totalElements;
    containerCount = validationStats.containers;
    widgetCount = validationStats.widgets;
    if (validationStats.widgetTypeCounts) {
      for (const w of Object.keys(validationStats.widgetTypeCounts)) {
        widgetsUsedSet.add(w);
      }
    }
  }

  const widgetsUsed = Array.from(widgetsUsedSet);

  return {
    widgetsUsed,
    unsupportedFeatures: existingReport?.unsupportedFeatures || [],
    warnings: existingReport?.warnings || [],
    elementCount,
    containerCount,
    totalContainers: containerCount,
    widgetCount,
    totalWidgets: widgetCount,
    diagnostics: existingReport?.diagnostics || [],
    responsiveStats: existingReport?.responsiveStats,
  };
}

function enforceFactualMetadata(
  doc: any,
  sourceHash: string,
  sourceAsset: any,
  provider: string,
  model: string,
  promptVersion: string
): void {
  if (!doc || typeof doc !== 'object') return;
  doc.meta = {
    sourceImageHash: sourceHash,
    sourceWidth:
      typeof doc.meta?.sourceWidth === 'number' && doc.meta.sourceWidth > 0
        ? doc.meta.sourceWidth
        : sourceAsset?.width || 1440,
    sourceHeight:
      typeof doc.meta?.sourceHeight === 'number' && doc.meta.sourceHeight > 0
        ? doc.meta.sourceHeight
        : sourceAsset?.height || 900,
    analysisProvider: provider,
    analysisModel: model,
    analysisTimestamp: doc.meta?.analysisTimestamp || new Date().toISOString(),
    confidenceScore: typeof doc.meta?.confidenceScore === 'number' ? doc.meta.confidenceScore : 0.9,
    schemaVersion: '1.0.0',
    promptVersion: promptVersion,
    notes: Array.isArray(doc.meta?.notes) ? doc.meta.notes : [],
  };
}

export class ConversionOrchestrator {
  private aiRouter = getAIRouter();
  private storage = getStorage();

  public async recordStageStart(
    jobId: string,
    stage: StageName,
    attempt: number,
    inputPayload?: any
  ): Promise<Date> {
    const startedAt = new Date();
    try {
      await prisma.jobStage.upsert({
        where: {
          jobId_stage_attempt: {
            jobId,
            stage,
            attempt,
          },
        },
        create: {
          jobId,
          stage,
          attempt,
          status: 'processing',
          startedAt,
          inputPayload: inputPayload ?? undefined,
        },
        update: {
          status: 'processing',
          startedAt,
          errorMessage: null,
          inputPayload: inputPayload ?? undefined,
          updatedAt: startedAt,
        },
      });
    } catch (err) {
      logger.warn({ jobId, stage, attempt, err }, 'Failed to record stage start');
    }
    return startedAt;
  }

  public async recordStageCompletion(
    jobId: string,
    stage: StageName,
    attempt: number,
    startedAt: Date,
    options?: {
      outputPayload?: any;
      providerName?: string;
      modelName?: string;
      tokensUsed?: number;
    }
  ): Promise<void> {
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();
    try {
      await prisma.jobStage.upsert({
        where: {
          jobId_stage_attempt: {
            jobId,
            stage,
            attempt,
          },
        },
        create: {
          jobId,
          stage,
          attempt,
          status: 'completed',
          startedAt,
          completedAt,
          durationMs,
          outputPayload: options?.outputPayload ?? undefined,
          providerName: options?.providerName ?? undefined,
          modelName: options?.modelName ?? undefined,
          tokensUsed: options?.tokensUsed ?? undefined,
        },
        update: {
          status: 'completed',
          completedAt,
          durationMs,
          errorMessage: null,
          outputPayload: options?.outputPayload ?? undefined,
          providerName: options?.providerName ?? undefined,
          modelName: options?.modelName ?? undefined,
          tokensUsed: options?.tokensUsed ?? undefined,
          updatedAt: completedAt,
        },
      });
    } catch (err) {
      logger.warn({ jobId, stage, attempt, err }, 'Failed to record stage completion');
    }
  }

  public async recordStageFailure(
    jobId: string,
    stage: StageName,
    attempt: number,
    startedAt: Date,
    errorMessage: string
  ): Promise<void> {
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();
    try {
      await prisma.jobStage.upsert({
        where: {
          jobId_stage_attempt: {
            jobId,
            stage,
            attempt,
          },
        },
        create: {
          jobId,
          stage,
          attempt,
          status: 'failed',
          startedAt,
          completedAt,
          durationMs,
          errorMessage,
        },
        update: {
          status: 'failed',
          completedAt,
          durationMs,
          errorMessage,
          updatedAt: completedAt,
        },
      });
    } catch (err) {
      logger.warn({ jobId, stage, attempt, err }, 'Failed to record stage failure');
    }
  }

  public async processJob(jobId: string, options?: ProcessJobOptions): Promise<void> {
    logger.info({ jobId, options }, 'Starting conversion job execution');

    const job = await prisma.conversionJob.findUnique({
      where: { id: jobId },
      include: { project: true },
    });

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const now = new Date();
    // Concurrency / duplicate execution prevention
    if (options?.workerId) {
      if (job.workerId && job.workerId !== options.workerId && job.leaseExpiresAt && job.leaseExpiresAt > now) {
        throw new Error(`Job ${jobId} is actively leased to another worker (${job.workerId})`);
      }
    } else {
      if (job.workerId && job.leaseExpiresAt && job.leaseExpiresAt > now) {
        throw new Error(`Job ${jobId} is currently being processed by worker ${job.workerId}`);
      }
      // Lock for direct execution
      await prisma.conversionJob.update({
        where: { id: jobId },
        data: {
          lockedAt: now,
          leaseExpiresAt: new Date(now.getTime() + 3 * 60 * 1000),
          lastHeartbeat: now,
        },
      });
    }

    const attempt = options?.attempt ?? (job.attempts > 0 ? job.attempts : 1);
    let currentStageName: StageName | null = null;
    let stageStartTime: Date | null = null;

    try {
      // Stage 1: VALIDATING_UPLOAD
      currentStageName = 'upload_validation';
      stageStartTime = await this.recordStageStart(jobId, 'upload_validation', attempt);
      await this.updateStatus(jobId, 'validating_upload', 'upload_validation');

      if (!job.sourceAssetId) {
        throw new Error(`Job ${jobId} has no associated source asset (sourceAssetId is null)`);
      }

      const sourceAsset = await prisma.asset.findUnique({
        where: { id: job.sourceAssetId },
      });

      if (!sourceAsset) {
        throw new Error(`Source asset ${job.sourceAssetId} not found in database`);
      }

      if (!sourceAsset.storagePath) {
        throw new Error(`Source asset ${sourceAsset.id} has no valid storagePath`);
      }

      let sourceBuffer: Buffer;
      try {
        sourceBuffer = await this.storage.download(sourceAsset.storagePath);
      } catch (dlErr: any) {
        throw new Error(`Failed to read source asset image from storage: ${dlErr?.message || dlErr}`);
      }

      if (!sourceBuffer || sourceBuffer.length === 0) {
        throw new Error(`Source asset image at ${sourceAsset.storagePath} is empty (0 bytes)`);
      }

      const imageMeta = await getImageMetadata(sourceBuffer);
      if (!imageMeta || imageMeta.width <= 0 || imageMeta.height <= 0) {
        throw new Error(`Source asset at ${sourceAsset.storagePath} is not a valid image or has zero dimensions`);
      }

      await this.recordStageCompletion(jobId, 'upload_validation', attempt, stageStartTime, {
        outputPayload: {
          assetId: sourceAsset.id,
          fileName: sourceAsset.fileName,
          mimeType: sourceAsset.mimeType,
          sizeBytes: sourceBuffer.length,
          width: imageMeta.width,
          height: imageMeta.height,
        },
      });

      // Stage 2: ANALYZING_IMAGE
      currentStageName = 'image_analysis';
      stageStartTime = await this.recordStageStart(jobId, 'image_analysis', attempt);
      await this.updateStatus(jobId, 'analyzing_image', 'image_analysis');

      await this.recordStageCompletion(jobId, 'image_analysis', attempt, stageStartTime, {
        outputPayload: {
          sourceAssetId: sourceAsset.id,
          width: imageMeta.width,
          height: imageMeta.height,
          mimeType: sourceAsset.mimeType,
          sha256: sourceAsset.sha256,
        },
      });

      // Stage 3: DIR_GENERATION
      currentStageName = 'dir_generation';
      stageStartTime = await this.recordStageStart(jobId, 'dir_generation', attempt);

      let dirDoc: DIRDocument;
      let aiResMeta: { provider?: string; model?: string; tokensUsed?: number } | undefined;

      const cachedStage = await prisma.jobStage.findFirst({
        where: { jobId, stage: 'dir_generation', status: 'completed' },
        orderBy: { attempt: 'desc' },
      });

      if (cachedStage && cachedStage.outputPayload) {
        logger.info({ jobId }, 'Checking cached DIR stage output for resume');
        const validation = validateDIR(cachedStage.outputPayload as unknown as DIRDocument);
        if (validation.valid) {
          logger.info({ jobId }, 'Resuming with validated cached DIR output');
          dirDoc = cachedStage.outputPayload as unknown as DIRDocument;
        } else {
          logger.warn({ jobId }, 'Cached DIR output failed schema validation; regenerating');
          const genResult = await this.executeDIRStage(job, sourceAsset, sourceBuffer, imageMeta, attempt);
          dirDoc = genResult.dirDoc;
          aiResMeta = genResult.aiResMeta;
        }
      } else if (job.dirArtifact) {
        logger.info({ jobId }, 'Checking existing job DIR artifact for resume');
        const validation = validateDIR(job.dirArtifact as unknown as DIRDocument);
        if (validation.valid) {
          logger.info({ jobId }, 'Resuming with validated job DIR artifact');
          dirDoc = job.dirArtifact as unknown as DIRDocument;
        } else {
          logger.warn({ jobId }, 'Job DIR artifact failed schema validation; regenerating');
          const genResult = await this.executeDIRStage(job, sourceAsset, sourceBuffer, imageMeta, attempt);
          dirDoc = genResult.dirDoc;
          aiResMeta = genResult.aiResMeta;
        }
      } else {
        const genResult = await this.executeDIRStage(job, sourceAsset, sourceBuffer, imageMeta, attempt);
        dirDoc = genResult.dirDoc;
        aiResMeta = genResult.aiResMeta;
      }

      await this.recordStageCompletion(jobId, 'dir_generation', attempt, stageStartTime, {
        outputPayload: dirDoc,
        providerName: aiResMeta?.provider,
        modelName: aiResMeta?.model,
        tokensUsed: aiResMeta?.tokensUsed,
      });

      // Stage 4: DIR_VALIDATION
      currentStageName = 'dir_validation';
      stageStartTime = await this.recordStageStart(jobId, 'dir_validation', attempt);
      await this.updateStatus(jobId, 'dir_ready', 'dir_validation');

      const dirValidation = validateDIR(dirDoc);
      if (!dirValidation.valid) {
        const issues = dirValidation.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
        throw new Error(`Authoritative DIR validation failed: ${issues}`);
      }

      // Resolve and extract sub-assets (e.g. hero artwork, logos)
      await this.resolveAndExtractAssets(job, sourceAsset, sourceBuffer, imageMeta, dirDoc);

      await this.recordStageCompletion(jobId, 'dir_validation', attempt, stageStartTime, {
        outputPayload: {
          valid: true,
          pageCount: dirDoc.pages?.length || 0,
          sectionCount: dirDoc.pages?.[0]?.sections?.length || 0,
          assetCount: dirDoc.assets?.length || 0,
        },
      });

      // Stage 5: ELEMENTOR_GENERATION (Stage C)
      currentStageName = 'elementor_generation';
      stageStartTime = await this.recordStageStart(jobId, 'elementor_generation', attempt);
      await this.updateStatus(jobId, 'generating_elementor', 'elementor_generation');

      let initialDoc: any = null;
      let report: ConversionReport | null = null;
      let structureAiMeta: { provider?: string; model?: string; tokensUsed?: number } | undefined;

      const hasStructureProvider =
        (env.STRUCTURE_AI_PROVIDER && this.aiRouter.isProviderAvailable(env.STRUCTURE_AI_PROVIDER as any)) ||
        this.aiRouter.isProviderAvailable(env.AI_PROVIDER as any);

      // Attempt skill-aware AI generation if structure provider is available
      if (hasStructureProvider && env.NODE_ENV !== 'test') {
        try {
          const conversionPrompt = getElementorConversionPrompt(dirDoc);
          const aiGenRes = await this.aiRouter.execute({
            role: 'structure',
            messages: [
              { role: 'system', content: conversionPrompt.systemPrompt },
              { role: 'user', content: conversionPrompt.userPrompt },
            ],
            responseFormat: { type: 'json_object' },
            maxTokens: 16384,
          });
          if (aiGenRes.content && aiGenRes.finishReason !== 'length') {
            const parsed = JSON.parse(aiGenRes.content);
            const val = validateElementor(parsed);
            if (val.valid) {
              initialDoc = parsed;
              report = buildConversionReport(parsed, val.stats);
              structureAiMeta = {
                provider: aiGenRes.provider,
                model: aiGenRes.model,
                tokensUsed: (aiGenRes.usage?.inputTokens || 0) + (aiGenRes.usage?.outputTokens || 0),
              };
              logger.info({ jobId }, 'Stage C: Skill-aware AI Elementor generation succeeded');
            }
          }
        } catch (aiGenErr: any) {
          logger.warn(
            { jobId, err: aiGenErr?.message },
            'Stage C skill-aware AI generation skipped or failed; using compiler'
          );
        }
      }

      if (!initialDoc) {
        const compiled = convertDIRToElementor(dirDoc);
        initialDoc = compiled.document;
        report = compiled.report;
      }

      // Ensure report is always initialized
      if (!report) {
        const val = validateElementor(initialDoc);
        report = buildConversionReport(initialDoc, val.stats);
      }

      await this.recordStageCompletion(jobId, 'elementor_generation', attempt, stageStartTime, {
        outputPayload: {
          elementCount: report.elementCount,
          containerCount: report.containerCount,
          widgetCount: report.widgetCount,
          widgetsUsed: report.widgetsUsed,
        },
        providerName: structureAiMeta?.provider,
        modelName: structureAiMeta?.model,
        tokensUsed: structureAiMeta?.tokensUsed,
      });

      // Stage 6: ELEMENTOR_VALIDATION & SELF-HEALING GATE (Stage D)
      currentStageName = 'elementor_validation';
      stageStartTime = await this.recordStageStart(jobId, 'elementor_validation', attempt);
      await this.updateStatus(jobId, 'validating_elementor', 'elementor_validation');

      let elementorDoc = initialDoc;
      let validation = validateElementor(elementorDoc);

      // Execute Stage D Self-Healing Gate if review provider is available and validation found issues
      if (this.aiRouter.isProviderAvailable('openrouter') && !validation.valid) {
        try {
          const healingPrompt = getElementorSelfHealingGatePrompt(dirDoc, elementorDoc, validation.errors);
          const healRes = await this.aiRouter.execute({
            role: 'review',
            messages: [
              { role: 'system', content: healingPrompt.systemPrompt },
              { role: 'user', content: healingPrompt.userPrompt },
            ],
            responseFormat: { type: 'json_object' },
            bypassCache: true,
            maxTokens: 16384,
          });

          if (healRes.content && healRes.finishReason !== 'length') {
            const healedJson = JSON.parse(healRes.content);
            const healedValidation = validateElementor(healedJson);
            if (healedValidation.valid) {
              elementorDoc = healedJson;
              validation = healedValidation;
              logger.info({ jobId }, 'Stage D Self-Healing Gate successfully patched and validated Elementor AST');
            }
          }
        } catch (healErr: any) {
          logger.warn(
            { jobId, err: healErr?.message },
            'Stage D AI self-healing gate encountered error; adhering to compiled AST'
          );
        }
      }

      // Authoritative validation check — re-validate and fail if invalid
      if (!validation.valid) {
        const issueStr = validation.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
        throw new Error(`Authoritative Elementor validation failed: ${issueStr}`);
      }

      // Verify deterministic visual quality & structural completeness
      const qualityAudit = this.verifyVisualQuality(dirDoc, elementorDoc);
      logger.info({ jobId, qualityAudit }, 'Visual quality verification passed');

      // Update report with final validated document stats
      report = buildConversionReport(elementorDoc, validation.stats, report);

      await this.recordStageCompletion(jobId, 'elementor_validation', attempt, stageStartTime, {
        outputPayload: {
          valid: true,
          qualityAudit,
          widgetsUsed: report.widgetsUsed,
          elementCount: report.elementCount,
          containerCount: report.containerCount,
          widgetCount: report.widgetCount,
        },
      });

      // Stage 7: PREVIEW_RENDERING & ARTIFACT PERSISTENCE
      currentStageName = 'preview_rendering';
      stageStartTime = await this.recordStageStart(jobId, 'preview_rendering', attempt);

      // Save Elementor JSON artifact
      const serialized = serializeElementorTemplate(elementorDoc);
      const elementorBuffer = Buffer.from(serialized, 'utf-8');
      const storageKey = `projects/${job.projectId}/elementor-${jobId}.json`;
      const uploadRes = await this.storage.upload(storageKey, elementorBuffer, 'application/json');

      const elementorAsset = await prisma.asset.create({
        data: {
          projectId: job.projectId,
          fileName: `elementor-${jobId}.json`,
          mimeType: 'application/json',
          sizeBytes: BigInt(uploadRes.size),
          storageProvider: 'local',
          storagePath: uploadRes.key,
          sha256: uploadRes.contentHash,
          metadata: {
            elementCount: report.elementCount,
            containerCount: report.containerCount,
            widgetCount: report.widgetCount,
            widgetsUsed: report.widgetsUsed,
            qualityAudit: qualityAudit as any,
          },
        },
      });

      const previewArtifact = {
        elementorAssetId: elementorAsset.id,
        storagePath: uploadRes.key,
        elementCount: report.elementCount,
        containerCount: report.containerCount,
        widgetCount: report.widgetCount,
        widgetsUsed: report.widgetsUsed,
        qualityAudit,
        visualQuality: qualityAudit,
        renderedAt: new Date().toISOString(),
      };

      // Update job to preview_ready with all verified artifacts
      await prisma.conversionJob.update({
        where: { id: jobId },
        data: {
          status: 'preview_ready',
          currentStage: 'preview_rendering',
          dirArtifact: dirDoc as any,
          elementorArtifact: elementorDoc as any,
          previewArtifact: previewArtifact as any,
        },
      });

      await this.recordStageCompletion(jobId, 'preview_rendering', attempt, stageStartTime, {
        outputPayload: previewArtifact,
      });

      logger.info({ jobId }, 'Conversion job completed successfully through all 7 stages');
    } catch (err: any) {
      logger.error({ jobId, error: err.message }, 'Conversion job failed');

      if (currentStageName && stageStartTime) {
        await this.recordStageFailure(jobId, currentStageName, attempt, stageStartTime, err.message);
      }

      if (!options?.workerId) {
        try {
          await prisma.conversionJob.update({
            where: { id: jobId },
            data: {
              status: 'failed',
              errorMessage: err.message,
              errorDetails: { stack: err.stack },
              lockedAt: null,
              leaseExpiresAt: null,
              workerId: null,
            },
          });
        } catch {
          // Job record might have been deleted concurrently
        }
      }
      throw err;
    }
  }

  private async executeDIRStage(
    job: any,
    sourceAsset: any,
    sourceBuffer: Buffer,
    sourceMeta: { width: number; height: number },
    attempt: number
  ): Promise<{
    dirDoc: DIRDocument;
    aiResMeta: { provider: string; model: string; tokensUsed: number };
  }> {
    const prompt = getImageAnalysisPrompt({
      width: sourceMeta.width || sourceAsset?.width || 1440,
      height: sourceMeta.height || sourceAsset?.height || 900,
      mimeType: sourceAsset?.mimeType || 'image/png',
      sha256: sourceAsset?.sha256 || 'mock-hash',
    });

    const mime = sourceAsset.mimeType || 'image/png';
    const dataUri = `data:${mime};base64,${sourceBuffer.toString('base64')}`;
    const userParts: any[] = [
      { type: 'text', text: prompt.userPrompt },
      {
        type: 'image_url',
        image_url: { url: dataUri },
      },
    ];

    const sourceHash = sourceAsset?.sha256 || 'mock-hash';
    const schemaVer = '1.0.0';
    const skillVer = '1.0.0';
    const promptVer = prompt.version;

    const aiRes = await this.aiRouter.execute({
      role: 'vision',
      messages: [
        { role: 'system', content: prompt.systemPrompt },
        { role: 'user', content: userParts },
      ],
      responseFormat: { type: 'json_object' },
      sourceImageHash: sourceHash,
      schemaVersion: schemaVer,
      skillVersion: skillVer,
      promptVersion: promptVer,
      stageName: 'dir_generation',
      maxTokens: 16384,
    });

    // Check for explicit output truncation
    if (aiRes.finishReason === 'length') {
      logger.warn(
        { jobId: job.id, provider: aiRes.provider },
        'AI vision response was truncated by output token limit (finishReason: length)'
      );
      const cacheKey = this.aiRouter.computeCacheKey({
        sourceImageHash: sourceHash,
        schemaVersion: schemaVer,
        promptVersion: promptVer,
        provider: aiRes.provider,
        model: aiRes.model,
        stage: 'dir_generation',
      });
      await this.aiRouter.invalidateCacheKey(cacheKey);
    }

    const parsed = parseDIRFromAIOutput(aiRes.content);
    if ('error' in parsed) {
      const cacheKey = this.aiRouter.computeCacheKey({
        sourceImageHash: sourceHash,
        schemaVersion: schemaVer,
        promptVersion: promptVer,
        provider: aiRes.provider,
        model: aiRes.model,
        stage: 'dir_generation',
      });
      await this.aiRouter.invalidateCacheKey(cacheKey);

      if (aiRes.finishReason === 'length') {
        throw new Error(
          'AI generation was truncated due to output token limit (finish_reason: length). Could not parse complete DIR JSON.'
        );
      }
      throw new Error(`Failed to parse AI output as DIR JSON: ${parsed.error}`);
    }

    let currentDoc: any = normalizeDIR(parsed.parsed);
    enforceFactualMetadata(currentDoc, sourceHash, sourceAsset, aiRes.provider, aiRes.model, promptVer);
    let validation = validateDIR(currentDoc);

    // If cached response was returned but is invalid, invalidate it
    if (!validation.valid && aiRes.cached) {
      logger.warn({ jobId: job.id }, 'Cached AI response failed schema validation; invalidating cache entry');
      const cacheKey = this.aiRouter.computeCacheKey({
        sourceImageHash: sourceHash,
        schemaVersion: schemaVer,
        promptVersion: promptVer,
        provider: aiRes.provider,
        model: aiRes.model,
        stage: 'dir_generation',
      });
      await this.aiRouter.invalidateCacheKey(cacheKey);
    }

    // Attempt Bounded Repair if invalid
    if (!validation.valid) {
      logger.warn({ errors: validation.errors }, 'DIR validation failed, executing bounded repair');

      // Strategy 1: Section-level targeted repair if errors are isolated to sections
      const sectionErrorMap = new Map<number, typeof validation.errors>();
      let hasRootErrors = false;

      for (const err of validation.errors) {
        const match = err.path.match(/^pages\.\d+\.sections\.(\d+)(?:\.(.*))?$/);
        if (match) {
          const secIdx = parseInt(match[1], 10);
          const subPath = match[2] || '';
          const list = sectionErrorMap.get(secIdx) || [];
          list.push({ ...err, path: subPath });
          sectionErrorMap.set(secIdx, list);
        } else {
          hasRootErrors = true;
        }
      }

      const hasSections = Array.isArray(currentDoc?.pages?.[0]?.sections);
      if (!hasRootErrors && hasSections && sectionErrorMap.size > 0 && sectionErrorMap.size <= 5) {
        logger.info({ sectionCount: sectionErrorMap.size }, 'Repairing isolated invalid sections');
        for (const [secIdx, secErrors] of sectionErrorMap.entries()) {
          const targetSection = currentDoc.pages[0].sections[secIdx];
          if (targetSection) {
            try {
              const secPrompt = getSectionRepairPrompt(targetSection, secErrors);
              const secRes = await this.aiRouter.execute({
                role: 'structure',
                messages: [
                  { role: 'system', content: secPrompt.systemPrompt },
                  { role: 'user', content: secPrompt.userPrompt },
                ],
                responseFormat: { type: 'json_object' },
                bypassCache: true,
                maxTokens: 4096,
              });
              if (secRes.finishReason !== 'length' && secRes.content) {
                const rawSec = JSON.parse(secRes.content);
                currentDoc.pages[0].sections[secIdx] = normalizeSection(rawSec);
              }
            } catch (err: any) {
              logger.warn(
                { secIdx, error: err?.message },
                'Section-level repair failed; will fall back to document repair'
              );
            }
          }
        }

        // Re-validate after section repairs
        currentDoc = normalizeDIR(currentDoc);
        enforceFactualMetadata(currentDoc, sourceHash, sourceAsset, aiRes.provider, aiRes.model, promptVer);
        validation = validateDIR(currentDoc);
      }

      // Strategy 2: Document-level bounded repair if still invalid (max 2 attempts)
      let repairAttempt = 0;
      const maxRepairAttempts = 2;

      while (!validation.valid && repairAttempt < maxRepairAttempts) {
        repairAttempt++;
        logger.info(
          { attempt: repairAttempt, maxAttempts: maxRepairAttempts, errorCount: validation.errors.length },
          'Executing document-level DIR repair'
        );

        const repairPrompt = getDIRRepairPrompt(currentDoc, validation.errors);
        const repairRes = await this.aiRouter.execute({
          role: 'structure',
          messages: [
            { role: 'system', content: repairPrompt.systemPrompt },
            { role: 'user', content: repairPrompt.userPrompt },
          ],
          responseFormat: { type: 'json_object' },
          promptVersion: repairPrompt.version,
          schemaVersion: schemaVer,
          stageName: 'dir_repair',
          bypassCache: true,
          maxTokens: 16384,
        });

        if (repairRes.finishReason === 'length') {
          logger.warn('DIR repair output was truncated by token limit (finish_reason: length)');
          throw new Error(
            'DIR repair output was truncated by output token limit (finish_reason: length). Document cannot be safely repaired as a single monolith.'
          );
        }

        const repairedParsed = parseDIRFromAIOutput(repairRes.content);
        if ('error' in repairedParsed) {
          throw new Error(`Failed to parse repaired DIR JSON: ${repairedParsed.error}`);
        }

        currentDoc = normalizeDIR(repairedParsed.parsed);
        enforceFactualMetadata(currentDoc, sourceHash, sourceAsset, aiRes.provider, aiRes.model, promptVer);
        validation = validateDIR(currentDoc);
      }

      if (!validation.valid) {
        const issues = validation.errors.map((e) => `\n- ${e.path}: ${e.message}`).join('');
        throw new Error(`DIR remained invalid after repair:${issues}`);
      }
    }

    const validDoc = validation.document!;
    return {
      dirDoc: validDoc,
      aiResMeta: {
        provider: aiRes.provider,
        model: aiRes.model,
        tokensUsed: (aiRes.usage?.inputTokens || 0) + (aiRes.usage?.outputTokens || 0),
      },
    };
  }

  private async resolveAndExtractAssets(
    job: any,
    sourceAsset: any,
    sourceBuffer: Buffer,
    meta: { width: number; height: number },
    dirDoc: DIRDocument
  ): Promise<void> {
    if (!dirDoc.assets) {
      dirDoc.assets = [];
    }

    // 1. Traverse all pages and sections to collect all image nodes
    const imageNodes: any[] = [];
    const collectImageNodes = (node: any) => {
      if (node.kind === 'image') {
        imageNodes.push(node);
      }
      const children = node.children || node.nodes || node.elements;
      if (children && Array.isArray(children)) {
        for (const child of children) {
          collectImageNodes(child);
        }
      }
    };

    if (dirDoc.pages) {
      for (const page of dirDoc.pages) {
        if (page.sections) {
          for (const sec of page.sections) {
            const secChildren = sec.children || (sec as any).nodes || (sec as any).elements;
            if (secChildren && Array.isArray(secChildren)) {
              for (const child of secChildren) {
                collectImageNodes(child);
              }
            }
          }
        }
      }
    }

    // 2. Ensure every image node has an asset registered in dirDoc.assets
    for (const node of imageNodes) {
      if (!node.assetId) {
        node.assetId = `asset_${node.id || Math.random().toString(36).substring(2, 9)}`;
      }
      if (!dirDoc.assets.some((a) => a.id === node.assetId)) {
        dirDoc.assets.push({
          id: node.assetId,
          type: 'image',
          role: node.alt || 'page-image',
          confidence: node.confidence || 0.95,
          sourceRect: (node as any).sourceRect,
        });
      }
    }

    // 3. Resolve and extract cropped assets for all visual assets or referenced assets
    for (const asset of dirDoc.assets) {
      const isReferencedByImage = imageNodes.some((n) => n.assetId === asset.id);
      const isVisualType = ['image', 'logo', 'icon', 'background', 'placeholder'].includes(asset.type);

      if ((isVisualType || isReferencedByImage) && !asset.placeholder) {
        let cropBuffer: Buffer | null = null;

        if (sourceBuffer) {
          // Attempt A: Exact bounding box cropping from sourceRect
          if (asset.sourceRect && asset.sourceRect.width >= 4 && asset.sourceRect.height >= 4) {
            let safeRect = asset.sourceRect;
            if (meta && meta.width > 0 && meta.height > 0) {
              const clampedX = Math.max(0, Math.min(meta.width - 1, safeRect.x));
              const clampedY = Math.max(0, Math.min(meta.height - 1, safeRect.y));
              const clampedWidth = Math.min(meta.width - clampedX, Math.max(4, safeRect.width));
              const clampedHeight = Math.min(meta.height - clampedY, Math.max(4, safeRect.height));
              safeRect = { x: clampedX, y: clampedY, width: clampedWidth, height: clampedHeight };
            }
            try {
              cropBuffer = await cropAsset(sourceBuffer, safeRect);
            } catch (cropErr: any) {
              logger.warn({ assetId: asset.id, err: cropErr?.message }, 'Failed to crop asset from sourceRect');
            }
          }

          // Attempt B: Proportional fallback extraction based on role/type if sourceRect failed or missing
          if (!cropBuffer) {
            try {
              const imgMeta = meta || (await getImageMetadata(sourceBuffer));
              const w = imgMeta.width;
              const h = imgMeta.height;
              const roleLower = (asset.role || '').toLowerCase();

              let fallbackRect = {
                x: Math.round(w * 0.15),
                y: Math.round(h * 0.2),
                width: Math.round(w * 0.7),
                height: Math.round(h * 0.55),
              };

              if (asset.type === 'logo' || roleLower.includes('logo') || roleLower.includes('crest')) {
                fallbackRect = {
                  x: Math.round(w * 0.05),
                  y: Math.round(h * 0.03),
                  width: Math.min(w, Math.max(32, Math.round(w * 0.25))),
                  height: Math.min(h, Math.max(24, Math.round(h * 0.12))),
                };
              } else if (asset.type === 'icon' || roleLower.includes('icon') || roleLower.includes('dumbbell')) {
                fallbackRect = {
                  x: Math.round(w * 0.1),
                  y: Math.round(h * 0.05),
                  width: Math.min(w, Math.max(24, Math.round(w * 0.1))),
                  height: Math.min(h, Math.max(24, Math.round(h * 0.08))),
                };
              }

              cropBuffer = await cropAsset(sourceBuffer, fallbackRect);
            } catch (fallbackErr: any) {
              logger.warn({ assetId: asset.id, err: fallbackErr?.message }, 'Failed to extract fallback crop region');
            }
          }
        }

        // Attempt C: Persist extracted cropBuffer to local storage & DB
        if (cropBuffer) {
          try {
            const assetHash = computeContentHash(cropBuffer);
            const storageKey = `projects/${job.projectId}/assets/${asset.id}_${assetHash.slice(0, 8)}.png`;
            const uploadRes = await this.storage.upload(storageKey, cropBuffer, 'image/png');
            const assetUrl = `/storage/${uploadRes.key}`;
            asset.placeholder = assetUrl;

            await prisma.asset.create({
              data: {
                projectId: job.projectId,
                fileName: `${asset.id}.png`,
                mimeType: 'image/png',
                sizeBytes: BigInt(cropBuffer.length),
                storageProvider: 'local',
                storagePath: uploadRes.key,
                sha256: assetHash,
                metadata: {
                  extractedFromAssetId: sourceAsset?.id || null,
                  role: asset.role,
                },
              },
            });
            logger.info({ assetId: asset.id, storageKey }, 'Extracted and persisted cropped asset');
          } catch (uploadErr: any) {
            logger.warn({ assetId: asset.id, err: uploadErr?.message }, 'Failed to store extracted asset');
          }
        }

        // Attempt D: If cropBuffer not available, fallback to sourceAsset storagePath or inline SVG
        if (!asset.placeholder) {
          if (sourceAsset?.storagePath) {
            asset.placeholder = `/storage/${sourceAsset.storagePath}`;
          } else {
            const safeLabel = encodeURIComponent(asset.role || asset.id || 'Image');
            asset.placeholder = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="100%" height="100%" fill="%231e293b"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%2394a3b8" font-family="sans-serif" font-size="14">${safeLabel}</text></svg>`;
          }
        }
      }
    }

    // 4. Propagate resolved URLs down to all image nodes in the DIR tree
    const updateNodeUrls = (node: any) => {
      if (node.kind === 'image') {
        if (!node.url && node.assetId) {
          const matching = dirDoc.assets?.find((a) => a.id === node.assetId);
          if (matching?.placeholder) {
            node.url = matching.placeholder;
          }
        }
        if (!node.url && sourceAsset?.storagePath) {
          node.url = `/storage/${sourceAsset.storagePath}`;
        }
        if (!node.url) {
          const safeAlt = encodeURIComponent(node.alt || 'Image');
          node.url = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="100%" height="100%" fill="%231e293b"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%2394a3b8" font-family="sans-serif" font-size="14">${safeAlt}</text></svg>`;
        }
      }
      const children = node.children || node.nodes || node.elements;
      if (children && Array.isArray(children)) {
        for (const child of children) {
          updateNodeUrls(child);
        }
      }
    };

    if (dirDoc.pages) {
      for (const page of dirDoc.pages) {
        if (page.sections) {
          for (const sec of page.sections) {
            const secChildren = sec.children || (sec as any).nodes || (sec as any).elements;
            if (secChildren && Array.isArray(secChildren)) {
              for (const child of secChildren) {
                updateNodeUrls(child);
              }
            }
          }
        }
      }
    }
  }

  public verifyVisualQuality(dirDoc: DIRDocument, elementorDoc: any): QualityAuditResult {
    if (!dirDoc.pages || !Array.isArray(dirDoc.pages) || dirDoc.pages.length === 0) {
      throw new Error('Quality verification failed: DIR document contains no pages');
    }

    let totalDirNodes = 0;
    let totalSections = 0;

    for (const page of dirDoc.pages) {
      if (!page.sections || !Array.isArray(page.sections) || page.sections.length === 0) {
        throw new Error(
          `Quality verification failed: Page "${page.id || page.name || 'unnamed'}" contains no sections`
        );
      }
      for (const sec of page.sections) {
        totalSections++;
        const children = sec.children || (sec as any).nodes || (sec as any).elements;
        if (!children || !Array.isArray(children) || children.length === 0) {
          throw new Error(
            `Quality verification failed: Section "${sec.id || sec.role || 'unnamed'}" contains 0 elements`
          );
        }
        totalDirNodes += this.countNodesRecursive(children);
      }
    }

    if (totalDirNodes === 0) {
      throw new Error('Quality verification failed: DIR document contains 0 elements');
    }

    if (!elementorDoc?.content || !Array.isArray(elementorDoc.content) || elementorDoc.content.length === 0) {
      throw new Error('Quality verification failed: Elementor template content is empty');
    }

    let totalContainers = 0;
    let totalWidgets = 0;
    let imageCount = 0;
    let resolvedImageCount = 0;

    const inspectElement = (el: any) => {
      if (el.elType === 'container' || el.elType === 'section' || el.elType === 'column') {
        totalContainers++;
      } else if (el.elType === 'widget') {
        totalWidgets++;
        if (el.widgetType === 'image') {
          imageCount++;
          const url = el.settings?.image?.url;
          if (url && typeof url === 'string' && url.trim().length > 0) {
            resolvedImageCount++;
          } else {
            throw new Error(`Quality verification failed: Image widget "${el.id}" has no resolved image URL`);
          }
        }
      }
      if (el.elements && Array.isArray(el.elements)) {
        for (const child of el.elements) {
          inspectElement(child);
        }
      }
    };

    for (const rootEl of elementorDoc.content) {
      inspectElement(rootEl);
    }

    if (totalContainers === 0) {
      throw new Error('Quality verification failed: Elementor template contains 0 containers');
    }

    if (totalWidgets === 0) {
      throw new Error('Quality verification failed: Elementor template contains 0 widgets');
    }

    const pageBg = dirDoc.globals?.colors?.background;
    if (pageBg && pageBg !== 'transparent') {
      if (elementorDoc.page_settings?.background_color !== pageBg) {
        logger.warn(
          { expectedBg: pageBg, actualBg: elementorDoc.page_settings?.background_color },
          'Visual quality warning: page settings background does not match DIR globals'
        );
      }
    }

    const heroSection = dirDoc.pages?.[0]?.sections?.find((s) => s.role === 'hero');
    if (heroSection) {
      const hasHeading = (elements: any[]): boolean => {
        for (const el of elements) {
          if (el.widgetType === 'heading' && el.settings?.title) return true;
          if (el.elements && hasHeading(el.elements)) return true;
        }
        return false;
      };
      if (!hasHeading(elementorDoc.content)) {
        logger.warn('Visual quality warning: Hero section does not contain a populated heading widget');
      }
    }

    const headerSection = dirDoc.pages?.[0]?.sections?.find(
      (s) => s.role === 'header' || s.role === 'navigation'
    );
    if (headerSection) {
      const headerContainer = elementorDoc.content?.find(
        (el: any) =>
          el.settings?._section_role === 'header' || el.settings?._section_role === 'navigation'
      );
      if (headerContainer && headerContainer.settings?.flex_direction !== 'row') {
        logger.warn('Visual quality warning: Header section flex_direction is not set to row');
      }
    }

    return {
      passed: true,
      totalPages: dirDoc.pages.length,
      totalSections,
      totalDirNodes,
      totalContainers,
      totalWidgets,
      imageCount,
      resolvedImageCount,
      details: `Verified ${totalSections} sections, ${totalDirNodes} DIR elements, ${totalContainers} containers, ${totalWidgets} widgets, ${resolvedImageCount}/${imageCount} resolved images`,
    };
  }

  private countNodesRecursive(nodes: any[]): number {
    let count = 0;
    for (const node of nodes) {
      count++;
      const children = (node as any).children || (node as any).nodes || (node as any).elements;
      if (children && Array.isArray(children)) {
        count += this.countNodesRecursive(children);
      }
    }
    return count;
  }

  private async updateStatus(jobId: string, status: any, currentStage: any): Promise<void> {
    try {
      await prisma.conversionJob.update({
        where: { id: jobId },
        data: { status, currentStage, lastHeartbeat: new Date() },
      });
    } catch {
      // Job record might have been deleted concurrently
    }
  }
}

let orchestratorInstance: ConversionOrchestrator | null = null;

export function getConversionOrchestrator(): ConversionOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new ConversionOrchestrator();
  }
  return orchestratorInstance;
}
