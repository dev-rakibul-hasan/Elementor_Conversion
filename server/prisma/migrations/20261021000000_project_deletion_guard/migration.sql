-- Keep a durable deletion marker while external storage cleanup is in progress.
ALTER TABLE "Project" ADD COLUMN "deletingAt" TIMESTAMP(3);
