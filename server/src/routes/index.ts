import { Router, Request, Response } from 'express';
import { env } from '../config/index.js';
import { authRouter } from './auth.js';
import { projectsRouter } from './projects.js';
import { uploadRouter } from './upload.js';
import { jobsRouter } from './jobs.js';
import { sitesRouter, publishRouter } from './sites.js';

export const apiRouter = Router();

// Health check endpoint
apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

// Diagnostic info endpoint (safe, no secret leakage)
apiRouter.get('/diagnostic', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    environment: env.NODE_ENV,
    storage: {
      provider: env.STORAGE_PROVIDER,
      maxUploadBytes: env.UPLOAD_MAX_BYTES,
      quotaBytes: env.UPLOAD_QUOTA_BYTES,
    },
    ai: {
      defaultProvider: env.AI_PROVIDER,
      defaultModel: env.AI_MODEL,
      geminiEnabled: env.ENABLE_GEMINI,
      liveTestsEnabled: env.RUN_LIVE_AI_TESTS,
    },
    worker: {
      concurrency: env.CONVERSION_WORKER_CONCURRENCY,
      maxAttempts: env.CONVERSION_MAX_ATTEMPTS,
    },
  });
});

// Mount modular subroutes
apiRouter.use('/auth', authRouter);
apiRouter.use('/upload', uploadRouter);
apiRouter.use('/projects', projectsRouter);
apiRouter.use('/projects', uploadRouter);
apiRouter.use('/jobs', jobsRouter);
apiRouter.use('/jobs', publishRouter);
apiRouter.use('/publish', publishRouter);
apiRouter.use('/sites', sitesRouter);

export default apiRouter;
