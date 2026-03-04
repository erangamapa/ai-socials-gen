import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import {
  generateSocialPostJob,
  generateImagesJob,
  generateIllustrationJob,
  generateIllustrationImagesJob,
  expandIllustrationJob,
  editIllustrationJob,
  generatePictogramJob,
  generatePictogramImagesJob,
  analyzeVaultItemJob,
} from "@/lib/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    generateSocialPostJob,
    generateImagesJob,
    generateIllustrationJob,
    generateIllustrationImagesJob,
    expandIllustrationJob,
    editIllustrationJob,
    generatePictogramJob,
    generatePictogramImagesJob,
    analyzeVaultItemJob,
  ],
});
