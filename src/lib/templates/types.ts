import { z } from "zod";

export const CHANNEL_SIZES = {
  twitter: { width: 1600, height: 900 },
  ig_feed: { width: 1080, height: 1350 },
} as const;

export type Channel = keyof typeof CHANNEL_SIZES;
export const CHANNELS: Channel[] = ["twitter", "ig_feed"];

export const VISUAL_TYPES = ["background-only", "illustration", "pictogram"] as const;
export type VisualType = (typeof VISUAL_TYPES)[number];

export const RectSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});
export type Rect = z.infer<typeof RectSchema>;

export const TemplateSpecSchema = z.object({
  channels: z.array(z.enum(["twitter", "ig_feed", "ig_story", "email_header"])),
  safeZone: RectSchema.describe("Content-safe area as percentage of canvas (0-100)"),
  notchReserved: RectSchema.describe("Logo notch reserved area as percentage of canvas"),
  headlineBox: RectSchema,
  subheadBox: RectSchema,
  ctaBox: RectSchema,
  disclaimerBox: RectSchema.optional(),
  visualPlacement: z.enum(["full-bleed", "left-half", "right-half", "top-half", "bottom-half", "center-overlay"]),
});
export type TemplateSpec = z.infer<typeof TemplateSpecSchema>;

export interface TemplateRecord {
  id: string;
  name: string;
  spec: TemplateSpec;
}
