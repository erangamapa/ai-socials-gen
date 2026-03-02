import { z } from "zod";

export const VaultItemSchema = z.object({
  id: z.string(),
  type: z.enum(["illustration", "pictogram", "background", "previous_post", "font", "brand_element", "template"]),
  pathOrUrl: z.string(),
  tags: z.array(z.string()),
  channelHints: z.array(z.string()),
  notes: z.string().optional(),
});

export type VaultItem = z.infer<typeof VaultItemSchema>;

export const VaultIndexSchema = z.array(VaultItemSchema);

export interface VaultSearchParams {
  query: string;
  visualType?: string;
  channels?: string[];
  limit?: number;
}

export interface VaultSearchResult {
  items: VaultItem[];
  totalMatched: number;
}

export interface AssetAnalysis {
  description: string;
  colorPalette: string[];
  mood: string;
  composition: string;
  styleNotes: string;
  subjects: string[];
}

export interface EnrichedVaultItem extends VaultItem {
  analysis?: AssetAnalysis | null;
}
