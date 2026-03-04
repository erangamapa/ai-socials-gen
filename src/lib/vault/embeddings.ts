import { GoogleGenAI } from "@google/genai";

const EMBEDDING_MODEL = "text-embedding-004";

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  if (!process.env.NANO_BANANA_API_KEY) return null;
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.NANO_BANANA_API_KEY });
  }
  return geminiClient;
}

/** Compute a cosine similarity between two equal-length vectors in [-1, 1]. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** Embed a text string using Gemini's embedding model. Returns null if unavailable. */
export async function embedText(text: string): Promise<number[] | null> {
  const client = getGeminiClient();
  if (!client) return null;

  try {
    const result = await client.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
    });
    const values = result.embeddings?.[0]?.values;
    return Array.isArray(values) ? values : null;
  } catch (err) {
    console.warn("[Embeddings] Failed to embed text:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Compute and store an embedding for a vault item given its description + tags + styleNotes.
 * Returns the computed embedding or null if unavailable.
 */
export async function computeVaultItemEmbedding(
  description: string,
  tags: string[],
  styleNotes?: string
): Promise<number[] | null> {
  const text = [description, tags.join(" "), styleNotes].filter(Boolean).join(" | ");
  return embedText(text);
}
