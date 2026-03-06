-- AlterTable
ALTER TABLE "AssetVaultItem" ADD COLUMN IF NOT EXISTS "contextScores" JSONB;
ALTER TABLE "AssetVaultItem" ADD COLUMN IF NOT EXISTS "embedding" JSONB;
