/**
 * API Routes — Sites & MCP Publishing
 */

import { createHash, randomUUID } from 'node:crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { encrypt, decrypt } from '../modules/security/encryption.js';
import { MCPClient } from '../modules/mcp/client.js';
import { MCPPublisher } from '../modules/mcp/publisher.js';
import { NotFoundError, ValidationError, AppError } from '../lib/errors.js';
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

    await prisma.siteConnection.update({ where: { id }, data: {
      lastVerifiedAt: new Date(), isMcpAvailable: testRes.ok,
      discoveredTools: testRes.capabilities.availableTools as any,
      wordpressVersion: testRes.capabilities.wordpressVersion || null,
      elementorVersion: testRes.capabilities.elementorVersion || null,
    } });

    res.json({ success: true, data: testRes });
  } catch (err) {
    next(err);
  }
});

sitesRouter.delete('/:id', async (req, res, next) => {
  try {
    const removed = await prisma.siteConnection.deleteMany({ where: { id: req.params.id as string, userId: req.user!.id } });
    if (!removed.count) throw new NotFoundError('Site');
    res.json({ success: true, data: { success: true } });
  } catch (error) { next(error); }
});

sitesRouter.get('/:id/capabilities', async (req, res, next) => {
  try {
    const site = await prisma.siteConnection.findFirst({ where: { id: req.params.id as string, userId: req.user!.id } });
    if (!site) throw new NotFoundError('Site');
    const client = new MCPClient({ siteUrl: site.siteUrl, credentials: JSON.parse(decrypt(site.encryptedCredentials)) });
    const capabilities = await client.checkCapabilities();
    res.json({ success: true, data: capabilities });
  } catch (error) { next(error); }
});

export const publishRouter = Router();
publishRouter.use(requireAuth);
const publishSchema = z.object({
  projectId: z.string().optional(), jobId: z.string().optional(),
  siteConfigId: z.string().optional(), siteConnectionId: z.string().optional(),
  resourceType: z.enum(['page']).default('page'), title: z.string().trim().min(1),
  publishMode: z.enum(['draft', 'publish']).optional(), mode: z.enum(['draft', 'publish']).optional(),
  confirmPublish: z.literal(true),
});

async function publish(req: Request, res: Response, next: NextFunction) {
  let claimed: { id: string; token: string; previousStatus: 'preview_ready' | 'published' } | undefined;
  try {
    const parsed = publishSchema.safeParse({ ...req.body, ...(req.params.jobId ? { jobId: req.params.jobId } : {}) });
    if (!parsed.success) throw new ValidationError('Invalid publish request', parsed.error.format());
    const input = parsed.data;
    const userId = req.user!.id;
    const siteId = input.siteConfigId || input.siteConnectionId;
    if (!siteId) throw new ValidationError('Target site connection ID is required');
    if (!input.jobId && !input.projectId) throw new ValidationError('A job or project ID is required');
    const job = await prisma.conversionJob.findFirst({ where: {
      ...(input.jobId ? { id: input.jobId } : { projectId: input.projectId }), project: { userId },
    }, orderBy: { createdAt: 'desc' } });
    if (!job) throw new NotFoundError('Conversion job');
    if (!job.elementorArtifact) throw new ValidationError('Elementor document is not ready to publish');
    const site = await prisma.siteConnection.findFirst({ where: { id: siteId, userId } });
    if (!site) throw new NotFoundError('Site');
    const mode = input.publishMode || input.mode || 'draft';
    const idempotencyKey = createHash('sha256').update(JSON.stringify({
      jobId: job.id, siteId, title: input.title, mode, document: job.elementorArtifact,
    })).digest('hex');
    const prior = await prisma.jobStage.findFirst({ where: {
      jobId: job.id, stage: 'publishing', status: 'completed',
      outputPayload: { path: ['idempotencyKey'], equals: idempotencyKey },
    } });
    if (prior) return res.json({ success: true, data: prior.outputPayload });
    const token = `publish-${randomUUID()}`;
    const claim = await prisma.conversionJob.updateMany({ where: {
      id: job.id, OR: [
        { status: { in: ['preview_ready', 'published'] }, workerId: null },
        { status: 'publishing', leaseExpiresAt: { lte: new Date() } },
      ],
    }, data: { status: 'publishing', currentStage: 'publishing', workerId: token, leaseExpiresAt: new Date(Date.now() + 600000) } });
    if (claim.count !== 1) throw new AppError('Job is busy or is not ready for publishing', 409, 'JOB_BUSY');
    claimed = { id: job.id, token, previousStatus: job.status === 'published' ? 'published' : 'preview_ready' };
    const publisher = new MCPPublisher({ siteUrl: site.siteUrl, credentials: JSON.parse(decrypt(site.encryptedCredentials)) });
    const result = await publisher.publish({ elementorJson: job.elementorArtifact,
      title: input.title, resourceType: 'page', publishMode: mode, siteConfigId: site.id, idempotencyKey, metadata: { projectId: job.projectId } });
    await prisma.$transaction(async (tx) => {
      const owned = await tx.conversionJob.updateMany({ where: { id: job.id, workerId: token, status: 'publishing' }, data: {
        status: result.success ? 'published' : claimed!.previousStatus, currentStage: result.success ? 'publishing' : 'preview_rendering',
        workerId: null, lockedAt: null, leaseExpiresAt: null,
      } });
      if (owned.count !== 1) throw new AppError('Publishing ownership was lost', 409, 'JOB_BUSY');
      const last = await tx.jobStage.findFirst({ where: { jobId: job.id, stage: 'publishing' }, orderBy: { attempt: 'desc' } });
      await tx.jobStage.create({ data: { jobId: job.id, stage: 'publishing', status: result.success ? 'completed' : 'failed',
        attempt: (last?.attempt || 0) + 1, outputPayload: result as any, errorMessage: result.error, completedAt: new Date() } });
    });
    claimed = undefined;
    if (!result.success) return res.status(502).json({ success: false, data: result, error: { code: 'PUBLISH_FAILED', message: result.error } });
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
  finally {
    if (claimed) await prisma.conversionJob.updateMany({ where: { id: claimed.id, workerId: claimed.token }, data: {
      status: claimed.previousStatus, workerId: null, lockedAt: null, leaseExpiresAt: null,
    } }).catch((error) => logger.error({ error }, 'Failed to release publishing lease'));
  }
}
publishRouter.post('/', publish);
publishRouter.post('/:jobId/publish', publish);
