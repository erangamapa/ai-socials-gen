import { z } from "zod";

// Claude sometimes returns referenceInstructions as an object {id: instruction}.
// Accept either form and coerce to string.
const coerceToString = z.union([
  z.string(),
  z.record(z.string(), z.string()).transform((obj) => Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join("\n")),
  z.array(z.string()).transform((arr) => arr.join("\n")),
]).optional();

export const ArtDirectionSchema = z.object({
  palette: z.array(z.string()).default([]),
  mood: z.string().default(""),
  style: z.string().default(""),
  backgroundPrompt: z.string().default(""),
  subjectPrompt: z.string().optional(),
  referenceInstructions: coerceToString,
}).passthrough();

export const CopySpecSchema = z.object({
  headline: z.string().default(""),
  subhead: z.string().optional(),
  cta: z.string().default(""),
  disclaimer: z.string().optional(),
}).passthrough();

export const VariantPlanSchema = z.object({
  variantLabel: z.enum(["A", "B"]),
  templateId: z.string(),
  templateAssetId: z.string().optional(),
  copy: CopySpecSchema,
  artDirection: ArtDirectionSchema,
  referencesUsed: z.array(z.string()).default([]),
}).passthrough();

export const PlannerOutputSchema = z.object({
  variants: z.array(VariantPlanSchema).min(1).max(2),
  reasoning: z.string().optional(),
});

export type ArtDirection = z.infer<typeof ArtDirectionSchema>;
export type CopySpec = z.infer<typeof CopySpecSchema>;
export type VariantPlan = z.infer<typeof VariantPlanSchema>;
export type PlannerOutput = z.infer<typeof PlannerOutputSchema>;

export interface VaultReferenceInput {
  id: string;
  type: string;
  tags: string[];
  notes?: string;
  analysisDescription?: string;
  analysisColorPalette?: string[];
  analysisMood?: string;
  analysisSubjects?: string[];
  analysisStyleNotes?: string;
  analysisComposition?: string;
}

export interface PlannerInput {
  description: string;
  channels: string[];
  visualType: string;
  templateIds: string[];
  vaultReferences: VaultReferenceInput[];
  rulesBlock?: string;
}

export interface ReferenceImage {
  buffer: Buffer;
  description: string;
}

export interface ImageGenRequest {
  prompt: string;
  width: number;
  height: number;
  style?: string;
  referenceImages?: ReferenceImage[];
  mode?: "socials" | "illustration" | "pictogram";
}

export interface ImageGenResult {
  buffer: Buffer;
  mimeType: string;
}

export interface ImageProvider {
  generateImage(request: ImageGenRequest): Promise<ImageGenResult>;
}

export interface Planner {
  plan(input: PlannerInput): Promise<PlannerOutput>;
}
