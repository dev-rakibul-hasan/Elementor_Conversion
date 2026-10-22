/**
 * Pipeline Orchestration, Worker Queue, and Validation Self-Healing Tests
 *
 * Verifies:
 * 1. Worker Queue & Claiming: Atomic claims, lease expiry recovery, dead-lettering, and retry reset.
 * 2. AI Elementor Report Initialization: ConversionReport is always fully populated for AI ASTs.
 * 3. Source Asset & Storage Validation: Fail-fast before AI processing on missing/empty assets.
 * 4. Authoritative Validation: Strict DIR and Elementor validation gates rejecting invalid payloads.
 * 5. Full 7-Stage Execution & Persistence: All 7 stages recorded in JobStage with preview artifacts.
 * 6. API Integration: Projects endpoint includes stages on conversion jobs for frontend progress tracking.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import http from 'http';
import sharp from 'sharp';
import { createRequire } from 'module';
import { app } from '../index.js';
import { prisma, checkDatabaseConnection } from '../lib/prisma.js';
import { signToken } from '../middleware/auth.js';
import { ConversionWorker } from '../worker.js';
import {
  getConversionOrchestrator,
  buildConversionReport,
} from '../modules/conversion/orchestrator.js';
import { getStorage } from '../modules/storage/factory.js';
import type { DIRDocument } from '../modules/dir/types.js';

const require = createRequire(import.meta.url);
const sampleValidDIR: DIRDocument = require('../__fixtures__/sample-dir.json');

const isDbAvailable = await checkDatabaseConnection();

describe.runIf(isDbAvailable)('Pipeline Orchestration & Worker Queue Architecture', () => {
  let server: http.Server;
  let baseUrl: string;
  let testUserId: string;
  let testUserToken: string;
  let testProjectId: string;
  let validPngBuffer: Buffer;

  const storage = getStorage();
  const orchestrator = getConversionOrchestrator();

  beforeAll(async () => {
    // Generate valid 1200x800 test PNG
    validPngBuffer = await sharp({
      create: {
        width: 1200,
        height: 800,
        channels: 4,
        background: { r: 59, g: 130, b: 246, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    // Start HTTP server for route testing
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (typeof address === 'object' && address !== null) {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });

    // Create test user and project
    const user = await prisma.user.create({
      data: {
        email: `pipeline-test-${Date.now()}@example.com`,
        passwordHash: 'dummy-hash',
      },
    });
    testUserId = user.id;
    testUserToken = signToken({ id: user.id, email: user.email, role: user.role });

    const project = await prisma.project.create({
      data: {
        userId: testUserId,
        name: 'Pipeline Test Project',
      },
    });
    testProjectId = project.id;
  });

  afterEach(async () => {
    await prisma.conversionJob.updateMany({ where: { projectId: testProjectId, status: { notIn: ['preview_ready', 'published', 'failed', 'cancelled'] } }, data: { status: 'cancelled', workerId: null, leaseExpiresAt: null, lockedAt: null } });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

    if (testUserId) {
      await prisma.conversionJob
        .deleteMany({
          where: { project: { userId: testUserId } },
        })
        .catch(() => {});
      await prisma.asset
        .deleteMany({
          where: { project: { userId: testUserId } },
        })
        .catch(() => {});
      await prisma.project
        .deleteMany({
          where: { userId: testUserId },
        })
        .catch(() => {});
      await prisma.user
        .delete({
          where: { id: testUserId },
        })
        .catch(() => {});
    }
  });

  describe('Priority 1: Worker Queue Architecture & Lease Recovery', () => {
    it('claims next queued job and advances status to validating_upload with 3-minute lease', async () => {
      const job = await prisma.conversionJob.create({
        data: {
          projectId: testProjectId,
          status: 'queued',
          attempts: 0,
        },
      });

      const worker = new ConversionWorker();
      const claimed = await worker.claimNextJob();

      expect(claimed).toBeDefined();
      expect(claimed?.id).toBe(job.id);
      expect(claimed?.status).toBe('validating_upload');
      expect(claimed?.attempts).toBe(1);
      expect(claimed?.workerId).toBe(worker.getWorkerId());
      expect(claimed?.leaseExpiresAt).toBeDefined();
      expect(new Date(claimed!.leaseExpiresAt!).getTime()).toBeGreaterThan(Date.now());
    });

    it('claims retrying job when attempts < maxAttempts', async () => {
      const job = await prisma.conversionJob.create({
        data: {
          projectId: testProjectId,
          status: 'retrying',
          attempts: 1,
          maxAttempts: 3,
        },
      });

      const worker = new ConversionWorker();
      const claimed = await worker.claimNextJob();

      expect(claimed).toBeDefined();
      expect(claimed?.id).toBe(job.id);
      expect(claimed?.status).toBe('validating_upload');
      expect(claimed?.attempts).toBe(2);
    });

    it('recovers and claims active non-terminal job whose lease has expired', async () => {
      // Simulate crashed worker mid-stage (e.g. generating_elementor with expired lease)
      const pastDate = new Date(Date.now() - 5 * 60 * 1000); // 5 mins ago
      const job = await prisma.conversionJob.create({
        data: {
          projectId: testProjectId,
          status: 'generating_elementor',
          currentStage: 'elementor_generation',
          attempts: 1,
          maxAttempts: 3,
          workerId: 'worker-crashed-node-1234',
          lockedAt: pastDate,
          leaseExpiresAt: pastDate,
        },
      });

      const worker = new ConversionWorker();
      const claimed = await worker.claimNextJob();

      expect(claimed).toBeDefined();
      expect(claimed?.id).toBe(job.id);
      expect(claimed?.status).toBe('validating_upload');
      expect(claimed?.attempts).toBe(2);
      expect(claimed?.workerId).toBe(worker.getWorkerId());
    });

    it('dead-letters abandoned jobs with recoverExpiredLeases when attempts >= maxAttempts', async () => {
      const pastDate = new Date(Date.now() - 10 * 60 * 1000);
      const deadJob = await prisma.conversionJob.create({
        data: {
          projectId: testProjectId,
          status: 'analyzing_image',
          attempts: 3,
          maxAttempts: 3,
          workerId: 'worker-dead-node-999',
          lockedAt: pastDate,
          leaseExpiresAt: pastDate,
        },
      });

      const worker = new ConversionWorker();
      const recoveredCount = await worker.recoverExpiredLeases();
      expect(recoveredCount).toBeGreaterThanOrEqual(1);

      const refreshed = await prisma.conversionJob.findUnique({
        where: { id: deadJob.id },
      });
      expect(refreshed?.status).toBe('failed');
      expect(refreshed?.errorMessage).toContain('lease expired and maximum attempts reached');
      expect(refreshed?.workerId).toBeNull();
      expect(refreshed?.leaseExpiresAt).toBeNull();
    });

    it('preserves monotonic attempts and renews the retry allowance for a stopped job', async () => {
      const failedJob = await prisma.conversionJob.create({
        data: {
          projectId: testProjectId,
          status: 'failed',
          attempts: 3,
          maxAttempts: 3,
          workerId: 'worker-failed-1',
          errorMessage: 'Fatal Stage Failure',
          errorDetails: { reason: 'out of memory' },
        },
      });

      const res = await fetch(`${baseUrl}/api/v1/jobs/${failedJob.id}/retry`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${testUserToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);

      const retried = await prisma.conversionJob.findUnique({
        where: { id: failedJob.id },
      });
      expect(retried?.status).toBe('queued');
      expect(retried?.attempts).toBe(3);
      expect(retried?.maxAttempts).toBe(6);
      expect(retried?.workerId).toBeNull();
      expect(retried?.lockedAt).toBeNull();
      expect(retried?.leaseExpiresAt).toBeNull();
      expect(retried?.errorMessage).toBeNull();
      expect(retried?.errorDetails).toBeNull();
    });

    it('prevents duplicate execution if another active worker holds the lease', async () => {
      const futureLease = new Date(Date.now() + 5 * 60 * 1000);
      const activeJob = await prisma.conversionJob.create({
        data: {
          projectId: testProjectId,
          status: 'analyzing_image',
          attempts: 1,
          workerId: 'worker-active-holder',
          lockedAt: new Date(),
          leaseExpiresAt: futureLease,
        },
      });

      await expect(
        orchestrator.processJob(activeJob.id, { workerId: 'worker-intruder' })
      ).rejects.toThrow(/lease lost|actively leased to another worker/);
    });
  });

  describe('Priority 2: AI-Generated Elementor Path & ConversionReport Initialization', () => {
    it('buildConversionReport accurately derives stats and prevents null access on AI ASTs', () => {
      // Simulate raw AST returned by skill-aware AI generation
      const mockAiAst = {
        version: '0.4',
        type: 'page',
        content: [
          {
            id: 'c1a2b3c',
            elType: 'container',
            settings: { flex_direction: 'column' },
            elements: [
              {
                id: 'w1a2b3c',
                elType: 'widget',
                widgetType: 'heading',
                settings: { title: 'AI Generated Heading' },
                elements: [],
              },
              {
                id: 'w2a2b3c',
                elType: 'widget',
                widgetType: 'button',
                settings: { text: 'Get Started' },
                elements: [],
              },
            ],
          },
          {
            id: 'c2a2b3c',
            elType: 'container',
            settings: {},
            elements: [
              {
                id: 'w3a2b3c',
                elType: 'widget',
                widgetType: 'image',
                settings: { image: { url: '/storage/hero.png' } },
                elements: [],
              },
            ],
          },
        ],
      };

      const report = buildConversionReport(mockAiAst);

      expect(report).toBeDefined();
      expect(Array.isArray(report.widgetsUsed)).toBe(true);
      expect(report.widgetsUsed).toContain('heading');
      expect(report.widgetsUsed).toContain('button');
      expect(report.widgetsUsed).toContain('image');
      expect(report.elementCount).toBe(5); // 2 containers + 3 widgets
      expect(report.containerCount).toBe(2);
      expect(report.widgetCount).toBe(3);

      // Verifies Array.from(report.widgetsUsed) and report.elementCount never throw
      expect(() => Array.from(report.widgetsUsed)).not.toThrow();
      expect(report.elementCount).toBeGreaterThan(0);
    });
  });

  describe('Priority 3: Source Asset & Storage Validation Fail-Fast', () => {
    it('fails fast at upload_validation if job has no sourceAssetId', async () => {
      const job = await prisma.conversionJob.create({
        data: {
          projectId: testProjectId,
          status: 'queued',
          sourceAssetId: null,
        },
      });

      await expect(orchestrator.processJob(job.id)).rejects.toThrow(
        /has no associated source asset/
      );

      const stage = await prisma.jobStage.findFirst({
        where: { jobId: job.id, stage: 'upload_validation' },
      });
      expect(stage).toBeDefined();
      expect(stage?.status).toBe('failed');
      expect(stage?.errorMessage).toContain('no associated source asset');
    });

    it('fails fast at upload_validation if sourceAsset does not exist in DB', async () => {
      const job = await prisma.conversionJob.create({
        data: {
          projectId: testProjectId,
          status: 'queued',
          sourceAssetId: 'non-existent-asset-uuid',
        },
      });

      await expect(orchestrator.processJob(job.id)).rejects.toThrow(
        /Source asset non-existent-asset-uuid not found/
      );

      const stage = await prisma.jobStage.findFirst({
        where: { jobId: job.id, stage: 'upload_validation' },
      });
      expect(stage?.status).toBe('failed');
      expect(stage?.errorMessage).toContain('not found in database');
    });

    it('fails fast at upload_validation if storage read fails or buffer is empty', async () => {
      const asset = await prisma.asset.create({
        data: {
          projectId: testProjectId,
          fileName: 'missing.png',
          mimeType: 'image/png',
          sizeBytes: BigInt(100),
          storageProvider: 'local',
          storagePath: 'non/existent/path/missing.png',
          sha256: 'deadbeef',
        },
      });

      const job = await prisma.conversionJob.create({
        data: {
          projectId: testProjectId,
          status: 'queued',
          sourceAssetId: asset.id,
        },
      });

      await expect(orchestrator.processJob(job.id)).rejects.toThrow(
        /Failed to read source asset image from storage/
      );

      const stage = await prisma.jobStage.findFirst({
        where: { jobId: job.id, stage: 'upload_validation' },
      });
      expect(stage?.status).toBe('failed');
      expect(stage?.errorMessage).toContain('Failed to read source asset image from storage');
    });
  });

  describe('Priority 4: Authoritative Validation Gates', () => {
    it('authoritative DIR validation rejects invalid DIR and halts pipeline', () => {
      const invalidDIR = { ...sampleValidDIR, pages: [] };
      expect(() => orchestrator.verifyVisualQuality(invalidDIR as any, {})).toThrow(
        /Quality verification failed: DIR document contains no pages/
      );
    });

    it('authoritative Elementor validation rejects document missing required element IDs', () => {
      const invalidDoc = {
        version: '0.4',
        type: 'page',
        content: [
          {
            // missing id
            elType: 'container',
            elements: [],
          },
        ],
      };

      expect(() =>
        orchestrator.verifyVisualQuality(sampleValidDIR, invalidDoc)
      ).toThrow();
    });
  });

  describe('Priority 5: Complete 7-Stage Execution & Preview Persistence', () => {
    it('executes all 7 stages in order, records attempt and metrics, and produces preview artifact', async () => {
      // 1. Upload valid image asset
      const storageKey = `projects/${testProjectId}/valid-test-image.png`;
      const uploadRes = await storage.upload(storageKey, validPngBuffer, 'image/png');

      const asset = await prisma.asset.create({
        data: {
          projectId: testProjectId,
          fileName: 'valid-test-image.png',
          mimeType: 'image/png',
          sizeBytes: BigInt(validPngBuffer.length),
          storageProvider: 'local',
          storagePath: uploadRes.key,
          sha256: uploadRes.contentHash,
          width: 1200,
          height: 800,
        },
      });

      // 2. Create job with pre-seeded valid DIR artifact to test stage compilation and persistence
      const job = await prisma.conversionJob.create({
        data: {
          projectId: testProjectId,
          status: 'queued',
          sourceAssetId: asset.id,
          dirArtifact: { ...sampleValidDIR, assets: sampleValidDIR.assets.map((asset) => ({ ...asset, sourceRect: { x: 10, y: 10, width: 100, height: 80 } })) } as any,
          attempts: 1,
        },
      });

      // 3. Process job
      await orchestrator.processJob(job.id, { attempt: 1 });

      // 4. Verify job status is preview_ready
      const finalJob = await prisma.conversionJob.findUnique({
        where: { id: job.id },
      });
      expect(finalJob?.status).toBe('preview_ready');
      expect(finalJob?.currentStage).toBe('preview_rendering');
      expect(finalJob?.elementorArtifact).toBeDefined();
      expect(finalJob?.previewArtifact).toBeDefined();

      const preview = finalJob?.previewArtifact as any;
      expect(preview.storagePath).toBeDefined();
      expect(preview.elementCount).toBeGreaterThan(0);
      expect(preview.containerCount).toBeGreaterThan(0);
      expect(preview.widgetCount).toBeGreaterThan(0);
      expect(preview.qualityAudit?.passed).toBe(true);
      expect(preview.visualPreviewRendered).toBe(false);

      // 5. Verify all 7 stages are recorded in JobStage table
      const stages = await prisma.jobStage.findMany({
        where: { jobId: job.id },
        orderBy: { createdAt: 'asc' },
      });

      const stageNames = stages.map((s) => s.stage);
      expect(stageNames).toContain('upload_validation');
      expect(stageNames).toContain('image_analysis');
      expect(stageNames).toContain('dir_generation');
      expect(stageNames).toContain('dir_validation');
      expect(stageNames).toContain('elementor_generation');
      expect(stageNames).toContain('elementor_validation');
      expect(stageNames).toContain('preview_rendering');

      for (const st of stages) {
        expect(st.status).toBe('completed');
        expect(st.attempt).toBe(1);
        expect(st.startedAt).toBeDefined();
        expect(st.completedAt).toBeDefined();
        expect(st.durationMs).toBeGreaterThanOrEqual(0);
        expect(st.outputPayload).toBeDefined();
      }
    });
  });

  describe('Priority 6: Frontend / API Integration Verification', () => {
    it('GET /api/v1/projects/:id returns conversionJobs with stages included', async () => {
      const res = await fetch(`${baseUrl}/api/v1/projects/${testProjectId}`, {
        headers: {
          Authorization: `Bearer ${testUserToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(testProjectId);
      expect(Array.isArray(body.data.conversionJobs)).toBe(true);

      const latestJob = body.data.conversionJobs[0];
      expect(latestJob).toBeDefined();
      expect(Array.isArray(latestJob.stages)).toBe(true);
      expect(latestJob.stages.length).toBeGreaterThan(0);
      expect(latestJob.stages[0].stage).toBe('upload_validation');
    });
  });
});

