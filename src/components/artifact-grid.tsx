import { ArtifactData } from "@/hooks/use-poll-job";
import { Badge } from "@/components/ui/badge";

const CHANNEL_LABELS: Record<string, string> = {
  twitter: "Twitter / X",
  ig_feed: "IG Feed",
  ig_story: "IG Story",
  email_header: "Email",
};

export function ArtifactGrid({ artifacts }: { artifacts: ArtifactData[] }) {
  const finals = artifacts.filter((a) => a.kind === "final_png");

  if (finals.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        No artifacts generated yet
      </div>
    );
  }

  return (
    <div className={`grid gap-6 ${finals.length === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-1"}`}>
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
            <Badge variant="secondary" className="text-xs font-medium">
              {CHANNEL_LABELS[artifact.channel] || artifact.channel}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {artifact.width}×{artifact.height}
            </span>
            <a
              href={artifact.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Full size ↗
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}
