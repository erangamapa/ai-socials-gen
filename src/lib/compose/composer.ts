import { CHANNEL_SIZES, Channel, TemplateSpec } from "../templates/types";
import { VariantPlan } from "../ai/types";
import { TEMPLATE_REGISTRY } from "../templates/registry";
import { compositeImage, TextOverlay, NotchOverlay } from "./render";
import { runQAChecks } from "./qa";

export interface ComposedArtifact {
  channel: Channel;
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: string;
  specJson: object;
}

function pctToPixel(pct: number, total: number): number {
  return Math.round((pct / 100) * total);
}

function resolveTemplate(templateId: string): TemplateSpec {
  const tpl = TEMPLATE_REGISTRY.find((t) => t.id === templateId);
  if (!tpl) throw new Error(`Template not found: ${templateId}`);
  return tpl.spec;
}

export async function composeVariant(
  plan: VariantPlan,
  plateBuffer: Buffer,
  channels: Channel[]
): Promise<ComposedArtifact[]> {
  const template = resolveTemplate(plan.templateId);
  const results: ComposedArtifact[] = [];

  for (const channel of channels) {
    if (!template.channels.includes(channel)) continue;

    const { width, height } = CHANNEL_SIZES[channel];

    const headlineBox = {
      x: pctToPixel(template.headlineBox.x, width),
      y: pctToPixel(template.headlineBox.y, height),
      w: pctToPixel(template.headlineBox.w, width),
      h: pctToPixel(template.headlineBox.h, height),
    };
    const subheadBox = {
      x: pctToPixel(template.subheadBox.x, width),
      y: pctToPixel(template.subheadBox.y, height),
      w: pctToPixel(template.subheadBox.w, width),
      h: pctToPixel(template.subheadBox.h, height),
    };
    const ctaBox = {
      x: pctToPixel(template.ctaBox.x, width),
      y: pctToPixel(template.ctaBox.y, height),
      w: pctToPixel(template.ctaBox.w, width),
      h: pctToPixel(template.ctaBox.h, height),
    };
    const notchRect = {
      x: pctToPixel(template.notchReserved.x, width),
      y: pctToPixel(template.notchReserved.y, height),
      w: pctToPixel(template.notchReserved.w, width),
      h: pctToPixel(template.notchReserved.h, height),
    };
    const safeZone = {
      x: pctToPixel(template.safeZone.x, width),
      y: pctToPixel(template.safeZone.y, height),
      w: pctToPixel(template.safeZone.w, width),
      h: pctToPixel(template.safeZone.h, height),
    };

    const qa = runQAChecks({
      safeZone,
      notchReserved: notchRect,
      headlineBox,
      subheadBox,
      ctaBox,
      headlineText: plan.copy.headline,
    });

    if (!qa.passed) {
      console.warn(`QA issues for ${channel}/${plan.variantLabel}:`, qa.issues);
    }

    const textOverlays: TextOverlay[] = [
      {
        text: plan.copy.headline,
        x: headlineBox.x,
        y: headlineBox.y,
        width: headlineBox.w,
        fontSize: Math.min(Math.round(height * 0.06), 64),
        color: "#FFFFFF",
        fontWeight: "bold",
        textAnchor: "middle",
      },
    ];

    if (plan.copy.subhead) {
      textOverlays.push({
        text: plan.copy.subhead,
        x: subheadBox.x,
        y: subheadBox.y,
        width: subheadBox.w,
        fontSize: Math.min(Math.round(height * 0.03), 28),
        color: "#E0E0E0",
        textAnchor: "middle",
      });
    }

    textOverlays.push({
      text: plan.copy.cta,
      x: ctaBox.x,
      y: ctaBox.y,
      width: ctaBox.w,
      fontSize: Math.min(Math.round(height * 0.04), 36),
      color: plan.artDirection.palette?.[2] || "#F59E0B",
      fontWeight: "bold",
      textAnchor: "middle",
    });

    if (plan.copy.disclaimer && template.disclaimerBox) {
      const discBox = {
        x: pctToPixel(template.disclaimerBox.x, width),
        y: pctToPixel(template.disclaimerBox.y, height),
        w: pctToPixel(template.disclaimerBox.w, width),
        h: pctToPixel(template.disclaimerBox.h, height),
      };
      textOverlays.push({
        text: plan.copy.disclaimer,
        x: discBox.x,
        y: discBox.y,
        width: discBox.w,
        fontSize: 12,
        color: "#999999",
        textAnchor: "middle",
      });
    }

    const notchOverlay: NotchOverlay = {
      x: notchRect.x,
      y: notchRect.y,
      width: notchRect.w,
      height: notchRect.h,
    };

    const buffer = await compositeImage(
      plateBuffer,
      width,
      height,
      textOverlays,
      notchOverlay
    );

    const specJson = {
      channel,
      variantLabel: plan.variantLabel,
      templateId: plan.templateId,
      copy: plan.copy,
      artDirection: plan.artDirection,
      textOverlays,
      notchOverlay,
      qaResult: qa,
    };

    results.push({
      channel,
      buffer,
      width,
      height,
      mimeType: "image/png",
      specJson,
    });
  }

  return results;
}
