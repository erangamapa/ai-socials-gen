-- AlterTable
ALTER TABLE "AssetVaultItem" ADD COLUMN     "usageScore" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'socials',
ADD COLUMN     "subjectReferenceUrl" TEXT;

-- AlterTable
ALTER TABLE "PromptRule" ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'socials';
