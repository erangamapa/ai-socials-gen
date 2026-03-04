"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VariantData, ArtifactData } from "@/hooks/use-poll-job";
import {
  Download,
  Loader2,
  Pencil,
  Scissors,
  FileCode,
  Expand,
  Check,
  ImageIcon,
} from "lucide-react";

interface EditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: VariantData;
  jobMode: string;
  onEdited: () => void;
}

type OperationKind = "edit" | "expand" | "removebg" | "vectorize" | null;

// Returns the nobg artifact whose sourceArtifactId matches the given artifact id
function getNobgFor(artifacts: ArtifactData[], artifactId: string): ArtifactData | undefined {
  return artifacts.find((a) => a.kind === "nobg_png" && a.sourceArtifactId === artifactId);
}
function getVectorFor(artifacts: ArtifactData[], artifactId: string): ArtifactData | undefined {
  return artifacts.find((a) => a.kind === "vector_svg" && a.sourceArtifactId === artifactId);
}
function getExpandedFor(artifacts: ArtifactData[], artifactId: string): ArtifactData | undefined {
  return artifacts.find((a) => a.kind === "expanded_png" && a.sourceArtifactId === artifactId);
}

function versionLabel(a: ArtifactData, editIndex: number, expandedSourceLabel?: string): string {
  if (a.kind === "final_png") return "Original";
  if (a.kind === "expanded_png") {
    return expandedSourceLabel ? `${expandedSourceLabel} ↕` : "Expanded";
  }
  return `Edit ${editIndex}`;
}

