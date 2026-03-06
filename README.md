# CB Social Post Generator

Internal tool for generating on-brand social media and email assets from a short creative brief.

## Features

- **Create Job**: Enter a description, select channels (Twitter, IG Feed, IG Story, Email Header), choose visual type
- **AI-Powered Pipeline**: Claude planner generates creative specs, Nano Banana generates image plates, Composer assembles final assets
- **3 Variant Directions** (A/B/C): Each job produces 3 distinct visual directions
- **Review Flow**: Accept or reject each variant with structured feedback
- **Job Library**: Browse, filter, and revisit all jobs
- **Reproducibility**: Every generation stores its full recipe (inputs, vault refs, planner spec, artifacts)

## Tech Stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **UI**: Tailwind CSS v4 + shadcn/ui
- **Database**: PostgreSQL via Prisma ORM
- **Background Jobs**: Inngest
- **Image Processing**: Sharp
- **Storage**: Local filesystem (dev) / Vercel Blob (production)

---

# Setup Guide: From Zero to Running

This guide walks you through setting up the project **locally** and **on Vercel**, step by step. No prior experience needed.

**TL;DR — Local (5 min):** `npm install` → `cp .env.example .env` → `npx prisma dev` (Terminal 1) → `npm run setup:local` (Terminal 2) → `npm run dev` (Terminal 2) → `npm run inngest:dev` (Terminal 3) → open http://localhost:3000

---

## Prerequisites

