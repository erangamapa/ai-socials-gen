import sharp from "sharp";

export interface TextOverlay {
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  color: string;
  fontWeight?: "normal" | "bold";
  textAnchor?: "start" | "middle" | "end";
}

export interface NotchOverlay {
  x: number;
  y: number;
  width: number;
  height: number;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if ((current + " " + word).trim().length > maxCharsPerLine && current) {
      lines.push(current.trim());
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current.trim());
  return lines;
}

export function buildTextSvg(
  canvasWidth: number,
  canvasHeight: number,
  texts: TextOverlay[]
): string {
  let textElements = "";

  for (const t of texts) {
    const maxChars = Math.floor(t.width / (t.fontSize * 0.55));
    const lines = wrapText(t.text, maxChars);
    const anchor = t.textAnchor || "middle";
    const xPos = anchor === "middle" ? t.x + t.width / 2 : t.x;
    const weight = t.fontWeight || "normal";

    for (let i = 0; i < lines.length; i++) {
      const yPos = t.y + t.fontSize + i * (t.fontSize * 1.3);
      textElements += `
        <text x="${xPos}" y="${yPos}" text-anchor="${anchor}"
              font-family="sans-serif" font-size="${t.fontSize}" font-weight="${weight}"
              fill="${t.color}">
          ${escapeXml(lines[i])}
        </text>`;
    }
  }

  return `<svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
    ${textElements}
  </svg>`;
}

export function buildNotchSvg(
  canvasWidth: number,
  canvasHeight: number,
  notch: NotchOverlay
): string {
  return `<svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${notch.x}" y="${notch.y}" width="${notch.width}" height="${notch.height}"
          rx="4" fill="white" opacity="0.9" />
    <text x="${notch.x + notch.width / 2}" y="${notch.y + notch.height / 2 + 5}"
          text-anchor="middle" font-family="sans-serif" font-size="${Math.min(notch.height * 0.5, 16)}"
          font-weight="bold" fill="#0B1120">
      CB
    </text>
  </svg>`;
}

export async function compositeImage(
  baseBuffer: Buffer,
  width: number,
  height: number,
  textOverlays: TextOverlay[],
  notch: NotchOverlay
): Promise<Buffer> {
  const textSvg = buildTextSvg(width, height, textOverlays);
  const notchSvg = buildNotchSvg(width, height, notch);

  return sharp(baseBuffer)
    .resize(width, height, { fit: "cover" })
    .composite([
      { input: Buffer.from(textSvg), top: 0, left: 0 },
      { input: Buffer.from(notchSvg), top: 0, left: 0 },
    ])
    .png()
    .toBuffer();
}
