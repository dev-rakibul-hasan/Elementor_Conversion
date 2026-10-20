/**
 * API Routes — Projects
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

const projectCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

projectsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.userId;
    const projects = await prisma.project.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        conversionJobs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
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
    const userId = (req as any).user.userId;
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
    const userId = (req as any).user.userId;
    const id = req.params.id as string;

    const project = await prisma.project.findFirst({
      where: { id, userId },
      include: {
        assets: true,
        conversionJobs: {
          orderBy: { createdAt: 'desc' },
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

projectsRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.userId;
    const id = req.params.id as string;

    const project = await prisma.project.findFirst({ where: { id, userId } });
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    await prisma.project.delete({ where: { id } });
    res.json({ success: true, message: 'Project deleted' });
  } catch (err) {
    next(err);
  }
});

