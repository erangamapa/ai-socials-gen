import { Badge } from "@/components/ui/badge";

const CHANNEL_LABELS: Record<string, string> = {
  twitter: "Twitter / X",
  ig_feed: "IG Feed",
  ig_story: "IG Story",
  email_header: "Email",
};

export function ChannelBadges({ channels }: { channels?: string[] | null }) {
  if (!channels?.length) return null;
  return (
    <div className="flex gap-1 flex-wrap">
      {channels.map((ch) => (
        <Badge key={ch} variant="outline" className="text-xs">
          {CHANNEL_LABELS[ch] || ch}
        </Badge>
      ))}
    </div>
  );
}
