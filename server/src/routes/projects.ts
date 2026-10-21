/**
 * API Routes — Projects
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, getAuthenticatedUserId } from '../middleware/auth.js';
import { NotFoundError, ValidationError, AppError } from '../lib/errors.js';

import { synchronizeStorageUsage } from '../modules/storage/accounting.js';
import { createStorageAdapter } from '../modules/storage/factory.js';

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

const projectCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

projectsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const projects = await prisma.project.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        conversionJobs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            stages: {
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    res.json({ success: true, data: projects });
  } catch (err) {
    next(err);
  }
});

projectsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const parsed = projectCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid project payload', parsed.error.format());
    }

    const project = await prisma.project.create({
      data: {
        userId,
        name: parsed.data.name,
        description: parsed.data.description,
      },
    });

    res.status(201).json({ success: true, data: project });
  } catch (err) {
    next(err);
  }
});

projectsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const id = req.params.id as string;

    const project = await prisma.project.findFirst({
      where: { id, userId },
      include: {
        assets: true,
        conversionJobs: {
          orderBy: { createdAt: 'desc' },
          include: {
            stages: {
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundError('Project not found');
    }

    res.json({ success: true, data: project });
  } catch (err) {
    next(err);
  }
});

projectsRouter.get('/:id/job', async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const userId = getAuthenticatedUserId(req);
    if (!(await prisma.project.findFirst({ where: { id, userId } }))) throw new NotFoundError('Project');
    const job = await prisma.conversionJob.findFirst({ where: { projectId: id }, orderBy: { createdAt: 'desc' }, include: { stages: { orderBy: { attempt: 'asc' } } } });
    res.json({ success: true, data: job });
  } catch (error) { next(error); }
});

projectsRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const userId = getAuthenticatedUserId(req);
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${id} FOR UPDATE`;
      const project = await tx.project.findFirst({ where: { id, userId } });
      if (!project) throw new NotFoundError('Project');
      await tx.$queryRaw`SELECT id FROM "ConversionJob" WHERE "projectId" = ${id} FOR UPDATE`;
      if (await tx.conversionJob.count({ where: { projectId: id, status: 'publishing' } })) throw new AppError('Wait for publishing to finish before deleting the project', 409, 'JOB_BUSY');
      await tx.project.update({ where: { id }, data: { deletingAt: new Date() } });
      await tx.conversionJob.updateMany({ where: { projectId: id, status: { notIn: ['published', 'preview_ready', 'failed', 'cancelled'] } },
        data: { status: 'cancelled', workerId: null, lockedAt: null, leaseExpiresAt: null } });
    });
    // Commit cleanup per file. If storage fails, the remaining records/quota survive for a retry.
    const assets = await prisma.asset.findMany({ where: { projectId: id } });
    for (const asset of assets) {
      await createStorageAdapter({ provider: asset.storageProvider }).delete(asset.storagePath);
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
        await tx.asset.deleteMany({ where: { id: asset.id, projectId: id } });
        await synchronizeStorageUsage(tx, userId);
      });
    }
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${id} FOR UPDATE`;
      if (await tx.asset.count({ where: { projectId: id } })) throw new AppError('Project received a new upload during deletion; retry deletion', 409, 'PROJECT_CHANGED');
      await tx.project.deleteMany({ where: { id, userId } });
    });
    res.json({ success: true, data: { success: true }, message: 'Project and stored files deleted' });
  } catch (error) { next(error); }
});
