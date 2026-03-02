import { ArtifactData } from "@/hooks/use-poll-job";
import { Badge } from "@/components/ui/badge";

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
  const isIllustration = jobMode === "illustration";

  if (finals.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        No artifacts generated yet
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {finals.map((artifact) => (
        <div key={artifact.id}>
          <div className="relative rounded-lg overflow-hidden border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={artifact.url}
              alt={`${artifact.channel} output`}
              className="w-full h-auto block"
              style={{ aspectRatio: `${artifact.width}/${artifact.height}` }}
            />
            {!isIllustration && (
              <div className="absolute bottom-2 left-2">
                <Badge variant="secondary" className="text-xs font-medium backdrop-blur-sm bg-background/80">
                  {CHANNEL_LABELS[artifact.channel] || artifact.channel}
                </Badge>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
