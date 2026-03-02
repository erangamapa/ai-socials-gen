import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { generateSocialPostJob, generateImagesJob } from "@/lib/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateSocialPostJob, generateImagesJob],
});
