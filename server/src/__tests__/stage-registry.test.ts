import { describe, it, expect } from 'vitest';
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_ORDER,
  STAGE_DESCRIPTORS,
  mapStageToJobStatus,
  calculateOverallProgress,
  type StageProgressInfo,
} from '../contracts/stages.js';
import { StageRegistry } from '../modules/orchestration/registry.js';

describe('Pipeline Stage Registry & Status Mapping', () => {
  it('defines exactly the 7 authoritative pipeline stages in strict topological order', () => {
    expect(PIPELINE_STAGE_ORDER).toEqual([
      PIPELINE_STAGES.UPLOAD_VALIDATION,
      PIPELINE_STAGES.IMAGE_ANALYSIS,
      PIPELINE_STAGES.DIR_GENERATION,
      PIPELINE_STAGES.DIR_VALIDATION,
      PIPELINE_STAGES.ELEMENTOR_GENERATION,
      PIPELINE_STAGES.ELEMENTOR_VALIDATION,
      PIPELINE_STAGES.PREVIEW_RENDERING,
    ]);
  });

  it('provides complete descriptor metadata and weights summing to 100% across the 7 stages', () => {
    let sumWeight = 0;
    for (const stage of PIPELINE_STAGE_ORDER) {
      const desc = STAGE_DESCRIPTORS[stage];
      expect(desc).toBeDefined();
      expect(desc.timeoutMs).toBeGreaterThan(0);
      expect(desc.maxRetries).toBeGreaterThanOrEqual(1);
      sumWeight += desc.weightPercent;
    }
    expect(sumWeight).toBe(100);
  });

  it('determines stage prerequisites and downstream relationships correctly', () => {
    expect(StageRegistry.getPrerequisiteStage(PIPELINE_STAGES.UPLOAD_VALIDATION)).toBeNull();
    expect(StageRegistry.getPrerequisiteStage(PIPELINE_STAGES.IMAGE_ANALYSIS)).toBe(PIPELINE_STAGES.UPLOAD_VALIDATION);
    expect(StageRegistry.getPrerequisiteStage(PIPELINE_STAGES.DIR_GENERATION)).toBe(PIPELINE_STAGES.IMAGE_ANALYSIS);
    expect(StageRegistry.getPrerequisiteStage(PIPELINE_STAGES.DIR_VALIDATION)).toBe(PIPELINE_STAGES.DIR_GENERATION);
    expect(StageRegistry.getPrerequisiteStage(PIPELINE_STAGES.ELEMENTOR_GENERATION)).toBe(PIPELINE_STAGES.DIR_VALIDATION);
    expect(StageRegistry.getPrerequisiteStage(PIPELINE_STAGES.ELEMENTOR_VALIDATION)).toBe(PIPELINE_STAGES.ELEMENTOR_GENERATION);
    expect(StageRegistry.getPrerequisiteStage(PIPELINE_STAGES.PREVIEW_RENDERING)).toBe(PIPELINE_STAGES.ELEMENTOR_VALIDATION);

    expect(StageRegistry.isDownstreamOf(PIPELINE_STAGES.DIR_GENERATION, PIPELINE_STAGES.IMAGE_ANALYSIS)).toBe(true);
    expect(StageRegistry.isDownstreamOf(PIPELINE_STAGES.UPLOAD_VALIDATION, PIPELINE_STAGES.PREVIEW_RENDERING)).toBe(false);
  });

  it('maps stage keys to public JobStatus accurately', () => {
    expect(mapStageToJobStatus(PIPELINE_STAGES.UPLOAD_VALIDATION)).toBe('validating_upload');
    expect(mapStageToJobStatus(PIPELINE_STAGES.IMAGE_ANALYSIS)).toBe('analyzing_image');
    expect(mapStageToJobStatus(PIPELINE_STAGES.DIR_GENERATION)).toBe('generating_dir');
    expect(mapStageToJobStatus(PIPELINE_STAGES.DIR_VALIDATION)).toBe('validating_dir');
    expect(mapStageToJobStatus(PIPELINE_STAGES.ELEMENTOR_GENERATION)).toBe('generating_elementor');
    expect(mapStageToJobStatus(PIPELINE_STAGES.ELEMENTOR_VALIDATION)).toBe('validating_elementor');
    expect(mapStageToJobStatus(PIPELINE_STAGES.PREVIEW_RENDERING)).toBe('rendering_preview');
  });

  it('calculates aggregate pipeline progress dynamically', () => {
    const stageProgresses: Partial<Record<string, StageProgressInfo>> = {
      [PIPELINE_STAGES.UPLOAD_VALIDATION]: {
        stage: PIPELINE_STAGES.UPLOAD_VALIDATION,
        status: 'completed',
        attempt: 1,
        maxAttempts: 2,
        progressPercent: 100,
      },
      [PIPELINE_STAGES.IMAGE_ANALYSIS]: {
        stage: PIPELINE_STAGES.IMAGE_ANALYSIS,
        status: 'processing',
        attempt: 1,
        maxAttempts: 3,
        progressPercent: 50, // 50% of weight (20%) = 10%
      },
    };

    // Stage 1 (5%) + 50% of Stage 2 (10%) = 15%
    const progress = calculateOverallProgress(stageProgresses as any, PIPELINE_STAGES.IMAGE_ANALYSIS, 'analyzing_image');
    expect(progress).toBe(15);

    // When status is preview_ready, returns 100%
    const fullProgress = calculateOverallProgress(stageProgresses as any, null, 'preview_ready');
    expect(fullProgress).toBe(100);
  });
});

