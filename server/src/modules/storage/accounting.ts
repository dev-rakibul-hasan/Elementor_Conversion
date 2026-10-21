import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/index.js';
import { NotFoundError, QuotaError } from '../../lib/errors.js';

/** Lock the owner before counting assets so concurrent uploads see committed usage.
 * Counting the ledger also repairs usage totals from older workers that omitted generated files.
 */
export async function synchronizeStorageUsage(tx: Prisma.TransactionClient, userId: string): Promise<{ used: bigint; quota: bigint }> {
  const users = await tx.$queryRaw<Array<{ storageQuota: bigint }>>`SELECT "storageQuota" FROM "User" WHERE id = ${userId} FOR UPDATE`;
  if (!users.length) throw new NotFoundError('User');
  const total = await tx.asset.aggregate({ where: { project: { userId } }, _sum: { sizeBytes: true } });
  const used = total._sum.sizeBytes || BigInt(0);
  await tx.user.update({ where: { id: userId }, data: { usedStorage: used } });
  return { used, quota: users[0].storageQuota };
}

export async function reserveStorage(tx: Prisma.TransactionClient, userId: string, bytes: bigint): Promise<void> {
  const { used, quota } = await synchronizeStorageUsage(tx, userId);
  const limit = quota < BigInt(env.UPLOAD_QUOTA_BYTES) ? quota : BigInt(env.UPLOAD_QUOTA_BYTES);
  if (used + bytes > limit) throw new QuotaError('User upload quota exceeded');
  await tx.user.update({ where: { id: userId }, data: { usedStorage: used + bytes } });
}

export async function recordGeneratedAsset(data: Prisma.AssetUncheckedCreateInput, owner?: { jobId: string; workerId: string; attempt: number }) {
  return prisma.$transaction(async (tx) => {
    const projects = await tx.$queryRaw<Array<{ userId: string }>>`SELECT "userId" FROM "Project" WHERE id = ${data.projectId} FOR UPDATE`;
    if (!projects.length) throw new NotFoundError('Project');
    if (owner) {
      const job = await tx.conversionJob.findFirst({ where: {
        id: owner.jobId, workerId: owner.workerId, attempts: owner.attempt,
        leaseExpiresAt: { gt: new Date() }, status: { notIn: ['cancelled', 'failed', 'published'] },
      } });
      if (!job) throw new Error('Conversion lease lost; refusing to persist assets');
    }
    const existing = await tx.asset.findFirst({ where: { projectId: data.projectId, storagePath: data.storagePath, storageProvider: data.storageProvider } });
    if (existing) return existing;
    await reserveStorage(tx, projects[0].userId, BigInt(data.sizeBytes));
    return tx.asset.create({ data });
  });
}
