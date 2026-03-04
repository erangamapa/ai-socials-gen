import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Returns pre-fill data for creating a social post job from an accepted illustration variant.
 * The caller (job-form) uses this to populate mode, channels, subject reference, and description.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: variantId } = await params;

    const variant = await prisma.variant.findUnique({
      where: { id: variantId },
      include: {
        job: true,
        artifacts: {
          where: { kind: { in: ["expanded_png", "final_png"] } },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!variant) {
      return NextResponse.json({ error: "Variant not found" }, { status: 404 });
    }

    if (variant.job.mode !== "illustration" && variant.job.mode !== "pictogram") {
      return NextResponse.json({ error: "Only illustration and pictogram variants can be used in social posts" }, { status: 400 });
    }

    // Pick the best artifact: prefer expanded_png, fall back to final_png
    const heroArtifact =
      variant.artifacts.find((a) => a.kind === "expanded_png") ??
      variant.artifacts.find((a) => a.kind === "final_png");

    if (!heroArtifact) {
      return NextResponse.json({ error: "No generated image found on this variant" }, { status: 404 });
    }

    // Distil the illustration brief into a subject note for the social agent
    const spec = variant.plannerSpec as Record<string, unknown> | null;
    const artDir = spec?.artDirection as Record<string, unknown> | null;
    const backgroundPrompt = (artDir?.backgroundPrompt as string) || "";

    // Take first ~250 chars of the image prompt as context for the social agent
    const promptExcerpt = backgroundPrompt.slice(0, 250).trim();
    const isPictogram = variant.job.mode === "pictogram";
    const subjectNote = isPictogram
      ? [
          "THIS IS A GENERATED CB PICTOGRAM ICON — use it as a graphic element AS-IS. Do NOT re-stylise or alter it.",
          promptExcerpt ? `Pictogram context: "${promptExcerpt}"` : null,
          "Place this icon prominently on a CB social template as a graphic badge or feature element.",
        ]
          .filter(Boolean)
          .join(" ")
      : [
          "THIS IS A GENERATED CB FLAT-VECTOR ILLUSTRATION — use it as the hero character AS-IS. Do NOT re-stylise or alter it.",
          promptExcerpt ? `Illustration context: "${promptExcerpt}"` : null,
          "Place this character prominently on a CB social template. Choose a template that gives the character maximum visual impact.",
        ]
          .filter(Boolean)
          .join(" ");

    // Suggest a description based on the original illustration brief
    const suggestedDescription = variant.job.description
      ? `Social post featuring: ${variant.job.description}`
      : "Social post featuring a CB illustration";

    return NextResponse.json({
      // New array format — the form will use this
      subjectReferences: [{ url: heroArtifact.url, note: subjectNote }],
      // Legacy fields kept for backward compat
      subjectReferenceUrl: heroArtifact.url,
      subjectReferenceNote: subjectNote,
      description: suggestedDescription,
      suggestedChannels: ["twitter", "ig_feed"],
      variantLabel: variant.label,
      sourceJobDescription: variant.job.description,
      isIllustration: true,
      sourceMode: variant.job.mode,
    });
  } catch (error) {
    console.error("Failed to get social context:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
