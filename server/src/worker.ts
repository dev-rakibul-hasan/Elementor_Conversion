import dotenv from 'dotenv';
dotenv.config();

import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { env, printConfigDiagnostics } from './config/index.js';
import { logger } from './lib/logger.js';
import { prisma, checkDatabaseConnection } from './lib/prisma.js';
import { getConversionOrchestrator } from './modules/conversion/orchestrator.js';

export interface ClaimedJob {
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

  public getWorkerId(): string {
    return this.workerId;
  }

  constructor() {
    this.workerId = `worker-${os.hostname()}-${process.pid}-${uuidv4().slice(0, 8)}`;
    this.concurrency = env.CONVERSION_WORKER_CONCURRENCY;
    this.maxAttempts = env.CONVERSION_MAX_ATTEMPTS;
  }

  /**
   * Sweep and dead-letter abandoned jobs whose lease expired and attempts exceeded maxAttempts
   */
  public async recoverExpiredLeases(): Promise<number> {
    try {
      const recovered = await prisma.$executeRaw`
        UPDATE "ConversionJob"
        SET status = 'failed',
            "errorMessage" = 'Job lease expired and maximum attempts reached without completion',
            "lockedAt" = NULL,
            "leaseExpiresAt" = NULL,
            "workerId" = NULL,
            "updatedAt" = NOW()
        WHERE status NOT IN ('preview_ready', 'published', 'publishing', 'failed', 'cancelled')
          AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" < NOW())
          AND attempts >= "maxAttempts";
      `;
      if (recovered > 0) {
        logger.warn({ recoveredCount: recovered }, 'Dead-lettered expired abandoned jobs exceeding max attempts');
      }
      return recovered;
    } catch (err) {
      logger.debug({ err }, 'Error checking for expired dead-letter jobs');
      return 0;
    }
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

    // Initial sweep for abandoned expired leases
    await this.recoverExpiredLeases();
    let lastSweepTime = Date.now();

    // Main worker loop
    while (this.isRunning) {
      try {
        if (this.isShuttingDown) {
          break;
        }

        // Periodic dead-letter sweep every 60 seconds
        if (Date.now() - lastSweepTime > 60000) {
          await this.recoverExpiredLeases();
          lastSweepTime = Date.now();
        }

        // Check if worker has capacity for more concurrent jobs
        if (this.activeJobs.size < this.concurrency) {
          const job = await this.claimNextJob();
          if (job) {
            this.activeJobs.add(job.id);
            // Process job asynchronously
            void this.processJobAsync(job).catch((err) => logger.error({ jobId: job.id, err }, 'Unhandled job failure'));
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
   * Atomically claim the next queued/retrying job (or non-terminal job with expired lease) using FOR UPDATE SKIP LOCKED
   */
  public async claimNextJob(): Promise<ClaimedJob | null> {
    try {
      const activeIds = [...this.activeJobs];
      const result = await prisma.$queryRaw<ClaimedJob[]>`
        WITH next_job AS (
          SELECT id FROM "ConversionJob"
          WHERE (
            status = 'queued'
            OR status = 'retrying'
            OR (
              status NOT IN ('preview_ready', 'published', 'publishing', 'failed', 'cancelled')
              AND "leaseExpiresAt" IS NOT NULL
              AND "leaseExpiresAt" < NOW()
            )
          )
          AND (
            "lockedAt" IS NULL
            OR "leaseExpiresAt" IS NULL
            OR "leaseExpiresAt" < NOW()
          )
          AND attempts < "maxAttempts"
          AND NOT (id = ANY(${activeIds}::text[]))
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
  private startHeartbeat(jobId: string, attempt: number): void {
    const timer = setInterval(async () => {
      try {
        await prisma.$executeRaw`
          UPDATE "ConversionJob"
          SET "lastHeartbeat" = NOW(),
              "leaseExpiresAt" = NOW() + INTERVAL '3 minutes'
          WHERE id = ${jobId} AND "workerId" = ${this.workerId} AND attempts = ${attempt}
            AND "leaseExpiresAt" > NOW()
            AND status NOT IN ('preview_ready', 'published', 'publishing', 'failed', 'cancelled');
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
  public async processJobAsync(job: ClaimedJob): Promise<void> {
    const jobId = job.id;
    this.startHeartbeat(jobId, job.attempts);
    const startTime = Date.now();

    logger.info(
      { jobId, attempt: job.attempts, maxAttempts: this.maxAttempts },
      `Starting conversion pipeline for job ${jobId}`
    );

    try {
      const orchestrator = getConversionOrchestrator();
      await orchestrator.processJob(jobId, {
        workerId: this.workerId,
        attempt: job.attempts,
      });

      // Release worker locks
      await prisma.$executeRaw`
        UPDATE "ConversionJob"
        SET "lockedAt" = NULL,
            "leaseExpiresAt" = NULL,
            "workerId" = NULL,
            "updatedAt" = NOW()
        WHERE id = ${jobId} AND "workerId" = ${this.workerId} AND attempts = ${job.attempts};
      `;

      const durationMs = Date.now() - startTime;
      logger.info({ jobId, durationMs }, `Job ${jobId} successfully completed all conversion stages`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown stage error';
      logger.error({ jobId, err, attempt: job.attempts }, `Error during processing job ${jobId}: ${errorMessage}`);

      await this.handleJobError(jobId, job.attempts, errorMessage, err, job.maxAttempts);
    } finally {
      this.stopHeartbeat(jobId);
      this.activeJobs.delete(jobId);
    }
  }

  public async handleJobError(
    jobId: string,
    currentAttempt: number,
    errorMessage: string,
    errorDetails: unknown,
    maxAttempts = this.maxAttempts
  ): Promise<void> {
    const detailsJson = JSON.stringify({
      error: errorMessage,
      details: errorDetails instanceof Error ? errorDetails.stack : errorDetails,
    });

    if (currentAttempt < maxAttempts) {
      // Exponential backoff retry: schedule for retry
      logger.warn(
        { jobId, currentAttempt, maxAttempts },
        `Job failed on attempt ${currentAttempt}/${maxAttempts}. Scheduling retry.`
      );

      try {
        await prisma.$executeRaw`
          UPDATE "ConversionJob"
          SET status = 'retrying',
              "errorMessage" = ${errorMessage},
              "errorDetails" = ${detailsJson}::jsonb,
              "lockedAt" = NOW(),
              "leaseExpiresAt" = NOW() + (${Math.min(60, 2 ** currentAttempt)} * INTERVAL '1 second'),
              "workerId" = NULL,
              "updatedAt" = NOW()
          WHERE id = ${jobId} AND "workerId" = ${this.workerId} AND attempts = ${currentAttempt}
            AND status NOT IN ('preview_ready', 'published', 'publishing', 'failed', 'cancelled');
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
          WHERE id = ${jobId} AND "workerId" = ${this.workerId} AND attempts = ${currentAttempt}
            AND status NOT IN ('preview_ready', 'published', 'publishing', 'failed', 'cancelled');
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
                status = CASE WHEN attempts >= "maxAttempts" THEN 'failed'::"JobStatus" ELSE 'queued'::"JobStatus" END,
                "updatedAt" = NOW()
            WHERE id = ${jobId} AND "workerId" = ${this.workerId} AND status NOT IN ('preview_ready', 'published', 'failed', 'cancelled');
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
    if (isDirectRun) {
      process.exit(0);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

const isDirectRun = Boolean(
  process.argv[1] && (
    process.argv[1].endsWith('worker.ts') ||
    process.argv[1].endsWith('worker.js') ||
    process.argv[1].endsWith('worker.mjs')
  )
);

// Start worker when launched directly as CLI script
if (process.env.NODE_ENV !== 'test' && isDirectRun) {
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
