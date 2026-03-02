-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "rulesVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PromptRule" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 3,
    "sourceJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptRule_pkey" PRIMARY KEY ("id")
);
