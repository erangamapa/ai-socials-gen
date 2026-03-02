import { Badge } from "@/components/ui/badge";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  queued: { label: "Queued", variant: "secondary" },
  running: { label: "Planning...", variant: "default" },
  planned: { label: "Review Prompts", variant: "outline" },
  approved: { label: "Approved", variant: "secondary" },
  generating: { label: "Generating Images...", variant: "default" },
  ready: { label: "Ready", variant: "outline" },
  failed: { label: "Failed", variant: "destructive" },
  pending: { label: "Pending", variant: "secondary" },
};

export function JobStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || { label: status, variant: "secondary" as const };

  return <Badge variant={config.variant}>{config.label}</Badge>;
}