- **Node.js 20+** — [Download](https://nodejs.org)
- **Git** — [Download](https://git-scm.com)
- **npm** — Comes with Node.js

---

# Part 1: Run Locally (Fresh Checkout)

## Step 1: Clone the Project

```bash
git clone https://github.com/YOUR_ORG/ai-socials-gen.git
cd ai-socials-gen
```

## Step 2: Install Dependencies

```bash
npm install
```

## Step 3: Create Environment File

```bash
cp .env.example .env
```

Edit `.env` and set the database URLs. The `.env.example` includes defaults for Prisma's built-in Postgres. When you run `npx prisma dev` (Step 5), it will output the correct connection details — use those if the defaults don't work.

### Optional: Add API Keys (or Use Mock Mode)

| Variable | Where to Get It | Required? |
|----------|-----------------|-----------|
| `ANTHROPIC_API_KEY` | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) | No — use `USE_MOCK_PROVIDERS=true` to skip |
| `NANO_BANANA_API_KEY` | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) | No — mock available |
| `RECRAFT_API_KEY` | [app.recraft.ai](https://app.recraft.ai) → Profile → API | No — only for remove-bg & vectorize |

**To run without any API keys**, set in `.env`:

```env
USE_MOCK_PROVIDERS=true
```

The app will use mock AI responses and placeholder images.

## Step 4: Start the Database

In **Terminal 1**, start Prisma's local Postgres:

```bash
npx prisma dev
```

Leave this running. It starts a local PostgreSQL instance. Copy the `api_key` shown and paste it into `DATABASE_URL` in `.env` if needed.

## Step 5: Run Setup (Migrations + Seed)

In **Terminal 2** (new terminal):

```bash
npm run setup:local
```

This will:
- Generate the Prisma client
- Apply all database migrations
- Seed templates, vault items, and default rules

## Step 6: Start the App

Keep **Terminal 1** running (`npx prisma dev`). In **Terminal 2**:

```bash
npm run dev
```

In **Terminal 3** (for background jobs):

```bash
npm run inngest:dev
```

## Step 7: Open the App

Visit [http://localhost:3000](http://localhost:3000)

You're done! Create a job and watch it generate.

---

# Part 2: Deploy to Vercel (Production)

This section extends the local setup to run the app on Vercel with Neon, Blob storage, and Inngest.

## Accounts You Need to Create

| Service | What It Does | Sign Up | Free Tier |
|---------|--------------|---------|-----------|
| **GitHub** | Hosts your code | [github.com](https://github.com) | Free |
| **Neon** | PostgreSQL database | [neon.tech](https://neon.tech) | 0.5 GB |
| **Vercel** | Hosts the app | [vercel.com](https://vercel.com) | 100 GB bandwidth |
| **Vercel Blob** | Stores generated images | Created inside Vercel project | 1 GB |
| **Inngest** | Background job queue | [inngest.com](https://inngest.com) | 5,000 runs/month |
| **Anthropic** | Claude API (planning) | [console.anthropic.com](https://console.anthropic.com) | Pay-as-you-go |
| **Google AI** | Gemini API (images) | [aistudio.google.com](https://aistudio.google.com) | Free tier |
| **Recraft** | Remove-bg, vectorize | [app.recraft.ai](https://app.recraft.ai) | Free tier |

---

## 2.1 Create a Neon Database

1. Go to [console.neon.tech](https://console.neon.tech) and sign up.
2. Click **New Project**.
3. Name it (e.g. `ai-socials-gen`), pick a region, click **Create Project**.
4. Copy the **Connection string** (looks like `postgresql://user:pass@ep-xxx.aws.neon.tech/neondb?sslmode=require`).
5. Save it — you'll need it for Vercel and for running setup.

---

## 2.2 Push Code to GitHub

1. Create a repo at [github.com/new](https://github.com/new) (e.g. `ai-socials-gen`).
2. Push your code:

```bash
git remote add origin https://github.com/YOUR_USERNAME/ai-socials-gen.git
git push -u origin main
```

---

## 2.3 Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new).
2. Import your GitHub repo.
3. Before deploying, add **Environment Variables**:

| Key | Value | Environment |
|-----|-------|-------------|
| `DATABASE_URL` | Your Neon connection string | Production |
| `DIRECT_DATABASE_URL` | Same Neon connection string | Production |
| `BLOB_STORAGE_PROVIDER` | `vercel-blob` | Production |
| `BLOB_READ_WRITE_TOKEN` | Leave empty for now — add in 2.5 | Production |
| `ANTHROPIC_API_KEY` | From [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) | Production |
| `NANO_BANANA_API_KEY` | From [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) | Production |
| `RECRAFT_API_KEY` | From [app.recraft.ai](https://app.recraft.ai) → Profile → API | Production |
| `USE_MOCK_PROVIDERS` | `false` | Production |
| `APP_PASSWORD` | A password to protect the app (e.g. `mysecret123`) | Production |
| `INNGEST_EVENT_KEY` | Leave empty — add in 2.6 | Production |
| `INNGEST_SIGNING_KEY` | Leave empty — add in 2.6 | Production |

4. Click **Deploy**. Wait for the build to finish.
5. Note your app URL (e.g. `https://ai-socials-gen-xxx.vercel.app`).

---

## 2.4 Run Production Setup (Migrations + Seed)

After the first deploy, run the setup script **once** to apply migrations and seed the database:

```bash
DIRECT_DATABASE_URL="your-neon-connection-string" \
DATABASE_URL="your-neon-connection-string" \
npm run setup:prod
```

Or pull env vars from Vercel (`npx vercel env pull`), then run `npm run setup:prod` in a terminal where those vars are loaded.

---

## 2.5 Create Vercel Blob Storage

1. In your Vercel project, go to the **Storage** tab.
2. Click **Create Database** → choose **Blob**.
3. Name it (e.g. `ai-socials-gen-assets`) and create.
4. Link it to your project (Production).
5. Go to the Blob store **Settings** and copy the **Read-Write Token**.
6. In your project **Settings → Environment Variables**, add:
   - Key: `BLOB_READ_WRITE_TOKEN`
   - Value: the token you copied
7. **Redeploy** the project.

---

## 2.6 Connect Inngest

1. Go to [app.inngest.com](https://app.inngest.com) and sign up.
2. Click **Create App** or **Add App**.
3. Set **App URL** to: `https://YOUR_APP.vercel.app/api/inngest`
4. Go to **API Keys** and copy:
   - **Event Key**
   - **Signing Key**
5. In Vercel **Settings → Environment Variables**, add:
   - `INNGEST_EVENT_KEY` = Event Key
   - `INNGEST_SIGNING_KEY` = Signing Key
6. **Redeploy**.

### If Inngest Can't Sync (Vercel Deployment Protection)

1. In Vercel **Settings → Deployment Protection**.
2. Create a **Protection Bypass for Automation** secret.
3. In Inngest, add this as the **Deployment protection key**.

---

## 2.7 Verify Production

1. Open your app URL.
2. Log in with `APP_PASSWORD` if set.
3. Create a job and wait for variants to generate.
4. Images should load from Vercel Blob.

---

# Part 3: Scripts Reference

| Script | Description |
|--------|-------------|
| `npm run setup:local` | Run migrations + seed (local). Requires DB running (`npx prisma dev`). |
| `npm run setup:prod` | Run migrations + seed (production). Requires `DATABASE_URL`. |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Create/apply migrations (interactive, local dev) |
| `npm run db:deploy` | Apply migrations (production, non-interactive) |
| `npm run db:seed` | Seed templates, vault, rules |
| `npm run db:reset` | Reset database (drops all data) |
| `npm run vault:index` | Rebuild `assets/vault/index.json` from folder structure |
| `npm run vault:analyze` | Analyze vault items (embeddings, etc.) |
| `npm run assets:upload-to-blob` | Upload local `public/uploads/` to Vercel Blob and update DB URLs |
| `npm run inngest:dev` | Start Inngest dev server (for local background jobs) |

---

# Part 4: Migrating Existing Data

## Restore Jobs/Variants/Artifacts from Export

If you have a `db-export.sql` from a previous database:

```bash
DIRECT_DATABASE_URL="your-neon-url" npx tsx scripts/restore-db-export.ts
```

## Migrate Local Assets to Vercel Blob

If artifact URLs point to `/uploads/...` (local paths) and you've deployed to Vercel:

1. Ensure `public/uploads/` exists locally with the asset files.
2. Run:

```bash
BLOB_READ_WRITE_TOKEN="your-blob-token" \
DIRECT_DATABASE_URL="your-neon-url" \
npm run assets:upload-to-blob
```

This uploads all files to Blob and updates `Artifact`, `AssetVaultItem`, and `Job` URLs in the database.

---

# Troubleshooting

| Problem | Solution |
|---------|----------|
| `DATABASE_URL is required` | Add `DATABASE_URL` and `DIRECT_DATABASE_URL` to `.env` or Vercel env vars |
| `Connection refused` on setup | Start the database first: `npx prisma dev` |
| Build fails with "Function size exceeds 300MB" | Ensure `.vercelignore` includes `public/uploads` and `db-export.sql` |
| Inngest "App not synced" | Add `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`, redeploy. Check deployment protection bypass. |
| Jobs stay "queued" forever | Verify Inngest is connected; check dashboard for function registration |
| Images don't load in production | Set `BLOB_STORAGE_PROVIDER=vercel-blob` and add `BLOB_READ_WRITE_TOKEN` |
| Broken images after restore | Run `npm run assets:upload-to-blob` to migrate local paths to Blob URLs |

---

# Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `DIRECT_DATABASE_URL` | Yes (scripts) | Same as DATABASE_URL for Neon |
| `BLOB_STORAGE_PROVIDER` | No | `local` (default) or `vercel-blob` |
| `BLOB_READ_WRITE_TOKEN` | Prod | Vercel Blob token |
| `LOCAL_BLOB_DIR` | No | Local upload dir (default: `./public/uploads`) |
| `ANTHROPIC_API_KEY` | No | Claude API key (mock available) |
| `NANO_BANANA_API_KEY` | No | Google AI / Gemini key (mock available) |
| `RECRAFT_API_KEY` | No | Recraft (vectorize, remove-bg) |
| `USE_MOCK_PROVIDERS` | No | `true` = mock AI, no keys needed |
| `APP_PASSWORD` | No | If set, app requires login at `/login` |
| `INNGEST_EVENT_KEY` | Prod | Inngest event key |
| `INNGEST_SIGNING_KEY` | Prod | Inngest signing key |

---

# Project Structure

```
├── assets/vault/           # Asset Vault (reference images + index.json)
├── prisma/
│   ├── schema.prisma      # Database schema
│   ├── seed.ts            # Seed templates + vault items
│   └── migrations/        # SQL migrations
├── scripts/
│   ├── setup-local.ts     # Local setup (migrate + seed)
│   ├── setup-prod.ts      # Production setup
│   ├── upload-assets-to-blob.ts  # Migrate local assets to Blob
│   ├── restore-db-export.ts      # Restore from db-export.sql
│   └── index-vault.ts    # Rebuild vault index
├── src/
│   ├── app/               # Next.js pages and API routes
│   ├── components/
│   ├── hooks/
│   └── lib/
│       ├── ai/            # Claude + Gemini providers
│       ├── inngest/       # Background workflows
│       ├── storage/       # Blob abstraction
│       └── vault/         # Asset vault search
```

---

# API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/jobs` | Create a new generation job |
| `GET` | `/api/jobs/:id` | Get job with variants and artifacts |
| `POST` | `/api/feedback` | Submit accept/reject feedback |
| `GET` | `/api/library` | List jobs with filters |
| `GET` | `/api/vault/search` | Search asset vault |
