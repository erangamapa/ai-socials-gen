import { Rect } from "../templates/types";

export interface QAResult {
  passed: boolean;
  issues: string[];
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function rectInsideContainer(inner: Rect, outer: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

export function runQAChecks(params: {
  safeZone: Rect;
  notchReserved: Rect;
  headlineBox: Rect;
  subheadBox: Rect;
  ctaBox: Rect;
  disclaimerBox?: Rect;
  headlineText: string;
  headlineMaxChars?: number;
}): QAResult {
  const issues: string[] = [];

  if (rectsOverlap(params.headlineBox, params.notchReserved)) {
    issues.push("Headline overlaps with logo notch reserved area");
  }
  if (rectsOverlap(params.subheadBox, params.notchReserved)) {
    issues.push("Subhead overlaps with logo notch reserved area");
  }
  if (rectsOverlap(params.ctaBox, params.notchReserved)) {
    issues.push("CTA overlaps with logo notch reserved area");
  }

  if (!rectInsideContainer(params.headlineBox, params.safeZone)) {
    issues.push("Headline extends outside safe zone");
  }
  if (!rectInsideContainer(params.ctaBox, params.safeZone)) {
    issues.push("CTA extends outside safe zone");
  }

  const maxChars = params.headlineMaxChars ?? 40;
  if (params.headlineText.length > maxChars) {
    issues.push(`Headline too long (${params.headlineText.length} chars, max ${maxChars})`);
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}
