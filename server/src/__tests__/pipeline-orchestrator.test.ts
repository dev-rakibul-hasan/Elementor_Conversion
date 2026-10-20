import { describe, it, expect, vi } from 'vitest';
import {
  ConversionPipelineOrchestrator,
  type PipelineAdapters,
} from '../modules/orchestration/orchestrator.js';
import {
  InMemoryJobCheckpointStore,
} from '../modules/orchestration/adapters.js';
import { PIPELINE_STAGES } from '../contracts/stages.js';
import type { DIRDocument } from '../modules/dir/types.js';
import type { NativeElementorTemplate } from '../contracts/api.js';

describe('ConversionPipelineOrchestrator', () => {
  const mockDIRDoc: DIRDocument = {
    version: '1.0.0',
    meta: {
      sourceImageHash: 'sha256_mock_source',
      sourceWidth: 1440,
      sourceHeight: 900,
      analysisProvider: 'gemini',
      analysisModel: 'gemini-3.8-flash',
      analysisTimestamp: new Date().toISOString(),
      confidenceScore: 0.95,
      schemaVersion: '1.0.0',
      promptVersion: '2.0.0',
    },
    breakpoints: {
      desktop: { min: 1025 },
      tablet: { min: 768, max: 1024 },
      mobile: { min: 0, max: 767 },
    },
    globals: {
      colors: { background: '#050a04', text: '#ffffff' },
      typography: { fontFamilies: ['Inter', 'sans-serif'], baseSize: 16 },
    },
    assets: [],
    pages: [
      {
        id: 'page_home',
        name: 'Home',
        sections: [
          {
            id: 'sec_hero',
            role: 'hero',
            confidence: 0.9,
            styles: { backgroundColor: '#050a04' },
            children: [
              {
                id: 'n_title',
                kind: 'heading',
                text: 'Simplified Finances',
                level: 1,
                confidence: 0.95,
                styles: { color: '#ffffff', fontSize: 48 },
              },
            ],
          },
        ],
      },
    ],
  };

  const mockElementorTemplate: NativeElementorTemplate = {
    version: '0.4',
    title: 'Marketing Landing',
    type: 'page',
    page_settings: {
      background_background: 'classic',
      background_color: '#050a04',
    },
    content: [
      {
        id: 'cnt_hero',
        elType: 'container',
        settings: {
          flex_direction: 'column',
          background_color: '#050a04',
        },
        elements: [
          {
            id: 'wdg_title',
            elType: 'widget',
            widgetType: 'heading',
            settings: {
              title: 'Simplified Finances',
              title_color: '#ffffff',
            },
          },
        ],
      },
    ],
  };

  const createMockAdapters = (overrides: Partial<PipelineAdapters> = {}): {
    adapters: PipelineAdapters;
    store: InMemoryJobCheckpointStore;
    spies: {
      validateUpload: any;
      analyzePerception: any;
      generateDIR: any;
      compileToElementor: any;
      renderPreview: any;
    };
  } => {
    const store = new InMemoryJobCheckpointStore();

    const spies = {
      validateUpload: vi.fn().mockResolvedValue({
        verifiedSha256: 'sha256_mock_123',
        verifiedMimeType: 'image/png',
        verifiedWidth: 1440,
        verifiedHeight: 900,
        storagePath: 'projects/proj_1/uploads/test.png',
        isCanvasIsolated: true,
        sanitizedFileName: 'test.png',
        validatedAt: new Date().toISOString(),
      }),
      analyzePerception: vi.fn().mockResolvedValue({
        canvasBounds: { inner_bg_type: 'solid', primary_hex: '#050a04' },
        detectedPalette: { background: '#050a04', text: '#ffffff' },
        visualSectionsSummary: [{ role: 'hero', yMin: 0, yMax: 800, label: 'Hero' }],
        artworkBoundingBoxes: [],
        perceptionModelUsed: 'gemini-3.8-flash',
        confidenceScore: 0.95,
      }),
      generateDIR: vi.fn().mockResolvedValue({
        rawDIRDocument: JSON.parse(JSON.stringify(mockDIRDoc)),
        generationModelUsed: 'gemini-3.8-flash',
        generationTimestamp: new Date().toISOString(),
      }),
      compileToElementor: vi.fn().mockResolvedValue({
        elementorTemplate: JSON.parse(JSON.stringify(mockElementorTemplate)),
        totalSections: 1,
        totalContainers: 1,
        totalWidgets: 1,
        widgetSlugs: ['heading'],
        compiledAt: new Date().toISOString(),
      }),
      renderPreview: vi.fn().mockResolvedValue({
        previewImageUrl: 'https://preview.local/test.png',
        assetManifest: [],
        readinessScore: 98,
        isDeployReady: true,
      }),
    };

    const adapters: PipelineAdapters = {
      uploadStorage: { validateUpload: spies.validateUpload },
      visionPerception: { analyzePerception: spies.analyzePerception },
      dirGenerator: { generateDIR: spies.generateDIR },
      elementorCompiler: { compileToElementor: spies.compileToElementor },
      previewRenderer: { renderPreview: spies.renderPreview },
      checkpointStore: store,
      ...overrides,
    };

    return { adapters, store, spies };
  };

  it('executes full 7-stage happy path and updates status to preview_ready', async () => {
    const { adapters, spies } = createMockAdapters();
    const orchestrator = new ConversionPipelineOrchestrator(adapters);

    const { job } = await orchestrator.createOrGetJob({
      jobId: 'job_test_1',
      projectId: 'proj_1',
      sourceAssetId: 'asset_1',
    });

    const result = await orchestrator.executeJob(
      job.id,
      { fileName: 'landing.png', mimeType: 'image/png', sizeBytes: 10240, filePath: '/tmp/landing.png' }
    );

    expect(result.status).toBe('preview_ready');
    expect(result.completedStages).toHaveLength(7);
    expect(result.dirDocument?.version).toBe('1.0.0');
    expect(result.elementorTemplate?.content).toHaveLength(1);
    expect(result.preview?.readinessScore).toBe(98);

    // Verify each stage adapter was invoked exactly once
    expect(spies.validateUpload).toHaveBeenCalledTimes(1);
    expect(spies.analyzePerception).toHaveBeenCalledTimes(1);
    expect(spies.generateDIR).toHaveBeenCalledTimes(1);
    expect(spies.compileToElementor).toHaveBeenCalledTimes(1);
    expect(spies.renderPreview).toHaveBeenCalledTimes(1);

    // Check store records
    const finalJob = await adapters.checkpointStore.getJob(job.id);
    expect(finalJob?.status).toBe('preview_ready');
    expect(finalJob?.dirArtifact).toBeDefined();
    expect(finalJob?.elementorArtifact).toBeDefined();
  });

  it('resumes from checkpoints on retry without re-running earlier stages', async () => {
    const { adapters, spies } = createMockAdapters();
    const orchestrator = new ConversionPipelineOrchestrator(adapters);

    const { job } = await orchestrator.createOrGetJob({
      jobId: 'job_resume_test',
      projectId: 'proj_1',
      sourceAssetId: 'asset_1',
    });

    // Seed checkpoint for Stage 1 (Upload) and Stage 2 (Vision AI)
    await adapters.checkpointStore.saveStageCheckpoint(job.id, PIPELINE_STAGES.UPLOAD_VALIDATION, {
      verifiedSha256: 'sha256_precomputed',
      verifiedMimeType: 'image/png',
      verifiedWidth: 1440,
      verifiedHeight: 900,
      storagePath: 'precomputed/path.png',
      isCanvasIsolated: true,
      sanitizedFileName: 'landing.png',
      validatedAt: new Date().toISOString(),
    }, 1);

    await adapters.checkpointStore.saveStageCheckpoint(job.id, PIPELINE_STAGES.IMAGE_ANALYSIS, {
      canvasBounds: { inner_bg_type: 'solid', primary_hex: '#050a04' },
      detectedPalette: { background: '#050a04', text: '#ffffff' },
      visualSectionsSummary: [{ role: 'hero', yMin: 0, yMax: 800, label: 'Hero' }],
      artworkBoundingBoxes: [],
      perceptionModelUsed: 'gemini-3.8-flash',
      confidenceScore: 0.99,
    }, 1);

    const result = await orchestrator.executeJob(
      job.id,
      { fileName: 'landing.png', mimeType: 'image/png', sizeBytes: 10240, filePath: '/tmp/landing.png' }
    );

    expect(result.status).toBe('preview_ready');
    // Spies for stage 1 and 2 should NOT have been called due to resumption!
    expect(spies.validateUpload).not.toHaveBeenCalled();
    expect(spies.analyzePerception).not.toHaveBeenCalled();
    // Subsequent stages were executed
    expect(spies.generateDIR).toHaveBeenCalledTimes(1);
    expect(spies.compileToElementor).toHaveBeenCalledTimes(1);
  });

  it('coordinates self-healing when Stage 4 DIR validation encounters schema errors', async () => {
    // Generate an initially invalid DIR based on mockDIRDoc with negative width
    const invalidDIR: any = JSON.parse(JSON.stringify(mockDIRDoc));
    invalidDIR.meta.sourceWidth = -1; // invalid negative width violates z.number().positive()

    const repairSpy = vi.fn().mockImplementation(async (doc: DIRDocument) => {
      const repaired = JSON.parse(JSON.stringify(doc));
      repaired.meta.sourceWidth = 1440; // repair
      return repaired;
    });

    const { adapters } = createMockAdapters({
      dirGenerator: {
        generateDIR: vi.fn().mockResolvedValue({
          rawDIRDocument: invalidDIR,
          generationModelUsed: 'gemini-3.8-flash',
          generationTimestamp: new Date().toISOString(),
        }),
      },
      dirRepair: {
        repairDIR: repairSpy,
      },
    });

    const orchestrator = new ConversionPipelineOrchestrator(adapters);
    const { job } = await orchestrator.createOrGetJob({
      jobId: 'job_healing_test',
      projectId: 'proj_1',
      sourceAssetId: 'asset_1',
    });

    const result = await orchestrator.executeJob(
      job.id,
      { fileName: 'landing.png', mimeType: 'image/png', sizeBytes: 10240, filePath: '/tmp/landing.png' }
    );

    expect(result.status).toBe('preview_ready');
    expect(repairSpy).toHaveBeenCalledTimes(1);
    expect(result.dirDocument?.meta.sourceWidth).toBe(1440);
  });

  it('coordinates self-healing when Stage 6 detects legacy Elementor layout', async () => {
    // Legacy section layout that violates architectural invariants
    const legacyTemplate: any = {
      version: '0.4',
      title: 'Legacy Page',
      type: 'page',
      content: [
        {
          id: 'sec_old',
          elType: 'section', // legacy!
          elements: [],
        },
      ],
    };

    const elementorHealSpy = vi.fn().mockImplementation(async () => {
      return JSON.parse(JSON.stringify(mockElementorTemplate)); // return healed flex container
    });

    const { adapters } = createMockAdapters({
      elementorCompiler: {
        compileToElementor: vi.fn().mockResolvedValue({
          elementorTemplate: legacyTemplate,
          totalSections: 1,
          totalContainers: 0,
          totalWidgets: 0,
          widgetSlugs: [],
          compiledAt: new Date().toISOString(),
        }),
      },
      elementorHealing: {
        healElementor: elementorHealSpy,
      },
    });

    const orchestrator = new ConversionPipelineOrchestrator(adapters);
    const { job } = await orchestrator.createOrGetJob({
      jobId: 'job_el_healing_test',
      projectId: 'proj_1',
      sourceAssetId: 'asset_1',
    });

    const result = await orchestrator.executeJob(
      job.id,
      { fileName: 'landing.png', mimeType: 'image/png', sizeBytes: 10240, filePath: '/tmp/landing.png' }
    );

    expect(result.status).toBe('preview_ready');
    expect(elementorHealSpy).toHaveBeenCalledTimes(1);
    expect(result.elementorTemplate?.content[0]?.elType).toBe('container');
  });

  it('supports idempotency by returning existing job on duplicate key', async () => {
    const { adapters } = createMockAdapters();
    const orchestrator = new ConversionPipelineOrchestrator(adapters);

    const first = await orchestrator.createOrGetJob({
      jobId: 'job_idemp_1',
      projectId: 'proj_1',
      sourceAssetId: 'asset_1',
      idempotencyKey: 'idem_key_unique_123',
    });
    expect(first.isIdempotentReplay).toBe(false);

    const second = await orchestrator.createOrGetJob({
      jobId: 'job_idemp_2',
      projectId: 'proj_1',
      sourceAssetId: 'asset_1',
      idempotencyKey: 'idem_key_unique_123',
    });
    expect(second.isIdempotentReplay).toBe(true);
    expect(second.job.id).toBe('job_idemp_1');
  });

  it('handles cancellation gracefully via AbortSignal', async () => {
    const { adapters } = createMockAdapters();
    const orchestrator = new ConversionPipelineOrchestrator(adapters);

    const { job } = await orchestrator.createOrGetJob({
      jobId: 'job_cancel_test',
      projectId: 'proj_1',
      sourceAssetId: 'asset_1',
    });

    const abortController = new AbortController();
    abortController.abort(); // already cancelled

    const result = await orchestrator.executeJob(
      job.id,
      { fileName: 'landing.png', mimeType: 'image/png', sizeBytes: 10240, filePath: '/tmp/landing.png' },
      { signal: abortController.signal }
    );

    expect(result.status).toBe('cancelled');
    expect(result.error?.code).toBe('JOB_CANCELLED');
  });

  it('retries transient stage failures up to bounded limit and succeeds', async () => {
    let callCount = 0;
    const transientAnalyzeSpy = vi.fn().mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) {
        throw new Error('Transient network glitch');
      }
      return {
        canvasBounds: { inner_bg_type: 'solid', primary_hex: '#050a04' },
        detectedPalette: { background: '#050a04', text: '#ffffff' },
        visualSectionsSummary: [{ role: 'hero', yMin: 0, yMax: 800, label: 'Hero' }],
        artworkBoundingBoxes: [],
        perceptionModelUsed: 'gemini-3.8-flash',
        confidenceScore: 0.95,
      };
    });

    const { adapters } = createMockAdapters({
      visionPerception: { analyzePerception: transientAnalyzeSpy },
    });
    const orchestrator = new ConversionPipelineOrchestrator(adapters);

    const { job } = await orchestrator.createOrGetJob({
      jobId: 'job_retry_test',
      projectId: 'proj_1',
      sourceAssetId: 'asset_1',
    });

    const result = await orchestrator.executeJob(
      job.id,
      { fileName: 'landing.png', mimeType: 'image/png', sizeBytes: 10240, filePath: '/tmp/landing.png' }
    );

    expect(result.status).toBe('preview_ready');
    expect(transientAnalyzeSpy).toHaveBeenCalledTimes(2);
  });

  it('fails job when retries are exhausted on persistent non-recoverable error', async () => {
    const persistentFailingSpy = vi.fn().mockRejectedValue(new Error('Persistent service failure'));

    const { adapters } = createMockAdapters({
      visionPerception: { analyzePerception: persistentFailingSpy },
    });
    const orchestrator = new ConversionPipelineOrchestrator(adapters);

    const { job } = await orchestrator.createOrGetJob({
      jobId: 'job_exhaust_test',
      projectId: 'proj_1',
      sourceAssetId: 'asset_1',
    });

    const result = await orchestrator.executeJob(
      job.id,
      { fileName: 'landing.png', mimeType: 'image/png', sizeBytes: 10240, filePath: '/tmp/landing.png' }
    );

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('RETRY_LIMIT_EXCEEDED');
    // Default maxRetries is 2 -> total attempts = 3
    expect(persistentFailingSpy).toHaveBeenCalledTimes(3);
  });
});
