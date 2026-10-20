/**
 * API Routes — Jobs & Conversion
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { requireAuth } from '../middleware/auth.js';
import { NotFoundError } from '../lib/errors.js';

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

jobsRouter.post('/:id/retry', async (req: Request, res: Response, next: NextFunction) => {
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

    await prisma.conversionJob.update({
      where: { id },
      data: {
        status: 'queued',
        attempts: 0,
        workerId: null,
        lockedAt: null,
        leaseExpiresAt: null,
        lastHeartbeat: null,
        errorMessage: null,
        errorDetails: Prisma.DbNull,
      },
    });

    res.json({ success: true, message: 'Job retry queued' });
  } catch (err) {
    next(err);
  }
});
