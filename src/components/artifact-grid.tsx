import { ArtifactData } from "@/hooks/use-poll-job";
import { Badge } from "@/components/ui/badge";
import { Download } from "lucide-react";

const CHANNEL_LABELS: Record<string, string> = {
  twitter: "Twitter / X",
  ig_feed: "IG Feed",
  ig_story: "IG Story",
  email_header: "Email",
  illustration: "Illustration",
};

interface ArtifactGridProps {
  artifacts: ArtifactData[];
  jobMode?: string;
}

export function ArtifactGrid({ artifacts, jobMode }: ArtifactGridProps) {
  const finals = artifacts.filter((a) => a.kind === "final_png");

  if (finals.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        No artifacts generated yet
      </div>
    );
  }

  const isIllustration = jobMode === "illustration";

  return (
    <div className="grid gap-6 grid-cols-1">
      {finals.map((artifact) => (
        <div key={artifact.id} className="space-y-2">
          <div className="relative rounded-xl overflow-hidden border bg-muted shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={artifact.url}
              alt={`${artifact.channel} output`}
              className="w-full h-auto block"
              style={{ aspectRatio: `${artifact.width}/${artifact.height}` }}
            />
          </div>
          <div className="flex items-center gap-2 px-1">
            {!isIllustration && (
              <Badge variant="secondary" className="text-xs font-medium">
                {CHANNEL_LABELS[artifact.channel] || artifact.channel}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {artifact.width}×{artifact.height}
            </span>
            {isIllustration ? (
              <a
                href={artifact.url}
                download={`illustration_${artifact.channel}.png`}
                className="ml-auto flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Download PNG
              </a>
            ) : (
              <a
                href={artifact.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Full size ↗
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
