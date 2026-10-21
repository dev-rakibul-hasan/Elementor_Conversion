import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadMiddleware } from '../middleware/upload.js';
import { validateImage, getImageMetadata, computeContentHash } from '../modules/storage/image-processor.js';
import type { StorageAdapter } from '../modules/storage/types.js';
import { getStorage } from '../modules/storage/factory.js';
import { reserveStorage } from '../modules/storage/accounting.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { env } from '../config/index.js';
import { logger } from '../lib/logger.js';

export const uploadRouter = Router();
uploadRouter.use(requireAuth);
const uploadFields = uploadMiddleware.fields([{ name: 'image', maxCount: 1 }, { name: 'file', maxCount: 1 }]);

async function processUpload(req: Request, res: Response, next: NextFunction, projectIdParam?: string) {
  let storedKey: string | undefined;
  let storage: StorageAdapter | undefined;
  try {
    storage = getStorage();
    const userId = req.user?.id || (req as any).user?.userId;
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const file = req.file || files?.image?.[0] || files?.file?.[0];
    if (!file) throw new ValidationError('No image file provided');
    let validation;
    try { validation = await validateImage(file.buffer); }
    catch (err: any) { throw new ValidationError(`Invalid image upload: ${err.message}`); }
    const metadata = await getImageMetadata(file.buffer);
    const existingId = projectIdParam || req.body?.projectId;
    if (existingId && !(await prisma.project.findFirst({ where: { id: existingId, userId } }))) throw new NotFoundError('Project');
    const projectId = existingId || randomUUID();
    const hash = computeContentHash(file.buffer);
    const fileName = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
    storedKey = `projects/${projectId}/originals/${randomUUID()}_${fileName}`;
    const uploaded = await storage.upload(storedKey, file.buffer, validation.mimeType);
    const data = await prisma.$transaction(async (tx) => {
      let project;
      if (existingId) {
        await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
        project = await tx.project.findFirst({ where: { id: projectId, userId } });
        if (!project) throw new NotFoundError('Project');
      } else {
        project = await tx.project.create({ data: {
          id: projectId, userId,
          name: String(req.body?.name || file.originalname.replace(/\.[^/.]+$/, '') || 'Untitled Project').trim(),
          description: typeof req.body?.description === 'string' ? req.body.description.trim() : undefined,
        } });
      }
      await reserveStorage(tx, userId, BigInt(file.buffer.length));
      const asset = await tx.asset.create({ data: {
        projectId, fileName: file.originalname, mimeType: validation.mimeType, sizeBytes: BigInt(file.buffer.length),
        sha256: hash, storageProvider: env.STORAGE_PROVIDER, storagePath: uploaded.key,
        width: metadata.width, height: metadata.height,
      } });
      const job = await tx.conversionJob.create({ data: {
        projectId, sourceAssetId: asset.id, status: 'queued', maxAttempts: env.CONVERSION_MAX_ATTEMPTS,
      } });
      project = await tx.project.update({ where: { id: projectId }, data: { sourceImageId: asset.id } });
      return { project, job, asset, jobId: job.id, assetId: asset.id, status: job.status };
    });
    storedKey = undefined;
    res.status(201).json({ success: true, data });
  } catch (err) {
    if (storedKey && storage) await storage.delete(storedKey).catch((error) => logger.error({ error, storedKey }, 'Failed to remove rolled-back upload'));
    next(err);
  }
}
uploadRouter.post('/', uploadFields, (req, res, next) => { void processUpload(req, res, next); });
uploadRouter.post('/:projectId/upload', uploadFields, (req, res, next) => { void processUpload(req, res, next, req.params.projectId as string); });
uploadRouter.post('/:projectId', uploadFields, (req, res, next) => { void processUpload(req, res, next, req.params.projectId as string); });
