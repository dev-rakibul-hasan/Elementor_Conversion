/**
 * Canonical Pipeline Stage & Status Definitions
 * Architecture Lead: Mubasshir
 * 
 * Defines the 7 authoritative pipeline stages, lifecycle states,
 * execution ordering, and progress mapping for the Design-to-Elementor system.
 */

/**
 * The 7 Canonical Pipeline Stages (+ optional downstream publishing).
 */
export const PIPELINE_STAGES = {
  UPLOAD_VALIDATION: 'upload_validation',
  IMAGE_ANALYSIS: 'image_analysis',
  DIR_GENERATION: 'dir_generation',
  DIR_VALIDATION: 'dir_validation',
  ELEMENTOR_GENERATION: 'elementor_generation',
  ELEMENTOR_VALIDATION: 'elementor_validation',
  PREVIEW_RENDERING: 'preview_rendering',
  PUBLISHING: 'publishing',
} as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[keyof typeof PIPELINE_STAGES];

/**
 * Strict canonical execution order for the 7 conversion pipeline stages.
 */
export const PIPELINE_STAGE_ORDER: readonly PipelineStage[] = [
  PIPELINE_STAGES.UPLOAD_VALIDATION,
  PIPELINE_STAGES.IMAGE_ANALYSIS,
  PIPELINE_STAGES.DIR_GENERATION,
  PIPELINE_STAGES.DIR_VALIDATION,
  PIPELINE_STAGES.ELEMENTOR_GENERATION,
  PIPELINE_STAGES.ELEMENTOR_VALIDATION,
  PIPELINE_STAGES.PREVIEW_RENDERING,
] as const;

/**
 * Execution status for an individual stage.
 */
export type StageStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';

/**
 * Top-level job execution lifecycle status.
 */
export type JobStatus =
  | 'queued'
  | 'validating_upload'
  | 'analyzing_image'
  | 'generating_dir'
  | 'validating_dir'
  | 'generating_elementor'
  | 'validating_elementor'
  | 'rendering_preview'
  | 'preview_ready'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'retrying'
  | 'cancelled';

/**
 * Stage progress descriptor used by frontend trackers and backend orchestrators.
 */
export interface StageProgressInfo {
  stage: PipelineStage;
  status: StageStatus;
  attempt: number;
  maxAttempts: number;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  progressPercent: number; // 0 to 100 within this stage
  message?: string;
  errorMessage?: string;
  errorCode?: string;
  details?: Record<string, unknown>;
}

/**
 * Detailed configuration for each stage in the pipeline registry.
 */
export interface StageDescriptor {
  key: PipelineStage;
  index: number;
  label: string;
  shortDescription: string;
  timeoutMs: number;
  maxRetries: number;
  isSelfHealingGate: boolean;
  weightPercent: number; // Proportion of total progress (must sum to 100)
}

/**
 * Authoritative registry metadata for all 7 stages.
 */
