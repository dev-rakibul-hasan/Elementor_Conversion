-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'validating_upload', 'analyzing_image', 'dir_ready', 'generating_elementor', 'validating_elementor', 'preview_ready', 'publishing', 'published', 'failed', 'cancelled', 'retrying');

-- CreateEnum
CREATE TYPE "StageName" AS ENUM ('upload_validation', 'image_analysis', 'dir_generation', 'dir_validation', 'elementor_generation', 'elementor_validation', 'preview_rendering', 'publishing');

-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('pending', 'processing', 'completed', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "StorageProvider" AS ENUM ('local', 'b2');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "storageQuota" BIGINT NOT NULL DEFAULT 2147483648,
    "usedStorage" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sourceImageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "storageProvider" "StorageProvider" NOT NULL DEFAULT 'local',
    "sha256" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversionJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "currentStage" "StageName",
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "workerId" TEXT,
    "lockedAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "lastHeartbeat" TIMESTAMP(3),
    "sourceAssetId" TEXT,
    "dirArtifact" JSONB,
    "elementorArtifact" JSONB,
    "previewArtifact" JSONB,
    "errorMessage" TEXT,
    "errorDetails" JSONB,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobStage" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "stage" "StageName" NOT NULL,
    "status" "StageStatus" NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "inputPayload" JSONB,
    "outputPayload" JSONB,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "tokensUsed" INTEGER,
    "providerName" TEXT,
    "modelName" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "siteUrl" TEXT NOT NULL,
    "name" TEXT,
    "encryptedCredentials" TEXT NOT NULL,
    "elementorVersion" TEXT,
    "wordpressVersion" TEXT,
    "isMcpAvailable" BOOLEAN NOT NULL DEFAULT false,
    "discoveredTools" JSONB,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageCache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "stage" TEXT,
    "sourceImageHash" TEXT,
    "normalizedInput" TEXT,
    "schemaVersion" TEXT,
    "skillVersion" TEXT,
    "promptVersion" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "usage" JSONB,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StageCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "Project_userId_idx" ON "Project"("userId");

-- CreateIndex
CREATE INDEX "Asset_projectId_idx" ON "Asset"("projectId");

-- CreateIndex
CREATE INDEX "Asset_sha256_idx" ON "Asset"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "ConversionJob_idempotencyKey_key" ON "ConversionJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ConversionJob_status_leaseExpiresAt_idx" ON "ConversionJob"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "ConversionJob_projectId_idx" ON "ConversionJob"("projectId");

-- CreateIndex
CREATE INDEX "ConversionJob_workerId_idx" ON "ConversionJob"("workerId");

-- CreateIndex
CREATE INDEX "JobStage_jobId_idx" ON "JobStage"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "JobStage_jobId_stage_attempt_key" ON "JobStage"("jobId", "stage", "attempt");

-- CreateIndex
CREATE INDEX "SiteConnection_userId_idx" ON "SiteConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StageCache_cacheKey_key" ON "StageCache"("cacheKey");

-- CreateIndex
CREATE INDEX "StageCache_cacheKey_idx" ON "StageCache"("cacheKey");

-- CreateIndex
CREATE INDEX "StageCache_sourceImageHash_idx" ON "StageCache"("sourceImageHash");

-- CreateIndex
CREATE INDEX "StageCache_expiresAt_idx" ON "StageCache"("expiresAt");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversionJob" ADD CONSTRAINT "ConversionJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStage" ADD CONSTRAINT "JobStage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ConversionJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteConnection" ADD CONSTRAINT "SiteConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
