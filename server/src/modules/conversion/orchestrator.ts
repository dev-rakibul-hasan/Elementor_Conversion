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
import { getImageAnalysisPrompt, getDIRRepairPrompt, getSectionRepairPrompt, getElementorSelfHealingGatePrompt, getElementorConversionPrompt } from './prompts.js';
import { cropAsset, getImageMetadata, computeContentHash } from '../storage/image-processor.js';
import type { DIRDocument } from '../dir/types.js';

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
    sourceWidth: typeof doc.meta?.sourceWidth === 'number' && doc.meta.sourceWidth > 0 ? doc.meta.sourceWidth : (sourceAsset?.width || 1440),
    sourceHeight: typeof doc.meta?.sourceHeight === 'number' && doc.meta.sourceHeight > 0 ? doc.meta.sourceHeight : (sourceAsset?.height || 900),
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

  public async processJob(jobId: string): Promise<void> {
    logger.info({ jobId }, 'Starting conversion job execution');

    const job = await prisma.conversionJob.findUnique({
      where: { id: jobId },
      include: { project: true },
    });

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    try {
      // Stage 1: VALIDATING_UPLOAD
      await this.updateStatus(jobId, 'validating_upload', 'upload_validation');
      const sourceAsset = job.sourceAssetId
        ? await prisma.asset.findUnique({ where: { id: job.sourceAssetId } })
        : null;

      // Stage 2: ANALYZING_IMAGE -> DIR_READY
      await this.updateStatus(jobId, 'analyzing_image', 'image_analysis');

      let dirDoc: DIRDocument;
      const cachedStage = await prisma.jobStage.findFirst({
        where: { jobId, stage: 'dir_generation', status: 'completed' },
      });

      if (cachedStage && cachedStage.outputPayload) {
        logger.info({ jobId }, 'Resuming with existing DIR stage output');
        dirDoc = cachedStage.outputPayload as unknown as DIRDocument;
      } else if (job.dirArtifact) {
        logger.info({ jobId }, 'Resuming with existing DIR artifact from job');
        dirDoc = job.dirArtifact as unknown as DIRDocument;
      } else {
        dirDoc = await this.executeDIRStage(job, sourceAsset);
      }

      await this.updateStatus(jobId, 'dir_ready', 'dir_validation');

      // Resolve and extract sub-assets (e.g. hero graphic artwork, logos) from source image
      await this.resolveAndExtractAssets(job, sourceAsset, dirDoc);

      // Stage 3: GENERATING_ELEMENTOR (Stage C)
      await this.updateStatus(jobId, 'generating_elementor', 'elementor_generation');

      let initialDoc: any = null;
      let report: any = null;

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
              logger.info({ jobId }, 'Stage C: Skill-aware AI Elementor generation succeeded');
            }
          }
        } catch (aiGenErr: any) {
          logger.warn({ jobId, err: aiGenErr?.message }, 'Stage C skill-aware AI generation skipped or failed; using compiler');
        }
      }

      if (!initialDoc) {
        const compiled = convertDIRToElementor(dirDoc);
        initialDoc = compiled.document;
        report = compiled.report;
      }

      // Stage 4: VALIDATING_ELEMENTOR & SELF-HEALING GATE (Stage D)
      await this.updateStatus(jobId, 'validating_elementor', 'elementor_validation');
      let elementorDoc = initialDoc;
      let validation = validateElementor(elementorDoc);

      // Execute Stage D Self-Healing Gate if review provider is available or validation found issues
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
          logger.warn({ jobId, err: healErr?.message }, 'Stage D AI self-healing gate encountered error; adhering to compiled AST');
        }
      }

      // Verify deterministic visual quality & structural completeness
      const qualityAudit = this.verifyVisualQuality(dirDoc, elementorDoc);
      logger.info({ jobId, qualityAudit }, 'Visual quality verification passed');

      if (!validation.valid) {
        logger.warn({ jobId, errors: validation.errors }, 'Elementor validation warnings/errors encountered');
      }

      await prisma.jobStage.create({
        data: {
          jobId: job.id,
          stage: 'elementor_validation',
          status: 'completed',
          outputPayload: {
            valid: validation.valid,
            qualityAudit,
            widgetsUsed: Array.from(report.widgetsUsed),
            elementCount: report.elementCount,
          } as any,
          durationMs: 0,
        },
      });

      // Save Elementor JSON artifact
      const serialized = serializeElementorTemplate(elementorDoc);
      const elementorBuffer = Buffer.from(serialized, 'utf-8');
      const storageKey = `projects/${job.projectId}/elementor-${jobId}.json`;
      const uploadRes = await this.storage.upload(storageKey, elementorBuffer, 'application/json');

      await prisma.asset.create({
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
            widgetsUsed: report.widgetsUsed,
            qualityAudit: qualityAudit as any,
          },
        },
      });

      // Update job to preview_ready
      await prisma.conversionJob.update({
        where: { id: jobId },
        data: {
          status: 'preview_ready',
          currentStage: 'preview_rendering',
          dirArtifact: dirDoc as any,
          elementorArtifact: elementorDoc as any,
        },
      });

      logger.info({ jobId }, 'Conversion job completed successfully');
    } catch (err: any) {
      logger.error({ jobId, error: err.message }, 'Conversion job failed');
      try {
        await prisma.conversionJob.update({
          where: { id: jobId },
          data: {
            status: 'failed',
            errorMessage: err.message,
            errorDetails: { stack: err.stack },
          },
        });
      } catch {
        // Job record might have been deleted concurrently
      }
      throw err;
    }
  }

  private async executeDIRStage(job: any, sourceAsset: any): Promise<DIRDocument> {
    const prompt = getImageAnalysisPrompt({
      width: sourceAsset?.width || 1440,
      height: sourceAsset?.height || 900,
      mimeType: sourceAsset?.mimeType || 'image/png',
      sha256: sourceAsset?.sha256 || 'mock-hash',
    });

    const userParts: any[] = [
      { type: 'text', text: prompt.userPrompt },
    ];

    if (sourceAsset?.storagePath) {
      try {
        const imgBuffer = await this.storage.download(sourceAsset.storagePath);
        const mime = sourceAsset.mimeType || 'image/png';
        const dataUri = `data:${mime};base64,${imgBuffer.toString('base64')}`;
        userParts.push({
          type: 'image_url',
          image_url: { url: dataUri },
        });
      } catch (err: any) {
        logger.warn({ storagePath: sourceAsset.storagePath, err: err?.message }, 'Could not attach image buffer to vision request');
      }
    }

    const sourceHash = sourceAsset?.sha256 || 'mock-hash';
    const schemaVer = '1.0.0';
    const skillVer = '1.0.0';
    const promptVer = prompt.version;

    const aiRes = await this.aiRouter.execute({
      role: 'vision',
      messages: [
        { role: 'system', content: prompt.systemPrompt },
        { role: 'user', content: userParts.length > 1 ? userParts : prompt.userPrompt },
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
      logger.warn({ jobId: job.id, provider: aiRes.provider }, 'AI vision response was truncated by output token limit (finishReason: length)');
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
        throw new Error('AI generation was truncated due to output token limit (finish_reason: length). Could not parse complete DIR JSON.');
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
              logger.warn({ secIdx, error: err?.message }, 'Section-level repair failed; will fall back to document repair');
            }
          }
        }

        // Re-validate after section repairs
        currentDoc = normalizeDIR(currentDoc);
        enforceFactualMetadata(currentDoc, sourceHash, sourceAsset, aiRes.provider, aiRes.model, promptVer);
        validation = validateDIR(currentDoc);
      }

      // Strategy 2: Document-level bounded repair if still invalid (max 2 attempts)
      let attempt = 0;
      const maxAttempts = 2;

      while (!validation.valid && attempt < maxAttempts) {
        attempt++;
        logger.info({ attempt, maxAttempts, errorCount: validation.errors.length }, 'Executing document-level DIR repair');

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
          throw new Error('DIR repair output was truncated by output token limit (finish_reason: length). Document cannot be safely repaired as a single monolith.');
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

    // Persist Validated Stage Result
    await prisma.jobStage.create({
      data: {
        jobId: job.id,
        stage: 'dir_generation',
        status: 'completed',
        outputPayload: validDoc as any,
        providerName: aiRes.provider,
        modelName: aiRes.model,
        tokensUsed: aiRes.usage.inputTokens + aiRes.usage.outputTokens,
        durationMs: aiRes.latencyMs,
      },
    });

    return validDoc;
  }

  private async resolveAndExtractAssets(
    job: any,
    sourceAsset: any,
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

    // 3. Download source asset buffer if available for cropping
    let sourceBuffer: Buffer | null = null;
    let meta: { width: number; height: number } | null = null;
    if (sourceAsset?.storagePath) {
      try {
        sourceBuffer = await this.storage.download(sourceAsset.storagePath);
        meta = await getImageMetadata(sourceBuffer);
      } catch (err: any) {
        logger.warn({ storagePath: sourceAsset.storagePath, err: err?.message }, 'Could not download/inspect source asset for sub-asset extraction');
      }
    }

    // 4. Resolve and extract cropped assets for all visual assets or referenced assets
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

    // 5. Propagate resolved URLs down to all image nodes in the DIR tree
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
        throw new Error(`Quality verification failed: Page "${page.id || page.name || 'unnamed'}" contains no sections`);
      }
      for (const sec of page.sections) {
        totalSections++;
        const children = sec.children || (sec as any).nodes || (sec as any).elements;
        if (!children || !Array.isArray(children) || children.length === 0) {
          throw new Error(`Quality verification failed: Section "${sec.id || sec.role || 'unnamed'}" contains 0 elements`);
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

    const headerSection = dirDoc.pages?.[0]?.sections?.find((s) => s.role === 'header' || s.role === 'navigation');
    if (headerSection) {
      const headerContainer = elementorDoc.content?.find(
        (el: any) => el.settings?._section_role === 'header' || el.settings?._section_role === 'navigation'
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