export const STAGE_DESCRIPTORS: Record<PipelineStage, StageDescriptor> = {
  [PIPELINE_STAGES.UPLOAD_VALIDATION]: {
    key: PIPELINE_STAGES.UPLOAD_VALIDATION,
    index: 0,
    label: 'Upload & Security Validation',
    shortDescription: 'MIME check, magic bytes verification, file integrity & SHA-256 deduplication',
    timeoutMs: 15_000,
    maxRetries: 1,
    isSelfHealingGate: false,
    weightPercent: 5,
  },
  [PIPELINE_STAGES.IMAGE_ANALYSIS]: {
    key: PIPELINE_STAGES.IMAGE_ANALYSIS,
    index: 1,
    label: 'Stage A: Vision & Canvas Isolation',
    shortDescription: 'Perceptual segmentation, dark background isolation, dimensions & visual bounds',
    timeoutMs: 90_000,
    maxRetries: 2,
    isSelfHealingGate: false,
    weightPercent: 20,
  },
  [PIPELINE_STAGES.DIR_GENERATION]: {
    key: PIPELINE_STAGES.DIR_GENERATION,
    index: 2,
    label: 'Stage B: Canonical DIR Generation',
    shortDescription: 'Layout decomposition into Flexbox hierarchy, typography, colors, and asset bboxes',
    timeoutMs: 90_000,
    maxRetries: 2,
    isSelfHealingGate: false,
    weightPercent: 25,
  },
  [PIPELINE_STAGES.DIR_VALIDATION]: {
    key: PIPELINE_STAGES.DIR_VALIDATION,
    index: 3,
    label: 'DIR Contract Verification & Self-Repair',
    shortDescription: 'Zod runtime schema validation, bounding box constraints & automated repair gate',
    timeoutMs: 30_000,
    maxRetries: 2,
    isSelfHealingGate: true,
    weightPercent: 10,
  },
  [PIPELINE_STAGES.ELEMENTOR_GENERATION]: {
    key: PIPELINE_STAGES.ELEMENTOR_GENERATION,
    index: 4,
    label: 'Stage C: Elementor AST Generator',
    shortDescription: 'Compiling canonical DIR to modern Elementor Flexbox Containers & 32 Core widget profiles',
    timeoutMs: 45_000,
    maxRetries: 2,
    isSelfHealingGate: false,
    weightPercent: 20,
  },
  [PIPELINE_STAGES.ELEMENTOR_VALIDATION]: {
    key: PIPELINE_STAGES.ELEMENTOR_VALIDATION,
    index: 5,
    label: 'Stage D: Quality Gate & Self-Healing',
    shortDescription: 'Template schema compliance, widget restoration audit & self-healing patch gate',
    timeoutMs: 45_000,
    maxRetries: 2,
    isSelfHealingGate: true,
    weightPercent: 10,
  },
  [PIPELINE_STAGES.PREVIEW_RENDERING]: {
    key: PIPELINE_STAGES.PREVIEW_RENDERING,
    index: 6,
    label: 'Preview & QA Verification',
    shortDescription: 'Visual preview rendering, asset resolution audit & readiness sign-off',
    timeoutMs: 30_000,
    maxRetries: 2,
    isSelfHealingGate: false,
    weightPercent: 10,
  },
  [PIPELINE_STAGES.PUBLISHING]: {
    key: PIPELINE_STAGES.PUBLISHING,
    index: 7,
    label: 'WordPress Canvas Publishing',
    shortDescription: 'Publishing generated Elementor Canvas post to target WordPress site via MCP/REST bridge',
    timeoutMs: 60_000,
    maxRetries: 1,
    isSelfHealingGate: false,
    weightPercent: 0, // Post-conversion lifecycle
  },
};

/**
 * Maps a pipeline stage to its corresponding public JobStatus.
 */
export function mapStageToJobStatus(stage: PipelineStage): JobStatus {
  switch (stage) {
    case PIPELINE_STAGES.UPLOAD_VALIDATION:
      return 'validating_upload';
    case PIPELINE_STAGES.IMAGE_ANALYSIS:
      return 'analyzing_image';
    case PIPELINE_STAGES.DIR_GENERATION:
      return 'generating_dir';
    case PIPELINE_STAGES.DIR_VALIDATION:
      return 'validating_dir';
    case PIPELINE_STAGES.ELEMENTOR_GENERATION:
      return 'generating_elementor';
    case PIPELINE_STAGES.ELEMENTOR_VALIDATION:
      return 'validating_elementor';
    case PIPELINE_STAGES.PREVIEW_RENDERING:
      return 'rendering_preview';
    case PIPELINE_STAGES.PUBLISHING:
      return 'publishing';
    default:
      return 'queued';
  }
}

/**
 * Calculates aggregate pipeline progress percentage (0 - 100)
 * based on completed stages and progress within the currently active stage.
 */
export function calculateOverallProgress(
  stageProgresses: Partial<Record<PipelineStage, StageProgressInfo>>,
  _currentStage?: PipelineStage | null,
  jobStatus?: JobStatus
): number {
  if (jobStatus === 'preview_ready' || jobStatus === 'published') {
    return 100;
  }
  if (jobStatus === 'failed' || jobStatus === 'cancelled') {
    // Return progress up to failure point
  }

  let totalProgress = 0;

  for (const stageKey of PIPELINE_STAGE_ORDER) {
    const descriptor = STAGE_DESCRIPTORS[stageKey];
    const info = stageProgresses[stageKey];

    if (!info || info.status === 'pending') {
      continue;
    }

    if (info.status === 'completed' || info.status === 'skipped') {
      totalProgress += descriptor.weightPercent;
    } else if (info.status === 'processing') {
      const stageInternalProgress = Math.min(Math.max(info.progressPercent || 0, 0), 100);
      totalProgress += (descriptor.weightPercent * stageInternalProgress) / 100;
    }
  }

  return Math.min(Math.round(totalProgress), 99);
}
