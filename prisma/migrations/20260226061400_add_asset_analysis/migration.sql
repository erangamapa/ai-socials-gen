-- AlterTable
ALTER TABLE "AssetVaultItem" ADD COLUMN     "analysis" JSONB,
ADD COLUMN     "analysisStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "analyzedAt" TIMESTAMP(3);
