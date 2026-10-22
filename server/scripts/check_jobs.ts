import { prisma } from '../src/lib/prisma.js';

async function main() {
  const jobs = await prisma.conversionJob.findMany({
    include: { stages: true, project: true },
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log('JOBS COUNT:', jobs.length);
  for (const job of jobs) {
    console.log(`Job: ${job.id}, Status: ${job.status}, Stage: ${job.currentStage}, Attempts: ${job.attempts}/${job.maxAttempts}, Error: ${job.errorMessage}`);
    console.log(`Project: ${job.project?.name}`);
    for (const stage of job.stages) {
      console.log(`  Stage: ${stage.stage}, Status: ${stage.status}, Duration: ${stage.durationMs}ms, Provider: ${stage.providerName}, Error: ${stage.errorMessage}`);
    }
  }
  await prisma.$disconnect();
}

main().catch(console.error);

