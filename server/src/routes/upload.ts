/**
 * API Routes — Upload & Conversions
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadMiddleware } from '../middleware/upload.js';
import { validateImage, getImageMetadata, computeContentHash } from '../modules/storage/image-processor.js';
import { getStorage } from '../modules/storage/factory.js';
import { NotFoundError, ValidationError, QuotaError } from '../lib/errors.js';
import { env } from '../config/index.js';
import { getConversionOrchestrator } from '../modules/conversion/orchestrator.js';

export const uploadRouter = Router();
uploadRouter.use(requireAuth);

const uploadFields = uploadMiddleware.fields([
  { name: 'image', maxCount: 1 },
  { name: 'file', maxCount: 1 },
]);

async function processUpload(
  req: Request,
  res: Response,
  next: NextFunction,
  projectIdParam?: string
) {
  try {
    const userId = req.user?.id || (req as any).user?.userId;
    if (!userId) {
      throw new ValidationError('Authentication required');
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const file = req.file || files?.image?.[0] || files?.file?.[0];

    if (!file) {
      throw new ValidationError('No image file provided');
    }

    const buffer = file.buffer;
    try {
      await validateImage(buffer);
    } catch (valErr: any) {
      throw new ValidationError(`Invalid image upload: ${valErr.message}`);
    }

    let targetProjectId = projectIdParam || (req.body?.projectId as string | undefined);
    let project;

    if (targetProjectId) {
      project = await prisma.project.findFirst({
        where: { id: targetProjectId, userId },
      });
      if (!project) {
        throw new NotFoundError('Project not found');
      }
    } else {
      const fallbackName = file.originalname.replace(/\.[^/.]+$/, '').trim();
      const projectName = (req.body?.name as string | undefined)?.trim() || fallbackName || 'Untitled Project';
      project = await prisma.project.create({
        data: {
          userId,
          name: projectName,
        },
      });
      targetProjectId = project.id;
    }

    // Check quota
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const currentQuota = user ? BigInt(user.usedStorage) : BigInt(0);
    const newQuota = currentQuota + BigInt(buffer.length);
    if (newQuota > BigInt(env.UPLOAD_QUOTA_BYTES)) {
      throw new QuotaError('User upload quota exceeded');
    }

    const hash = computeContentHash(buffer);
    const metadata = await getImageMetadata(buffer);
    const storage = getStorage();

    const storageKey = `projects/${targetProjectId}/originals/${hash}_${file.originalname}`;
    const uploadRes = await storage.upload(storageKey, buffer, file.mimetype);

    // Create Asset record
    const asset = await prisma.asset.create({
      data: {
        projectId: targetProjectId,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: BigInt(buffer.length),
        sha256: hash,
        storageProvider: 'local',
        storagePath: uploadRes.key,
        width: metadata.width,
        height: metadata.height,
      },
    });

    // Update user quota
    await prisma.user.update({
      where: { id: userId },
      data: { usedStorage: newQuota },
    });

    // Create Conversion Job
    const job = await prisma.conversionJob.create({
      data: {
        projectId: targetProjectId,
        status: 'queued',
        sourceAssetId: asset.id,
      },
    });

    // Kick off conversion asynchronously
    getConversionOrchestrator().processJob(job.id).catch(() => {});

    res.status(201).json({
      success: true,
      data: {
        project,
        job,
        asset,
        jobId: job.id,
        assetId: asset.id,
        status: job.status,
      },
    });
  } catch (err) {
    next(err);
  }
}

// 1. Direct top-level upload (e.g. POST /api/v1/upload)
uploadRouter.post('/', uploadFields, (req: Request, res: Response, next: NextFunction) => {
  processUpload(req, res, next);
});

// 2. Project-bound upload (e.g. POST /api/v1/projects/:projectId/upload)
uploadRouter.post('/:projectId/upload', uploadFields, (req: Request, res: Response, next: NextFunction) => {
  processUpload(req, res, next, req.params.projectId as string);
});

// 3. Project-bound direct upload (e.g. POST /api/v1/projects/:projectId or POST /api/v1/upload/:projectId)
uploadRouter.post('/:projectId', uploadFields, (req: Request, res: Response, next: NextFunction) => {
  processUpload(req, res, next, req.params.projectId as string);
});
