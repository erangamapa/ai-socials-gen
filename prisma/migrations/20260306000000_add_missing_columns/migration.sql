-- Add missing columns for db-export restore compatibility
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "angleReference" JSONB;
ALTER TABLE "Artifact" ADD COLUMN IF NOT EXISTS "editPrompt" TEXT;
ALTER TABLE "Artifact" ADD COLUMN IF NOT EXISTS "sourceArtifactId" TEXT;
