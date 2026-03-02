import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

type StatusSemantic = "neutral" | "active" | "attention" | "success" | "error";

const SEMANTIC_STYLES: Record<StatusSemantic, { variant: "outline" | "secondary" | "default" | "success" | "destructive"; animated?: boolean }> = {
  neutral:   { variant: "outline" },
  active:    { variant: "secondary", animated: true },
  attention: { variant: "default" },
  success:   { variant: "success" },
  error:     { variant: "destructive" },
};

const STATUS_CONFIG: Record<string, { label: string; semantic: StatusSemantic }> = {
  queued:     { label: "Queued",          semantic: "neutral" },
  pending:    { label: "Pending",         semantic: "neutral" },
  running:    { label: "Planning...",     semantic: "active" },
  generating: { label: "Generating...",   semantic: "active" },
  planned:    { label: "Review Prompts",  semantic: "attention" },
  approved:   { label: "Approved",        semantic: "success" },
  ready:      { label: "Ready",           semantic: "success" },
  failed:     { label: "Failed",          semantic: "error" },
};

export function JobStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || { label: status, semantic: "neutral" as const };
  const style = SEMANTIC_STYLES[config.semantic];

  return (
    <Badge variant={style.variant}>
      {style.animated && <Loader2 className="h-3 w-3 animate-spin" />}
      {config.label}
    </Badge>
  );
}