export function EditDialog({ open, onOpenChange, variant, onEdited }: EditDialogProps) {
  const [editPrompt, setEditPrompt] = useState("");
  const [activeOperation, setActiveOperation] = useState<OperationKind>(null);
  const [opError, setOpError] = useState<string | null>(null);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevVersionCountRef = useRef<number>(0);

  // ── Compute ordered version list ────────────────────────────────────────
  const original = variant.artifacts.find((a) => a.kind === "final_png");
  const allVersions: ArtifactData[] = [
    ...(original ? [original] : []),
    ...variant.artifacts
      .filter((a) => a.kind === "edited_png" || a.kind === "expanded_png")
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
  ];
  const nonOriginalVersions = allVersions.filter((a) => a.kind !== "final_png");

  // ── Reset selection on open/close ────────────────────────────────────────
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      // Reset state when closing so re-opening picks the latest
      setSelectedArtifactId(null);
      setEditPrompt("");
      setOpError(null);
      setActiveOperation(null);
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      prevVersionCountRef.current = 0;
    }
    onOpenChange(next);
  };

  // Auto-select latest on open
  useEffect(() => {
    if (!open) return;
    if (allVersions.length > 0 && selectedArtifactId === null) {
      setSelectedArtifactId(allVersions[allVersions.length - 1].id);
    }
  }, [open, allVersions, selectedArtifactId]);

  // Detect new versions — auto-select and stop polling
  useEffect(() => {
    if (!open) return;
    const count = nonOriginalVersions.length;
    if (count > prevVersionCountRef.current) {
      const newest = nonOriginalVersions[nonOriginalVersions.length - 1];
      setSelectedArtifactId(newest.id);
      setActiveOperation(null);
      setEditPrompt("");
      setOpError(null);
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
    prevVersionCountRef.current = count;
  }, [nonOriginalVersions, open]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(() => onEdited(), 3000);
  }, [onEdited]);

  const selectedArtifact =
    allVersions.find((a) => a.id === selectedArtifactId) ??
    allVersions[allVersions.length - 1];

  const isWorking = activeOperation !== null;

  // ── Build edit index map ────────────────────────────────────────────────
  const editList = nonOriginalVersions.filter((a) => a.kind === "edited_png");

  function getVersionMeta(a: ArtifactData) {
    const nobg = getNobgFor(variant.artifacts, a.id);
    const vector = getVectorFor(variant.artifacts, a.id);
    const expanded = getExpandedFor(variant.artifacts, a.id);
    let label = "Original";
    if (a.kind === "expanded_png") {
      const srcId = a.sourceArtifactId;
      const srcEdit = editList.find((e) => e.id === srcId);
      const srcIndex = srcEdit ? editList.indexOf(srcEdit) + 1 : null;
      label = srcIndex ? `Edit ${srcIndex} ↕` : "Expanded";
    } else if (a.kind === "edited_png") {
      const idx = editList.indexOf(a);
      label = `Edit ${idx + 1}`;
    }
    return { label, nobg, vector, expanded };
  }

  // ── Derived for selected ────────────────────────────────────────────────
  const selNobg = selectedArtifact ? getNobgFor(variant.artifacts, selectedArtifact.id) : undefined;
  const selVector = selectedArtifact ? getVectorFor(variant.artifacts, selectedArtifact.id) : undefined;
  const selExpanded = selectedArtifact ? getExpandedFor(variant.artifacts, selectedArtifact.id) : undefined;
  const canExpand = selectedArtifact?.kind !== "expanded_png" && !selExpanded;
  const canEdit = selectedArtifact
    ? ["final_png", "expanded_png", "edited_png"].includes(selectedArtifact.kind)
    : false;

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleApplyEdit = async () => {
    if (!selectedArtifact || !editPrompt.trim() || isWorking) return;
    setOpError(null);
    setActiveOperation("edit");
    try {
      const res = await fetch(`/api/artifacts/${selectedArtifact.id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: editPrompt.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Edit failed");
      }
      startPolling();
    } catch (err) {
      setActiveOperation(null);
      setOpError(err instanceof Error ? err.message : "Edit failed");
    }
  };

  const handleExpand = async () => {
    if (!selectedArtifact || isWorking) return;
    setOpError(null);
    setActiveOperation("expand");
    try {
      const res = await fetch(`/api/artifacts/${selectedArtifact.id}/expand`, { method: "POST" });
      if (res.status === 409) { onEdited(); setActiveOperation(null); return; }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Expand failed");
      }
      startPolling();
    } catch (err) {
      setActiveOperation(null);
      setOpError(err instanceof Error ? err.message : "Expand failed");
    }
  };

  const handleRemoveBg = async (artifactId: string) => {
    setOpError(null);
    setActiveOperation("removebg");
    try {
      const res = await fetch(`/api/artifacts/${artifactId}/remove-bg`, { method: "POST" });
      if (res.status === 409) { onEdited(); setActiveOperation(null); return; }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Remove background failed");
      }
      onEdited();
    } catch (err) {
      setOpError(err instanceof Error ? err.message : "Remove background failed");
    } finally {
      setActiveOperation(null);
    }
  };

  const handleVectorize = async (artifactId: string, useNobgId?: string) => {
    setOpError(null);
    setActiveOperation("vectorize");
    const sourceId = useNobgId || artifactId;
    try {
      const res = await fetch(`/api/artifacts/${sourceId}/vectorize`, { method: "POST" });
      if (res.status === 409) { onEdited(); setActiveOperation(null); return; }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Vectorize failed");
      }
      onEdited();
    } catch (err) {
      setOpError(err instanceof Error ? err.message : "Vectorize failed");
    } finally {
      setActiveOperation(null);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const opStatusLabel =
    activeOperation === "edit" ? "Applying edit..." :
    activeOperation === "expand" ? "Expanding canvas..." :
    activeOperation === "removebg" ? "Removing background..." :
    activeOperation === "vectorize" ? "Vectorizing..." : "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[96vw] sm:max-w-[96vw] w-full h-[92vh] p-0 overflow-hidden gap-0 flex flex-col">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/50 flex-none">
          <DialogTitle className="text-base font-semibold">
            Studio — Variant {variant.label}
          </DialogTitle>
        </DialogHeader>

        {/* Two-panel body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* ── LEFT: Large preview ──────────────────────────────────────── */}
          <div className="flex-6 flex flex-col min-h-0 border-r border-border/40">
            <div className="relative flex-1 bg-muted/20 flex items-center justify-center overflow-hidden m-4 rounded-xl border border-border/40">
              {selectedArtifact ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    key={selectedArtifact.id}
                    src={selectedArtifact.url}
                    alt="Selected version"
                    className="max-w-full max-h-full w-auto h-auto object-contain block"
                  />
                  {isWorking && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/50 backdrop-blur-[2px] rounded-xl">
                      <div className="absolute inset-0 animate-pulse bg-linear-to-r from-transparent via-primary/10 to-transparent rounded-xl" />
                      <Loader2 className="h-10 w-10 text-white animate-spin" />
                      <span className="text-sm font-semibold text-white drop-shadow-md">{opStatusLabel}</span>
                      <span className="text-xs text-white/70">This may take a minute</span>
                    </div>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground/40 text-sm">No image selected</span>
              )}
            </div>

            {/* Dimensions + label strip */}
            {selectedArtifact && (
              <div className="flex-none px-6 pb-4 flex items-center gap-3">
                <span className="text-xs text-muted-foreground font-medium">
                  {getVersionMeta(selectedArtifact).label}
                </span>
                <span className="text-xs text-muted-foreground/50">
                  {selectedArtifact.width} × {selectedArtifact.height}
                </span>
                {selectedArtifact.editPrompt && (
                  <span className="text-xs text-muted-foreground/60 italic truncate max-w-xs">
                    "{selectedArtifact.editPrompt}"
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── RIGHT: Controls ──────────────────────────────────────────── */}
          <div className="flex-4 flex flex-col min-h-0 overflow-y-auto">
            <div className="flex flex-col gap-0 p-5 space-y-5">

              {/* ── VERSIONS LIST ────────────────────────────────────────── */}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Versions
                </p>
                <div className="space-y-1">
                  {allVersions.map((item) => {
                    const meta = getVersionMeta(item);
                    const isSelected = selectedArtifact?.id === item.id;
                    return (
                      <div
                        key={item.id}
                        className={[
                          "group flex items-center gap-3 rounded-lg p-2 cursor-pointer transition-all border",
                          isSelected
                            ? "border-primary/60 bg-primary/5 ring-1 ring-primary/20"
                            : "border-transparent hover:border-border/60 hover:bg-muted/40",
                        ].join(" ")}
                        onClick={() => setSelectedArtifactId(item.id)}
                      >
                        {/* Thumbnail */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.url}
                          alt={meta.label}
                          className="w-12 h-12 object-cover rounded-md border border-border/40 flex-none"
                        />

                        {/* Label + dims */}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{meta.label}</p>
                          <p className="text-[10px] text-muted-foreground/60">{item.width} × {item.height}</p>
                          {item.editPrompt && (
                            <p className="text-[10px] text-muted-foreground/50 italic truncate mt-0.5">
                              "{item.editPrompt}"
                            </p>
                          )}
                        </div>

                        {/* Per-version download badges */}
                        <div className="flex items-center gap-1 flex-none opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Download PNG */}
                          <a
                            href={item.url}
                            download={`variant-${variant.label}-${meta.label.toLowerCase().replace(/\s/g, "-")}.png`}
                            onClick={(e) => e.stopPropagation()}
                            title="Export PNG"
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                          {/* Download nobg if exists */}
                          {meta.nobg && (
                            <a
                              href={meta.nobg.url}
                              download={`variant-${variant.label}-${meta.label.toLowerCase().replace(/\s/g, "-")}-nobg.png`}
                              onClick={(e) => e.stopPropagation()}
                              title="Download No-BG PNG"
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Scissors className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {/* Download vector if exists */}
                          {meta.vector && (
                            <a
                              href={meta.vector.url}
                              download={`variant-${variant.label}-${meta.label.toLowerCase().replace(/\s/g, "-")}.svg`}
                              onClick={(e) => e.stopPropagation()}
                              title="Download SVG"
                              className="p-1 rounded hover:bg-muted text-primary/70 hover:text-primary transition-colors"
                            >
                              <FileCode className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* In-progress placeholder */}
                  {(activeOperation === "edit" || activeOperation === "expand") && (
                    <div className="flex items-center gap-3 rounded-lg p-2 border border-dashed border-primary/30 bg-primary/5">
                      <div className="w-12 h-12 rounded-md border border-border/30 bg-primary/10 flex items-center justify-center flex-none">
                        <Loader2 className="h-4 w-4 text-primary animate-spin" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-primary">
                          {activeOperation === "edit" ? "Editing..." : "Expanding..."}
                        </p>
                        <p className="text-[10px] text-muted-foreground/50">Processing</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── EDIT PROMPT ──────────────────────────────────────────── */}
              {canEdit && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Edit with prompt
                  </p>
                  <Textarea
                    placeholder="Describe what to change, e.g. 'Make the ball larger' or 'Add a gold crown'"
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    rows={3}
                    className="text-sm resize-none"
                    disabled={isWorking}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && editPrompt.trim() && !isWorking) {
                        e.preventDefault();
                        handleApplyEdit();
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={handleApplyEdit}
                    disabled={isWorking || !editPrompt.trim()}
                    className="w-full gap-2"
                  >
                    {activeOperation === "edit" ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Applying edit...</>
                    ) : (
                      <><Pencil className="h-3.5 w-3.5" /> Apply Edit</>
                    )}
                  </Button>
                  <p className="text-[10px] text-muted-foreground">
                    Edits the selected version. ⌘+Enter to apply.
                  </p>
                </div>
              )}

              {/* ── TOOLS FOR SELECTED ───────────────────────────────────── */}
              {selectedArtifact && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Generate from selected
                  </p>
                  <div className="grid grid-cols-1 gap-1.5">

                    {/* Expand Canvas */}
                    {canExpand ? (
                      <button
                        type="button"
                        onClick={handleExpand}
                        disabled={isWorking}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/60 hover:border-secondary/50 hover:bg-secondary/5 transition-all text-muted-foreground hover:text-foreground disabled:opacity-50 text-left"
                      >
                        {activeOperation === "expand" ? (
                          <Loader2 className="h-4 w-4 animate-spin text-secondary flex-none" />
                        ) : (
                          <Expand className="h-4 w-4 flex-none" />
                        )}
                        <div>
                          <p className="text-xs font-medium">{activeOperation === "expand" ? "Expanding..." : "Expand Canvas"}</p>
                          <p className="text-[10px] text-muted-foreground/60">Outpaint ~28% on all sides</p>
                        </div>
                      </button>
                    ) : selectedArtifact.kind !== "expanded_png" && selExpanded ? (
                      <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-secondary/30 bg-secondary/5 text-secondary">
                        <Check className="h-4 w-4 flex-none" />
                        <div>
                          <p className="text-xs font-medium">Expanded</p>
                          <p className="text-[10px] text-secondary/60">See expanded version in the list</p>
                        </div>
                      </div>
                    ) : null}

                    {/* Remove BG */}
                    {!selNobg ? (
                      <button
                        type="button"
                        onClick={() => handleRemoveBg(selectedArtifact.id)}
                        disabled={isWorking}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/60 hover:border-secondary/50 hover:bg-secondary/5 transition-all text-muted-foreground hover:text-foreground disabled:opacity-50 text-left"
                      >
                        {activeOperation === "removebg" ? (
                          <Loader2 className="h-4 w-4 animate-spin text-secondary flex-none" />
                        ) : (
                          <Scissors className="h-4 w-4 flex-none" />
                        )}
                        <div>
                          <p className="text-xs font-medium">{activeOperation === "removebg" ? "Removing..." : "Remove Background"}</p>
                          <p className="text-[10px] text-muted-foreground/60">Creates a transparent PNG</p>
                        </div>
                      </button>
                    ) : (
                      <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-secondary/30 bg-secondary/5 text-secondary">
                        <Check className="h-4 w-4 flex-none" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">Background Removed</p>
                          <p className="text-[10px] text-secondary/60">Available in downloads below</p>
                        </div>
                      </div>
                    )}

                    {/* Make SVG */}
                    {!selVector ? (
                      <button
                        type="button"
                        onClick={() => handleVectorize(selectedArtifact.id, selNobg?.id)}
                        disabled={isWorking}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/60 hover:border-primary/50 hover:bg-primary/5 transition-all text-muted-foreground hover:text-foreground disabled:opacity-50 text-left"
                      >
                        {activeOperation === "vectorize" ? (
                          <Loader2 className="h-4 w-4 animate-spin text-primary flex-none" />
                        ) : (
                          <FileCode className="h-4 w-4 flex-none" />
                        )}
                        <div>
                          <p className="text-xs font-medium">{activeOperation === "vectorize" ? "Converting..." : "Make SVG"}</p>
                          <p className="text-[10px] text-muted-foreground/60">
                            {selNobg ? "Vectorizes from no-bg version" : "Vectorizes this image to SVG"}
                          </p>
                        </div>
                      </button>
                    ) : (
                      <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-primary/30 bg-primary/5 text-primary">
                        <Check className="h-4 w-4 flex-none" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">SVG Created</p>
                          <p className="text-[10px] text-primary/60">Available in downloads below</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Error display */}
              {opError && (
                <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                  {opError}
                </p>
              )}

              {/* ── DOWNLOADS FOR SELECTED ───────────────────────────────── */}
              {selectedArtifact && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Downloads
                  </p>
                  <div className="space-y-1.5">
                    <a
                      href={selectedArtifact.url}
                      download={`variant-${variant.label}-${getVersionMeta(selectedArtifact).label.toLowerCase().replace(/\s/g, "-")}.png`}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/60 hover:border-border hover:bg-muted/30 transition-all text-muted-foreground hover:text-foreground"
                    >
                      <ImageIcon className="h-4 w-4 flex-none" />
                      <div className="flex-1">
                        <p className="text-xs font-medium">Export PNG</p>
                        <p className="text-[10px] text-muted-foreground/60">
                          {selectedArtifact.width} × {selectedArtifact.height}
                        </p>
                      </div>
                      <Download className="h-3.5 w-3.5 flex-none opacity-50" />
                    </a>

                    {selNobg && (
                      <a
                        href={selNobg.url}
                        download={`variant-${variant.label}-nobg.png`}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-secondary/40 hover:border-secondary/70 bg-secondary/5 hover:bg-secondary/10 transition-all text-secondary"
                      >
                        <Scissors className="h-4 w-4 flex-none" />
                        <div className="flex-1">
                          <p className="text-xs font-medium">Export PNG (No BG)</p>
                          <p className="text-[10px] text-secondary/60">Transparent background</p>
                        </div>
                        <Download className="h-3.5 w-3.5 flex-none opacity-50" />
                      </a>
                    )}

                    {selVector && (
                      <a
                        href={selVector.url}
                        download={`variant-${variant.label}.svg`}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-primary/40 hover:border-primary/70 bg-primary/5 hover:bg-primary/10 transition-all text-primary"
                      >
                        <FileCode className="h-4 w-4 flex-none" />
                        <div className="flex-1">
                          <p className="text-xs font-medium">Export SVG</p>
                          <p className="text-[10px] text-primary/60">Scalable vector format</p>
                        </div>
                        <Download className="h-3.5 w-3.5 flex-none opacity-50" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
