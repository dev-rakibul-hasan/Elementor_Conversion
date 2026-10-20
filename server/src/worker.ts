import dotenv from 'dotenv';
dotenv.config();

import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { env, printConfigDiagnostics } from './config/index.js';
import { logger } from './lib/logger.js';
import { prisma, checkDatabaseConnection } from './lib/prisma.js';
import { getConversionOrchestrator } from './modules/conversion/orchestrator.js';

interface ClaimedJob {
  id: string;
  projectId: string;
  status: string;
  currentStage: string | null;
  attempts: number;
  maxAttempts: number;
  workerId: string | null;
  lockedAt: Date | null;
  leaseExpiresAt: Date | null;
  sourceAssetId: string | null;
  dirArtifact: unknown;
  elementorArtifact: unknown;
  previewArtifact: unknown;
}

class ConversionWorker {
  private readonly workerId: string;
  private readonly concurrency: number;
  private readonly maxAttempts: number;
  private isRunning: boolean = false;
  private isShuttingDown: boolean = false;
  private activeJobs: Set<string> = new Set();
  private heartbeatTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.workerId = `worker-${os.hostname()}-${process.pid}-${uuidv4().slice(0, 8)}`;
    this.concurrency = env.CONVERSION_WORKER_CONCURRENCY;
    this.maxAttempts = env.CONVERSION_MAX_ATTEMPTS;
  }

  public async start(): Promise<void> {
    this.isRunning = true;
    logger.info(
      {
        workerId: this.workerId,
        concurrency: this.concurrency,
        maxAttempts: this.maxAttempts,
      },
      'Starting conversion worker...'
    );

    // Initial database connection check
    const isConnected = await checkDatabaseConnection();
    if (!isConnected) {
      logger.warn('Initial DB connection check failed. Will retry in loop...');
    }

    // Main worker loop
    while (this.isRunning) {
      try {
        if (this.isShuttingDown) {
          break;
        }

        // Check if worker has capacity for more concurrent jobs
        if (this.activeJobs.size < this.concurrency) {
          const job = await this.claimNextJob();
          if (job) {
            this.activeJobs.add(job.id);
            // Process job asynchronously
            this.processJobAsync(job);
            // Tight loop if we found work to claim
            continue;
          }
        }

        // Idle delay when no work is found or at max concurrency
        await this.sleep(1000);
      } catch (err) {
        logger.error({ err }, 'Unexpected error in worker loop');
        await this.sleep(2000);
      }
    }

    logger.info('Worker poll loop has terminated.');
  }

  /**
   * Atomically claim the next queued/retrying job using FOR UPDATE SKIP LOCKED
   */
  private async claimNextJob(): Promise<ClaimedJob | null> {
    try {
      const result = await prisma.$queryRaw<ClaimedJob[]>`
        WITH next_job AS (
          SELECT id FROM "ConversionJob"
          WHERE (status = 'queued' OR status = 'retrying')
            AND (
              "lockedAt" IS NULL
              OR "leaseExpiresAt" IS NULL
              OR "leaseExpiresAt" < NOW()
            )
            AND attempts < ${this.maxAttempts}
          ORDER BY "createdAt" ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "ConversionJob"
        SET status = 'validating_upload',
            "workerId" = ${this.workerId},
            "lockedAt" = NOW(),
            "lastHeartbeat" = NOW(),
            "leaseExpiresAt" = NOW() + INTERVAL '3 minutes',
            attempts = attempts + 1,
            "updatedAt" = NOW()
        FROM next_job
        WHERE "ConversionJob".id = next_job.id
        RETURNING "ConversionJob".*;
      `;

      if (result && result.length > 0) {
        return result[0];
      }
      return null;
    } catch (err) {
      // In development/test if migrations haven't run yet, log once and don't spam
      logger.debug({ err }, 'Error or empty result claiming job');
      return null;
    }
  }

  /**
   * Heartbeat mechanism: periodically extend the lease while processing
   */
  private startHeartbeat(jobId: string): void {
    const timer = setInterval(async () => {
      try {
        await prisma.$executeRaw`
          UPDATE "ConversionJob"
          SET "lastHeartbeat" = NOW(),
              "leaseExpiresAt" = NOW() + INTERVAL '3 minutes'
          WHERE id = ${jobId} AND "workerId" = ${this.workerId};
        `;
        logger.debug({ jobId, workerId: this.workerId }, 'Heartbeat pulse sent');
      } catch (err) {
        logger.warn({ jobId, err }, 'Failed to refresh job lease heartbeat');
      }
    }, 30000); // Pulse every 30 seconds

    this.heartbeatTimers.set(jobId, timer);
  }

  private stopHeartbeat(jobId: string): void {
    const timer = this.heartbeatTimers.get(jobId);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(jobId);
    }
  }

  /**
   * Process a claimed conversion job through its lifecycle stages
   */
  private async processJobAsync(job: ClaimedJob): Promise<void> {
    const jobId = job.id;
    this.startHeartbeat(jobId);
    const startTime = Date.now();

    logger.info(
      { jobId, attempt: job.attempts, maxAttempts: this.maxAttempts },
      `Starting conversion pipeline for job ${jobId}`
    );

    try {
      const orchestrator = getConversionOrchestrator();
      await orchestrator.processJob(jobId);

      // Release worker locks
      await prisma.$executeRaw`
        UPDATE "ConversionJob"
        SET "lockedAt" = NULL,
            "leaseExpiresAt" = NULL,
            "workerId" = NULL,
            "updatedAt" = NOW()
        WHERE id = ${jobId};
      `;

      const durationMs = Date.now() - startTime;
      logger.info({ jobId, durationMs }, `Job ${jobId} successfully completed all conversion stages`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown stage error';
      logger.error({ jobId, err, attempt: job.attempts }, `Error during processing job ${jobId}: ${errorMessage}`);

      await this.handleJobError(jobId, job.attempts, errorMessage, err);
    } finally {
      this.stopHeartbeat(jobId);
      this.activeJobs.delete(jobId);
    }
  }

  /**
   * Records stage execution with timing in JobStage table
   */
  private async executeStage(
    jobId: string,
    stageName: string,
    action: () => Promise<void>
  ): Promise<void> {
    // Check if stage was already completed in a prior attempt
    try {
      const existing = await prisma.$queryRaw<any[]>`
        SELECT id FROM "JobStage"
        WHERE "jobId" = ${jobId} AND "stage" = ${stageName}::"StageName" AND "status" = 'completed'
        LIMIT 1;
      `;
      if (existing && existing.length > 0) {
        logger.info({ jobId, stageName }, 'Stage already completed in prior attempt; skipping');
        return;
      }
    } catch {
      // Continue if query fails
    }

    const stageStart = Date.now();
    try {
      await action();
      const durationMs = Date.now() - stageStart;
      try {
        await prisma.$executeRaw`
          INSERT INTO "JobStage" ("id", "jobId", "stage", "status", "durationMs", "createdAt", "updatedAt", "completedAt")
          VALUES (${uuidv4()}, ${jobId}, ${stageName}::"StageName", 'completed', ${durationMs}, NOW(), NOW(), NOW())
          ON CONFLICT ("jobId", "stage", "attempt") DO UPDATE
          SET "status" = 'completed', "durationMs" = ${durationMs}, "completedAt" = NOW(), "updatedAt" = NOW();
        `;
      } catch {
        // Continue if table doesn't exist yet
      }
    } catch (stageErr) {
      const durationMs = Date.now() - stageStart;
      const errorMsg = stageErr instanceof Error ? stageErr.message : String(stageErr);
      try {
        await prisma.$executeRaw`
          INSERT INTO "JobStage" ("id", "jobId", "stage", "status", "durationMs", "errorMessage", "createdAt", "updatedAt")
          VALUES (${uuidv4()}, ${jobId}, ${stageName}::"StageName", 'failed', ${durationMs}, ${errorMsg}, NOW(), NOW())
          ON CONFLICT ("jobId", "stage", "attempt") DO UPDATE
          SET "status" = 'failed', "durationMs" = ${durationMs}, "errorMessage" = ${errorMsg}, "updatedAt" = NOW();
        `;
      } catch {
        // Continue
      }
      throw stageErr;
    }
  }

  private async updateJobStatus(
    jobId: string,
    status: string,
    currentStage: string
  ): Promise<void> {
    try {
      await prisma.$executeRaw`
        UPDATE "ConversionJob"
        SET status = ${status}::"JobStatus",
            "currentStage" = ${currentStage}::"StageName",
            "updatedAt" = NOW()
        WHERE id = ${jobId};
      `;
    } catch {
      // Ignored if enums are being migrated
    }
  }

  private async handleJobError(
    jobId: string,
    currentAttempt: number,
    errorMessage: string,
    errorDetails: unknown
  ): Promise<void> {
    const detailsJson = JSON.stringify({
      error: errorMessage,
      details: errorDetails instanceof Error ? errorDetails.stack : errorDetails,
    });

    if (currentAttempt < this.maxAttempts) {
      // Exponential backoff retry: schedule for retry
      logger.warn(
        { jobId, currentAttempt, maxAttempts: this.maxAttempts },
        `Job failed on attempt ${currentAttempt}/${this.maxAttempts}. Scheduling retry.`
      );

      try {
        await prisma.$executeRaw`
          UPDATE "ConversionJob"
          SET status = 'retrying',
              "errorMessage" = ${errorMessage},
              "errorDetails" = ${detailsJson}::jsonb,
              "lockedAt" = NULL,
              "leaseExpiresAt" = NULL,
              "workerId" = NULL,
              "updatedAt" = NOW()
          WHERE id = ${jobId};
        `;
      } catch (err) {
        logger.error({ jobId, err }, 'Failed to set job status to retrying');
      }
    } else {
      // Max attempts exhausted, mark as failed permanently
      logger.error(
        { jobId, attempts: currentAttempt },
        `Job failed permanently after ${currentAttempt} attempts.`
      );

      try {
        await prisma.$executeRaw`
          UPDATE "ConversionJob"
          SET status = 'failed',
              "errorMessage" = ${errorMessage},
              "errorDetails" = ${detailsJson}::jsonb,
              "lockedAt" = NULL,
              "leaseExpiresAt" = NULL,
              "workerId" = NULL,
              "updatedAt" = NOW()
          WHERE id = ${jobId};
        `;
      } catch (err) {
        logger.error({ jobId, err }, 'Failed to set job status to failed');
      }
    }
  }

  /**
   * Graceful shutdown of the worker process
   */
  public async shutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    this.isRunning = false;

    logger.info(`Received ${signal}. Gracefully stopping worker ${this.workerId}...`);

    // Clear all heartbeats
    for (const timer of this.heartbeatTimers.values()) {
      clearInterval(timer);
    }
    this.heartbeatTimers.clear();

    // Release locks on any active jobs so another worker can immediately take over
    if (this.activeJobs.size > 0) {
      logger.info(
        { activeCount: this.activeJobs.size },
        'Releasing locks for active in-flight jobs during shutdown'
      );
      for (const jobId of this.activeJobs) {
        try {
          await prisma.$executeRaw`
            UPDATE "ConversionJob"
            SET "lockedAt" = NULL,
                "leaseExpiresAt" = NULL,
                "workerId" = NULL,
                status = 'queued'
            WHERE id = ${jobId} AND "workerId" = ${this.workerId};
          `;
        } catch {
          // Ignore error during forced shutdown
        }
      }
    }

    try {
      await prisma.$disconnect();
    } catch {
      // Disconnect error ignored
    }

    logger.info('Worker shutdown completed cleanly.');
    process.exit(0);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Start worker when launched as CLI script
if (process.env.NODE_ENV !== 'test') {
  printConfigDiagnostics();
  const worker = new ConversionWorker();

  process.on('SIGTERM', () => worker.shutdown('SIGTERM'));
  process.on('SIGINT', () => worker.shutdown('SIGINT'));

  worker.start().catch((err) => {
    logger.error({ err }, 'Fatal error starting conversion worker');
    process.exit(1);
  });
}

export { ConversionWorker };
