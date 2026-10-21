/**
 * API Routes — Jobs & Conversion
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/index.js';
import { Prisma } from '@prisma/client';
import { requireAuth } from '../middleware/auth.js';
import { NotFoundError, ValidationError, AppError } from '../lib/errors.js';

export const jobsRouter = Router();
jobsRouter.use(requireAuth);

jobsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.userId;

    const job = await prisma.conversionJob.findUnique({
      where: { id },
      include: {
        project: true,
        stages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!job || job.project.userId !== userId) {
      throw new NotFoundError('Conversion job not found');
    }

    res.json({ success: true, data: job });
  } catch (err) {
    next(err);
  }
});

jobsRouter.get('/:id/dir', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.userId;

    const job = await prisma.conversionJob.findUnique({
      where: { id },
      include: { project: true },
    });

    if (!job || job.project.userId !== userId) {
      throw new NotFoundError('Conversion job not found');
    }

    if (!job.dirArtifact) {
      return res.json({ success: true, data: null, ready: false, message: 'DIR JSON not ready for this job' });
    }

    res.json({ success: true, data: job.dirArtifact, ready: true });
  } catch (err) {
    next(err);
  }
});

jobsRouter.get('/:id/elementor', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.userId;

    const job = await prisma.conversionJob.findUnique({
      where: { id },
      include: { project: true },
    });

    if (!job || job.project.userId !== userId) {
      throw new NotFoundError('Conversion job not found');
    }

    if (!job.elementorArtifact) {
      return res.json({ success: true, data: null, ready: false, message: 'Elementor JSON not ready for this job' });
    }

    res.json({ success: true, data: job.elementorArtifact, ready: true });
  } catch (err) {
    next(err);
  }
});

jobsRouter.get('/:id/artifacts', async (req, res, next) => {
  try {
    const job = await prisma.conversionJob.findFirst({ where: { id: req.params.id as string, project: { userId: req.user!.id } } });
    if (!job) throw new NotFoundError('Conversion job');
    res.json({ success: true, data: { dir: job.dirArtifact, elementor: job.elementorArtifact, preview: job.previewArtifact } });
  } catch (error) { next(error); }
});

jobsRouter.post('/:id/retry', async (req, res, next) => {
  try {
    if (req.body?.fromStage) throw new ValidationError('Stage-specific retries are not supported; retry the conversion');
    const id = req.params.id as string;
    const job = await prisma.conversionJob.findFirst({ where: { id, project: { userId: req.user!.id } } });
    if (!job) throw new NotFoundError('Conversion job');
    const updated = await prisma.conversionJob.updateMany({ where: { id, status: { in: ['failed', 'cancelled'] }, OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: new Date() } }] }, data: {
      status: 'queued', workerId: null, currentStage: null, maxAttempts: job.attempts + env.CONVERSION_MAX_ATTEMPTS, lockedAt: null, leaseExpiresAt: null, lastHeartbeat: null,
      errorMessage: null, errorDetails: Prisma.DbNull, dirArtifact: Prisma.DbNull,
      elementorArtifact: Prisma.DbNull, previewArtifact: Prisma.DbNull,
    } });
    if (!updated.count) throw new AppError('Only stopped jobs can be retried', 409, 'JOB_BUSY');
    const data = await prisma.conversionJob.findUnique({ where: { id }, include: { stages: true } });
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

jobsRouter.post('/:id/cancel', async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const job = await prisma.conversionJob.findFirst({ where: { id, project: { userId: req.user!.id } } });
    if (!job) throw new NotFoundError('Conversion job');
    const updated = await prisma.conversionJob.updateMany({ where: { id,
      status: { notIn: ['preview_ready', 'published', 'publishing', 'failed', 'cancelled'] },
    }, data: { status: 'cancelled', workerId: null, lockedAt: null, leaseExpiresAt: null } });
    if (!updated.count) throw new AppError('Job cannot be cancelled in its current state', 409, 'JOB_BUSY');
    res.json({ success: true, data: await prisma.conversionJob.findUnique({ where: { id }, include: { stages: true } }) });
  } catch (error) { next(error); }
});
