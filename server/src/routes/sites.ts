/**
 * API Routes — Sites & MCP Publishing
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { encrypt, decrypt } from '../modules/security/encryption.js';
import { MCPClient } from '../modules/mcp/client.js';
import { MCPPublisher } from '../modules/mcp/publisher.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export const sitesRouter = Router();
sitesRouter.use(requireAuth);

const siteCreateSchema = z.object({
  name: z.string().optional(),
  siteLabel: z.string().optional(),
  siteUrl: z.string().min(1),
  username: z.string().optional(),
  applicationPassword: z.string().optional(),
  credentials: z
    .object({
      username: z.string().optional(),
      applicationPassword: z.string().optional(),
      apiKey: z.string().optional(),
    })
    .optional(),
});

sitesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.userId;
    const sites = await prisma.siteConnection.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        siteUrl: true,
        wordpressVersion: true,
        elementorVersion: true,
        isMcpAvailable: true,
        lastVerifiedAt: true,
        createdAt: true,
      },
    });

    res.json({ success: true, data: sites });
  } catch (err) {
    next(err);
  }
});

sitesRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.userId;
    const parsed = siteCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid site parameters', parsed.error.format());
    }

    const username = (parsed.data.username || parsed.data.credentials?.username || '').trim();
    const applicationPassword = (parsed.data.applicationPassword || parsed.data.credentials?.applicationPassword || '').trim();

    if (!username) {
      throw new ValidationError('Username is required', { username: { _errors: ['Username is required'] } });
    }
    if (!applicationPassword) {
      throw new ValidationError('Application Password is required', { applicationPassword: { _errors: ['Application Password is required'] } });
    }

    let siteUrl = parsed.data.siteUrl.trim();
    if (!/^https?:\/\//i.test(siteUrl)) {
      siteUrl = `http://${siteUrl}`;
    }

    let defaultName = 'WordPress Site';
    try {
      const urlObj = new URL(siteUrl);
      defaultName = urlObj.hostname || defaultName;
    } catch {
      // Keep defaultName fallback
    }

    const name = (parsed.data.name || parsed.data.siteLabel || '').trim() || defaultName;
    const encryptedCredentials = encrypt(JSON.stringify({ username, applicationPassword }));

    const site = await prisma.siteConnection.create({
      data: {
        userId,
        name,
        siteUrl,
        encryptedCredentials,
      },
      select: {
        id: true,
        name: true,
        siteUrl: true,
        createdAt: true,
      },
    });

    res.status(201).json({ success: true, data: site });
  } catch (err) {
    next(err);
  }
});

sitesRouter.post('/:id/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.userId;
    const id = req.params.id as string;

    const site = await prisma.siteConnection.findFirst({ where: { id, userId } });
    if (!site) throw new NotFoundError('Site not found');

    const creds = JSON.parse(decrypt(site.encryptedCredentials));
    const client = new MCPClient({
      siteUrl: site.siteUrl,
      credentials: creds,
    });

    const testRes = await client.testConnection();

    if (testRes.ok) {
      await prisma.siteConnection.update({
        where: { id },
        data: {
          lastVerifiedAt: new Date(),
          isMcpAvailable: true,
          discoveredTools: testRes.capabilities.availableTools as any,
          wordpressVersion: testRes.capabilities.wordpressVersion,
          elementorVersion: testRes.capabilities.elementorVersion,
        },
      });
    }

    res.json({ success: true, data: testRes });
  } catch (err) {
    next(err);
  }
});

export const publishRouter = Router();
publishRouter.use(requireAuth);

const publishSchema = z.object({
  siteConfigId: z.string(),
  resourceType: z.enum(['page', 'template']).default('page'),
  title: z.string().min(1),
  publishMode: z.enum(['draft', 'publish']).default('draft'),
  confirmPublish: z.literal(true, {
    errorMap: () => ({ message: 'Explicit confirmation required to publish' }),
  }),
});

const directPublishSchema = z.object({
  projectId: z.string().optional(),
  jobId: z.string().optional(),
  siteConfigId: z.string().optional(),
  siteConnectionId: z.string().optional(),
  resourceType: z.enum(['page', 'template']).default('page'),
  title: z.string().min(1),
  publishMode: z.enum(['draft', 'publish']).optional(),
  mode: z.enum(['draft', 'publish']).optional(),
  confirmPublish: z.boolean().optional(),
});

// Root endpoint for direct /publish
publishRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.userId;
    const parsed = directPublishSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid publish request', parsed.error.format());
    }

    const { projectId, jobId, siteConfigId, siteConnectionId, resourceType, title } = parsed.data;
    const effectiveSiteId = siteConfigId || siteConnectionId;
    if (!effectiveSiteId) {
      throw new ValidationError('Target site connection ID is required');
    }

    const publishMode = parsed.data.publishMode || parsed.data.mode || 'draft';

    let job: any = null;
    if (jobId) {
      job = await prisma.conversionJob.findFirst({
        where: { id: jobId, project: { userId } },
        include: { project: true },
      });
    } else if (projectId) {
      job = await prisma.conversionJob.findFirst({
        where: { projectId, project: { userId } },
        orderBy: { createdAt: 'desc' },
        include: { project: true },
      });
    }

    if (!job) {
      throw new NotFoundError('Conversion job not found for publication');
    }

    const site = await prisma.siteConnection.findFirst({
      where: { id: effectiveSiteId, userId },
    });
    if (!site) throw new NotFoundError('Connected site not found');

    const elementorDoc = job.elementorArtifact;
    if (!elementorDoc) {
      throw new ValidationError('Elementor document is not ready to publish');
    }

    const creds = JSON.parse(decrypt(site.encryptedCredentials));
    const publisher = new MCPPublisher({
      siteUrl: site.siteUrl,
      credentials: creds,
    });

    const idempotencyKey = `pub_${job.id}_${Date.now()}`;
    const result = await publisher.publish({
      elementorJson: elementorDoc,
      title,
      resourceType,
      publishMode,
      siteConfigId: site.id,
      idempotencyKey,
    });

    if (result.success) {
      const existingStage = await prisma.jobStage.findFirst({
        where: { jobId: job.id, stage: 'publishing' },
        orderBy: { attempt: 'desc' },
      });
      const nextAttempt = (existingStage?.attempt || 0) + 1;

      await prisma.conversionJob.update({
        where: { id: job.id },
        data: {
          status: 'published',
          stages: {
            create: {
              stage: 'publishing',
              status: 'completed',
              attempt: nextAttempt,
              outputPayload: result as any,
              completedAt: new Date(),
            },
          },
        },
      }).catch((err) => {
        logger.warn({ err: err?.message }, 'Failed to record publish stage to conversionJob');
      });
    }

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

publishRouter.post('/:jobId/publish', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.userId;
    const jobId = req.params.jobId as string;

    const parsed = publishSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid publish request', parsed.error.format());
    }

    const job = await prisma.conversionJob.findUnique({
      where: { id: jobId },
      include: { project: true },
    });
    if (!job || job.project.userId !== userId) {
      throw new NotFoundError('Conversion job not found');
    }

    const site = await prisma.siteConnection.findFirst({
      where: { id: parsed.data.siteConfigId, userId },
    });
    if (!site) throw new NotFoundError('Connected site not found');

    const elementorDoc = job.elementorArtifact;
    if (!elementorDoc) {
      throw new ValidationError('Elementor document is not ready to publish');
    }

    const creds = JSON.parse(decrypt(site.encryptedCredentials));
    const publisher = new MCPPublisher({
      siteUrl: site.siteUrl,
      credentials: creds,
    });

    const idempotencyKey = `pub_${jobId}_${Date.now()}`;
    const result = await publisher.publish({
      elementorJson: elementorDoc,
      title: parsed.data.title,
      resourceType: parsed.data.resourceType,
      publishMode: parsed.data.publishMode,
      siteConfigId: site.id,
      idempotencyKey,
    });

    if (result.success) {
      const existingStage = await prisma.jobStage.findFirst({
        where: { jobId: job.id, stage: 'publishing' },
        orderBy: { attempt: 'desc' },
      });
      const nextAttempt = (existingStage?.attempt || 0) + 1;

      await prisma.conversionJob.update({
        where: { id: job.id },
        data: {
          status: 'published',
          stages: {
            create: {
              stage: 'publishing',
              status: 'completed',
              attempt: nextAttempt,
              outputPayload: result as any,
              completedAt: new Date(),
            },
          },
        },
      }).catch((err) => {
        logger.warn({ err: err?.message }, 'Failed to record publish stage to conversionJob');
      });
    }

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

