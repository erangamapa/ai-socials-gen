"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shuffle } from "lucide-react";

const CHANNEL_OPTIONS = [
  { id: "twitter", label: "Twitter / X", size: "1600×900" },
  { id: "ig_feed", label: "Instagram Feed", size: "1080×1350" },
] as const;

const RANDOM_PROMPTS = [
  "Champions League matchday promo — big match energy, early odds callout for CB",
  "NBA playoffs semi-finals — highlight the best live betting odds available tonight",
  "Counter-Strike 2 Major tournament — esports promo with team rivalry angle",
  "UFC Fight Night — knockout odds promo, main event hype with fighter energy",
  "Premier League weekend fixtures — multi-match odds boost announcement",
  "Formula 1 Grand Prix — race day promo, fastest odds, podium excitement",
  "Dota 2 The International — esports championship, high stakes, massive prize pool",
  "Tennis Grand Slam — serve and volley action, live in-play betting promo",
  "Boxing world title fight — heavyweight showdown odds special, night of champions",
  "NFL Sunday highlights — touchdown odds and same-game parlays promotion",
  "Cricket World Cup — batting action promo, live match odds callout",
  "Ice Hockey Stanley Cup Playoffs — power play promo, puck drop tonight",
  "Rugby World Cup — scrum energy, try-scoring odds boost for the weekend",
  "Baseball World Series — home run promo, game 7 tension and excitement",
  "Volleyball Nations League — spike and serve action, live betting odds",
  "MMA cage fight night — ground and pound promo, late-night knockout special",
  "Cycling Tour de France — mountain stage promo, stage winner odds",
  "Golf Masters — hole-in-one odds promo, weekend leaderboard excitement",
  "Swimming World Championship — split-second finish, medal odds callout",
  "Snooker World Championship — maximum break odds, Crucible drama",
];

function pickRandom(): string {
  return RANDOM_PROMPTS[Math.floor(Math.random() * RANDOM_PROMPTS.length)];
}

export function JobForm() {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [channels, setChannels] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleShuffle = () => {
    let next = pickRandom();
    // avoid repeating the same one
    while (next === description && RANDOM_PROMPTS.length > 1) next = pickRandom();
    setIsShuffle(true);
    setDescription(next);
    setTimeout(() => setIsShuffle(false), 400);
  };

  const toggleChannel = (channelId: string) => {
    setChannels((prev) =>
      prev.includes(channelId)
        ? prev.filter((c) => c !== channelId)
        : [...prev, channelId]
    );
  };

  const handleSubmit = async () => {
    setError(null);

    if (!description.trim()) {
      setError("Please enter a description");
      return;
    }
    if (channels.length === 0) {
      setError("Please select at least one channel");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, channels }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to create job");
      }

      const data = await res.json();
      router.push(`/jobs/${data.jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Create New Job</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="description">Description / Brief</Label>
            <button
              type="button"
              onClick={handleShuffle}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md px-2 py-1 hover:bg-muted/60"
              title="Generate a random brief"
            >
              <Shuffle className={`h-3.5 w-3.5 transition-transform duration-300 ${isShuffle ? "rotate-180" : ""}`} />
              Random brief
            </button>
          </div>
          <Textarea
            id="description"
            placeholder="Describe the social post you need, e.g. 'Champions League matchday promo for CB with exciting odds callout'..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="resize-none"
          />
        </div>

        <div className="space-y-3">
          <Label>Output Channels</Label>
          <div className="grid grid-cols-2 gap-3">
            {CHANNEL_OPTIONS.map((ch) => (
              <label
                key={ch.id}
                className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  checked={channels.includes(ch.id)}
                  onCheckedChange={() => toggleChannel(ch.id)}
                />
                <div>
                  <div className="font-medium text-sm">{ch.label}</div>
                  <div className="text-xs text-muted-foreground">{ch.size}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-md p-3">
            {error}
          </div>
        )}

        <Button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full"
          size="lg"
        >
          {isSubmitting ? "Creating Job..." : "Generate"}
        </Button>
      </CardContent>
    </Card>
  );
}
