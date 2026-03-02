import "dotenv/config";
import pg from "pg";

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL!;
const client = new pg.Client({ connectionString: url });

interface AnalysisData {
  description?: string;
  colorPalette?: string[];
  mood?: string;
  composition?: string;
  styleNotes?: string;
  subjects?: string[];
}

async function main() {
  await client.connect();

  const analyzed = await client.query(
    'SELECT type, analysis FROM "AssetVaultItem" WHERE "analysisStatus" = $1',
    ["done"]
  );

  console.log(`Analyzed assets: ${analyzed.rows.length}`);

  const moods = new Map<string, number>();
  const colors = new Map<string, number>();
  const subjects = new Map<string, number>();
  const compositions: string[] = [];
  const styleNotes: string[] = [];

  for (const row of analyzed.rows) {
    const a = row.analysis as AnalysisData | null;
    if (!a) continue;
    if (a.mood) {
      a.mood.split(",").map((s) => s.trim()).filter(Boolean).forEach((m) => moods.set(m, (moods.get(m) || 0) + 1));
    }
    if (a.colorPalette) {
      a.colorPalette.forEach((c) => colors.set(c, (colors.get(c) || 0) + 1));
    }
    if (a.subjects) {
      a.subjects.forEach((s) => subjects.set(s, (subjects.get(s) || 0) + 1));
    }
    if (a.composition) compositions.push(a.composition);
    if (a.styleNotes) styleNotes.push(a.styleNotes);
  }

  const topMoods = [...moods.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map((e) => e[0]);
  const topColors = [...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map((e) => e[0]);
  const topSubjects = [...subjects.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map((e) => e[0]);

  console.log("Top moods:", topMoods.join(", "));
  console.log("Top colors:", topColors.join(", "));
  console.log("Top subjects:", topSubjects.join(", "));

  const rules: { content: string; category: string; priority: number }[] = [
    // Color rules from analyzed palette
    {
      content: `Primary brand colors from vault analysis: ${topColors.slice(0, 6).join(", ")}. Favor these in all compositions.`,
      category: "color",
      priority: 5,
    },
    {
      content: "Use dark backgrounds (deep purple, navy, charcoal) as the dominant base — this is the established brand pattern across all previous posts.",
      category: "color",
      priority: 5,
    },
    {
      content: "Accent with bright brand colors (orange, yellow, electric blue) for highlights, CTAs, and focal points — never as full backgrounds.",
      category: "color",
      priority: 4,
    },

    // Mood rules from analysis
    {
      content: `The brand's visual mood is: ${topMoods.slice(0, 5).join(", ")}. Every generation should match this energy.`,
      category: "style",
      priority: 5,
    },
    {
      content: "Maintain a premium, high-end feel — CB is a luxury crypto brand, not a budget betting site.",
      category: "style",
      priority: 5,
    },

    // Composition rules from previous posts
    {
      content: "Keep compositions clean with clear focal point. Previous posts consistently use centered or slightly off-center subjects with ample breathing room.",
      category: "composition",
      priority: 4,
    },
    {
      content: "Reserve the top-left corner for the CB logo/notch area — never place graphic elements there.",
      category: "composition",
      priority: 5,
    },
    {
      content: "Leave generous text-safe zones: top 20% and bottom 30% should remain clear for headlines and CTAs to be overlaid later.",
      category: "composition",
      priority: 4,
    },

    // Illustration style rules
    {
      content: "Use bold, stylized illustration style with solid colors, dramatic shadows, and dynamic perspective — matching the CB illustration library.",
      category: "style",
      priority: 5,
    },
    {
      content: "Characters and objects should have clean edges suitable for compositing onto brand templates. No fuzzy or blended edges.",
      category: "style",
      priority: 4,
    },
    {
      content: "Prefer dramatic, fish-eye-like perspectives to inject energy — this is a consistent pattern across approved CB illustrations.",
      category: "style",
      priority: 3,
    },

    // Negative rules (DON'Ts)
    {
      content: "Never generate text, typography, headlines, or CTAs in the image — text is overlaid separately by the design team.",
      category: "dont",
      priority: 5,
    },
    {
      content: "Never generate or modify the CB logo or brandmark — this is handled by the template.",
      category: "dont",
      priority: 5,
    },
    {
      content: "Avoid stock-photo-like, generic, or AI-looking imagery. The output should feel hand-crafted and distinctive.",
      category: "dont",
      priority: 4,
    },
    {
      content: "No cheesy 3D effects, no random gradients, no grungy textures, no rainbow effects — keep it sophisticated.",
      category: "dont",
      priority: 4,
    },
    {
      content: "Avoid overly busy compositions that would compete with text overlay. White space is a feature, not a bug.",
      category: "dont",
      priority: 3,
    },

    // Subject rules from vault
    {
      content: `Common subjects in the brand vault: ${topSubjects.join(", ")}. Reference these when relevant to the brief.`,
      category: "general",
      priority: 3,
    },

    // Typography context (for copy generation)
    {
      content: "Headlines should be bold, short (max 8 words), ALL CAPS energy. Use the CB TOV: confident, inclusive, crypto-proud.",
      category: "typography",
      priority: 4,
    },
    {
      content: "CTAs should be action-oriented and punchy: 'Bet Now', 'Join Now', 'Play Now', 'Claim Bonus'. Max 4 words.",
      category: "typography",
      priority: 3,
    },
  ];

  console.log(`\nSeeding ${rules.length} rules...`);

  for (const rule of rules) {
    const existing = await client.query(
      'SELECT id FROM "PromptRule" WHERE content = $1',
      [rule.content]
    );
    if (existing.rows.length > 0) {
      console.log(`  SKIP (exists): ${rule.content.slice(0, 50)}...`);
      continue;
    }
    await client.query(
      'INSERT INTO "PromptRule" (id, content, category, source, enabled, priority, "createdAt", "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())',
      [rule.content, rule.category, "manual", true, rule.priority]
    );
    console.log(`  ADDED [P${rule.priority}] ${rule.category}: ${rule.content.slice(0, 60)}...`);
  }

  const total = await client.query('SELECT count(*) as cnt FROM "PromptRule"');
  const active = await client.query('SELECT count(*) as cnt FROM "PromptRule" WHERE enabled = true');
  console.log(`\nDone. Total rules: ${total.rows[0].cnt}, Active: ${active.rows[0].cnt}`);

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
