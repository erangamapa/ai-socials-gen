-- CreateIndex
CREATE INDEX "Feedback_variantId_createdAt_idx" ON "Feedback"("variantId", "createdAt");

-- CreateIndex
CREATE INDEX "Feedback_decision_createdAt_idx" ON "Feedback"("decision", "createdAt");

-- CreateIndex
CREATE INDEX "Job_status_createdAt_idx" ON "Job"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Job_mode_createdAt_idx" ON "Job"("mode", "createdAt");

-- CreateIndex
CREATE INDEX "PromptRule_enabled_mode_idx" ON "PromptRule"("enabled", "mode");

-- CreateIndex
CREATE INDEX "PromptRule_mode_confidence_idx" ON "PromptRule"("mode", "confidence");

-- CreateIndex
CREATE INDEX "PromptRule_sourceJobId_mode_createdAt_idx" ON "PromptRule"("sourceJobId", "mode", "createdAt");
