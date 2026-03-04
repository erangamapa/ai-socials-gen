"use client";

import { useRef, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { CBBrandmark } from "@/components/cb-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Pen,
  Search,
  Brain,
  Eye,
  Image,
  MessageSquare,
  ArrowRight,
  Layers,
  Palette,
  Maximize2,
  Scissors,
  FileCode,
  Share2,
  ThumbsUp,
  BookOpen,
  BarChart3,
  Sparkles,
  RefreshCw,
  TrendingDown,
  ChevronRight,
  Shapes,
} from "lucide-react";

function FadeIn({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"} ${className}`}
    >
      {children}
    </div>
  );
}

const PIPELINE_STEPS = [
  { icon: Pen, title: "Brief", desc: "Describe the creative you need — sport, event, mood, or character." },
  { icon: Search, title: "Vault Search", desc: "AI retrieves matching brand assets, templates, and style references." },
  { icon: Brain, title: "Claude Planner", desc: "AI writes 3 detailed variant specs with art direction and copy." },
  { icon: Eye, title: "Spec Review", desc: "Review prompts, references, and art direction before generating." },
  { icon: Image, title: "Image Generation", desc: "Gemini generates images using templates, refs, and learned rules." },
  { icon: MessageSquare, title: "Feedback", desc: "Accept or reject with notes — every decision trains the agents." },
];

const OUTPUT_TOOLS = [
  { icon: Maximize2, title: "Expand", desc: "AI extends the illustration canvas for larger formats and crops.", color: "text-secondary" },
  { icon: Scissors, title: "Remove Background", desc: "Recraft-powered background removal for clean cutout assets.", color: "text-primary" },
  { icon: FileCode, title: "Make SVG", desc: "Recraft vectorization turns raster illustrations into scalable SVGs.", color: "text-accent" },
  { icon: Share2, title: "Use in Social", desc: "One-click handoff from approved illustration into the social post pipeline.", color: "text-secondary" },
];

const LEARNING_FEATURES = [
  { icon: ThumbsUp, title: "Feedback Capture", desc: "Every accept/reject with optional notes creates structured learning signals." },
  { icon: BookOpen, title: "Rule Engine", desc: "Feedback generates PromptRules scoped by mode, category, and confidence." },
  { icon: BarChart3, title: "Template Stats", desc: "Per-template win rates tracked and injected into planner decisions." },
  { icon: Sparkles, title: "AI Synthesis", desc: "Claude periodically consolidates rules, merging duplicates and contradictions." },
  { icon: RefreshCw, title: "Vault Scoring", desc: "Reference assets ranked by usage success via feedback-driven usageScore." },
  { icon: TrendingDown, title: "Auto-Decay", desc: "Low-confidence and stale rules auto-disabled to keep the system sharp." },
];

