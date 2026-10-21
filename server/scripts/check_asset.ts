import { prisma } from '../src/lib/prisma.js';

async function main() {
  const job = await prisma.conversionJob.findFirst({
    where: { status: 'queued' },
    include: { project: { include: { assets: true } } }
  });
  console.log('Queued Job:', job?.id);
  console.log('sourceAssetId:', job?.sourceAssetId);
  console.log('Project Assets:', job?.project.assets);
  await prisma.$disconnect();
}

main().catch(console.error);