const TECH_STACK = [
  "Next.js 16",
  "Tailwind CSS",
  "Prisma + PostgreSQL",
  "Claude Sonnet 4",
  "Google Gemini",
  "Recraft.ai",
  "Inngest",
  "Sharp",
  "SWR",
  "TypeScript",
];

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen">
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-b from-primary/6 via-secondary/4 to-transparent pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-secondary/5 blur-[120px] pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-4 pt-24 pb-20 text-center">
          <FadeIn>
            <div className="flex justify-center mb-8">
              <div className="relative">
                <CBBrandmark className="h-16 w-auto text-primary" />
                <div className="absolute inset-0 blur-2xl bg-primary/20 -z-10" />
              </div>
            </div>
          </FadeIn>

          <FadeIn>
            <h1 className="text-4xl md:text-6xl tracking-tight mb-4" style={{ fontFamily: "var(--font-midnight)" }}>
              <span className="text-foreground">CB </span>
              <span className="text-primary">FORGE</span>
            </h1>
          </FadeIn>

          <FadeIn>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-3">
              Internal Creative Asset Platform
            </p>
            <p className="text-base text-muted-foreground/80 max-w-xl mx-auto mb-10">
              AI-powered creative pipeline that learns from every decision you make.
              Generate on-brand social posts, illustrations, and pictogram icons — then refine them with
              intelligent output tools — all while the system gets smarter.
            </p>
          </FadeIn>

          <FadeIn>
            <Link href="/create">
              <Button className="bg-accent text-accent-foreground hover:bg-accent/90 font-semibold px-8 py-3 text-base">
                Start Creating
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </FadeIn>
        </div>
      </section>

      {/* ── Pipeline Overview ─────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 py-20">
        <FadeIn>
          <div className="text-center mb-14">
            <Badge variant="secondary" className="mb-3">Pipeline</Badge>
            <h2 className="text-3xl font-bold tracking-tight">From Brief to Finished Asset</h2>
            <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
              Six steps from idea to on-brand creative — with human review at the center.
            </p>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PIPELINE_STEPS.map((step, i) => (
            <FadeIn key={step.title}>
              <div className="group relative border border-border rounded-xl p-5 bg-card/50 hover:bg-card hover:border-secondary/30 transition-all duration-300">
                <div className="flex items-start gap-4">
                  <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-secondary/10 text-secondary group-hover:bg-secondary/20 transition-colors">
                    <step.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-mono text-muted-foreground/60">{String(i + 1).padStart(2, "0")}</span>
                      <h3 className="font-semibold text-foreground">{step.title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                  </div>
                </div>
                {i < PIPELINE_STEPS.length - 1 && (
                  <ChevronRight className="absolute -right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/30 hidden lg:block" />
                )}
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── Three Modes ───────────────────────────────────────────────── */}
      <section className="relative py-20">
        <div className="absolute inset-0 bg-linear-to-b from-transparent via-card/30 to-transparent pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-4">
          <FadeIn>
            <div className="text-center mb-14">
              <Badge variant="secondary" className="mb-3">Modes</Badge>
              <h2 className="text-3xl font-bold tracking-tight">Three Creative Engines</h2>
              <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
                Each mode has its own dedicated AI agent, ruleset, and vault — built for a specific creative output.
              </p>
            </div>
          </FadeIn>

          <div className="grid md:grid-cols-3 gap-6">
            <FadeIn>
              <div className="border border-border rounded-xl p-6 bg-card/50 h-full">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Layers className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold">Social Post</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
                  Template-based compositing that generates channel-aware social media assets.
                  Claude picks the best template, writes art direction, and Gemini composites
                  the illustration onto the branded canvas.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">Twitter / X</Badge>
                  <Badge variant="outline">Instagram Feed</Badge>
                  <Badge variant="outline">Template Compositing</Badge>
                  <Badge variant="outline">Copy Generation</Badge>
                  <Badge variant="outline">Vault References</Badge>
                </div>
              </div>
            </FadeIn>

            <FadeIn>
              <div className="border border-border rounded-xl p-6 bg-card/50 h-full">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center">
                    <Palette className="h-5 w-5 text-secondary" />
                  </div>
                  <h3 className="text-xl font-bold">Illustration</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
                  Standalone character and scene generation in the CB flat-vector style.
                  Supports subject reference photos, multiple size presets, and direct
                  handoff to the social post pipeline.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">1:1 Square</Badge>
                  <Badge variant="outline">4:5 Portrait</Badge>
                  <Badge variant="outline">16:9 Landscape</Badge>
                  <Badge variant="outline">Subject Reference</Badge>
                  <Badge variant="outline">Flat Vector Style</Badge>
                </div>
              </div>
            </FadeIn>

            <FadeIn>
              <div className="rounded-xl p-6 bg-card/50 h-full border border-accent/20">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                    <Shapes className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Pictogram</h3>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
                  3D stylized icon generation in the CB brand style. Each pictogram is a
                  premium isometric asset — volumetric depth, gradient fills, CB purple dominant —
                  ready for compositing on any surface.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">1:1 Square</Badge>
                  <Badge variant="outline">3D Isometric Style</Badge>
                  <Badge variant="outline">102 Vault Icons</Badge>
                  <Badge variant="outline">Concept Reference</Badge>
                  <Badge variant="outline">Use in Social</Badge>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ── Output Tools ──────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 py-20">
        <FadeIn>
          <div className="text-center mb-14">
            <Badge variant="secondary" className="mb-3">Output</Badge>
            <h2 className="text-3xl font-bold tracking-tight">Post-Generation Tools</h2>
            <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
              Refine accepted outputs with AI-powered manipulation tools.
            </p>
          </div>
        </FadeIn>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {OUTPUT_TOOLS.map((tool) => (
            <FadeIn key={tool.title}>
              <div className="border border-border rounded-xl p-5 bg-card/50 hover:bg-card hover:border-primary/20 transition-all duration-300 text-center">
                <div className={`w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center mx-auto mb-4 ${tool.color}`}>
                  <tool.icon className="h-6 w-6" />
                </div>
                <h3 className="font-semibold mb-2">{tool.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{tool.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── Smart Learning System ─────────────────────────────────────── */}
      <section className="relative py-20">
        <div className="absolute inset-0 bg-linear-to-b from-transparent via-secondary/3 to-transparent pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-4">
          <FadeIn>
            <div className="text-center mb-14">
              <Badge variant="secondary" className="mb-3">Intelligence</Badge>
              <h2 className="text-3xl font-bold tracking-tight">Self-Improving Agents</h2>
              <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
                Every accept and reject trains the system. Rules evolve, templates earn
                reputations, and references compete for relevance.
              </p>
            </div>
          </FadeIn>

          {/* Circular flow visualization */}
          <FadeIn>
            <div className="flex items-center justify-center gap-3 mb-12 flex-wrap">
              {["Feedback", "Rules", "Generation", "Feedback"].map((label, i) => (
                <div key={`${label}-${i}`} className="flex items-center gap-3">
                  <span className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                    label === "Feedback"
                      ? "bg-accent/15 text-accent border border-accent/30"
                      : label === "Rules"
                      ? "bg-secondary/15 text-secondary border border-secondary/30"
                      : "bg-primary/15 text-primary border border-primary/30"
                  }`}>
                    {label}
                  </span>
                  {i < 3 && <ArrowRight className="h-4 w-4 text-muted-foreground/40" />}
                </div>
              ))}
            </div>
          </FadeIn>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {LEARNING_FEATURES.map((feat) => (
              <FadeIn key={feat.title}>
                <div className="border border-border rounded-xl p-5 bg-card/50">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center text-secondary">
                      <feat.icon className="h-4 w-4" />
                    </div>
                    <h3 className="font-semibold text-sm">{feat.title}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{feat.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tech Stack ────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 py-20">
        <FadeIn>
          <div className="text-center mb-10">
            <Badge variant="secondary" className="mb-3">Stack</Badge>
            <h2 className="text-3xl font-bold tracking-tight">Built With</h2>
          </div>
        </FadeIn>

        <FadeIn>
          <div className="flex flex-wrap justify-center gap-2">
            {TECH_STACK.map((tech) => (
              <span
                key={tech}
                className="px-4 py-2 rounded-full text-sm font-medium border border-border bg-card/50 text-muted-foreground hover:text-foreground hover:border-secondary/30 transition-colors"
              >
                {tech}
              </span>
            ))}
          </div>
        </FadeIn>
      </section>

      {/* ── Footer CTA ────────────────────────────────────────────────── */}
      <section className="relative py-20">
        <div className="absolute inset-0 bg-linear-to-t from-primary/4 via-transparent to-transparent pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-4 text-center">
          <FadeIn>
            <CBBrandmark className="h-10 w-auto text-primary/40 mx-auto mb-6" />
            <h2 className="text-2xl font-bold mb-3">Ready to forge something?</h2>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              Start with a brief. The agents handle the rest — and learn from you every time.
            </p>
            <Link href="/create">
              <Button className="bg-accent text-accent-foreground hover:bg-accent/90 font-semibold px-8 py-3 text-base">
                Create Your First Job
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </FadeIn>
        </div>
      </section>

      <div className="h-px bg-linear-to-r from-transparent via-border to-transparent" />
      <footer className="py-8 text-center text-xs text-muted-foreground/50">
        CB Forge — Internal Tool
      </footer>
    </main>
  );
}
