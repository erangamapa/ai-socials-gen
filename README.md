# CB Social Post Generator

Internal tool for generating on-brand social media and email assets from a short creative brief.

## Features

- **Create Job**: Enter a description, select channels (Twitter, IG Feed), choose visual type
- **AI-Powered Pipeline**: Claude planner generates creative specs, Gemini generates image plates, Composer assembles final assets
- **Variant Directions** (A/B): Each job produces distinct visual directions
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

# 1. Accounts & API Keys

Before running the project, you need accounts with the following services. Create them and collect the API keys/credentials listed.

### Always Required

| Service | Purpose | Sign Up | What You Need |
|---------|---------|---------|---------------|
| **Anthropic** | Claude AI — creative planning, prompt enhancement, rule synthesis | [console.anthropic.com](https://console.anthropic.com) | `ANTHROPIC_API_KEY` from [API Keys](https://console.anthropic.com/settings/keys) |
| **Google AI Studio** | Gemini — image generation | [aistudio.google.com](https://aistudio.google.com) | `NANO_BANANA_API_KEY` from [API Keys](https://aistudio.google.com/apikey) |
| **Inngest** | Background job queue (planning → generation → compositing pipeline) | [inngest.com](https://inngest.com) | `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` from your app's API Keys page |

### Optional

| Service | Purpose | Sign Up | What You Need |
|---------|---------|---------|---------------|
| **Recraft** | Background removal and SVG vectorization (post-processing) | [recraft.ai](https://app.recraft.ai) | `RECRAFT_API_KEY` from Profile → API |

### Production Only (not needed for localhost)

| Service | Purpose | Sign Up | What You Need |
|---------|---------|---------|---------------|
| **Neon** | Managed PostgreSQL database | [neon.tech](https://neon.tech) | Connection string for `DATABASE_URL` and `DIRECT_DATABASE_URL` |
| **Vercel** | Hosting (app + serverless functions) | [vercel.com](https://vercel.com) | Vercel account linked to your GitHub repo |
| **Vercel Blob** | Cloud image storage (Vercel's filesystem is read-only) | Created inside Vercel project → Storage tab | `BLOB_READ_WRITE_TOKEN` from Blob store settings |

### Local Development Alternatives

- **Database**: Prisma provides a built-in local Postgres — no Neon account needed. Run `npx prisma dev` to start it.
- **File Storage**: Generated images are stored in `public/uploads/` on your local filesystem. No Vercel Blob needed.
- **Mock Mode**: Set `USE_MOCK_PROVIDERS=true` to skip all AI calls entirely. No Anthropic or Google AI keys needed. The app returns placeholder images and mock plans — useful for UI development.

Once you have your accounts, set the corresponding values in your environment file. See `.env.example` for the full list with descriptions.

---

# 2. Run Locally

### Prerequisites

- **Node.js 20+** — [Download](https://nodejs.org)
- **Git** — [Download](https://git-scm.com)

### Step 1: Clone and Install

```bash
git clone https://github.com/erangamapa/ai-socials-gen.git
cd ai-socials-gen
npm install
```

### Step 2: Create Environment File

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in your API keys:

```env
# Required (or set USE_MOCK_PROVIDERS=true to skip)
ANTHROPIC_API_KEY=sk-ant-your-key-here
NANO_BANANA_API_KEY=AIza-your-key-here

# Optional
RECRAFT_API_KEY=your-key-here
APP_PASSWORD=your-local-password

# Leave these as-is for local dev
DATABASE_URL="prisma+postgres://localhost:51213/?api_key=your-prisma-dev-api-key"
DIRECT_DATABASE_URL="postgres://postgres:postgres@127.0.0.1:51214/template1?sslmode=disable"
BLOB_STORAGE_PROVIDER=local
USE_MOCK_PROVIDERS=false
INNGEST_EVENT_KEY=local
```

### Step 3: Start the Database

In **Terminal 1**, start Prisma's local Postgres:

```bash
npx prisma dev
```

Leave this running. It will output a `api_key` — paste it into `DATABASE_URL` in `.env.local` if the default doesn't work.

### Step 4: Run Setup (Migrations + Seed)

In **Terminal 2**:

```bash
npm run setup:local
```

This generates the Prisma client, applies all database migrations, and seeds templates, vault items, and default prompt rules.

### Step 5: Start the App

In **Terminal 2**:

```bash
npm run dev
```

In **Terminal 3** (background job runner):

```bash
npm run inngest:dev
```

### Step 6: Open the App

Visit [http://localhost:3000](http://localhost:3000). Create a job and watch it generate.

---

# 3. Deploy to Vercel (Production)

### 3.1 Create a Neon Database

1. Go to [console.neon.tech](https://console.neon.tech) and sign up.
2. Click **New Project**, name it (e.g. `ai-socials-gen`), pick a region, create.
3. Copy the **Connection string** (looks like `postgresql://user:pass@ep-xxx.aws.neon.tech/neondb?sslmode=require`).

### 3.2 Push Code to GitHub

```bash
git remote add origin https://github.com/YOUR_USERNAME/ai-socials-gen.git
git push -u origin main
```

### 3.3 Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and import your GitHub repo.
2. Before deploying, add these **Environment Variables**:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Your Neon connection string |
| `DIRECT_DATABASE_URL` | Same Neon connection string |
| `BLOB_STORAGE_PROVIDER` | `vercel-blob` |
| `BLOB_READ_WRITE_TOKEN` | _(leave empty for now — add in 3.5)_ |
| `ANTHROPIC_API_KEY` | From Anthropic console |
| `NANO_BANANA_API_KEY` | From Google AI Studio |
| `RECRAFT_API_KEY` | From Recraft dashboard |
| `USE_MOCK_PROVIDERS` | `false` |
| `APP_PASSWORD` | A password to protect the app |
| `INNGEST_EVENT_KEY` | _(leave empty — add in 3.6)_ |
| `INNGEST_SIGNING_KEY` | _(leave empty — add in 3.6)_ |

3. Click **Deploy**. Note your app URL (e.g. `https://ai-socials-gen-xxx.vercel.app`).

### 3.4 Run Production Setup (Migrations + Seed)

After the first deploy, apply migrations and seed the database **once**:

```bash
DIRECT_DATABASE_URL="your-neon-connection-string" \
DATABASE_URL="your-neon-connection-string" \
npm run setup:prod
```

Or pull env vars from Vercel first:

```bash
npx vercel env pull
npm run setup:prod
```

### 3.5 Create Vercel Blob Storage

1. In your Vercel project, go to the **Storage** tab.
2. Click **Create Database** → choose **Blob**.
3. Name it (e.g. `ai-socials-gen-assets`) and create.
4. Link it to your project (Production environment).
5. Copy the **Read-Write Token** from the Blob store settings.
6. Add it as `BLOB_READ_WRITE_TOKEN` in Settings → Environment Variables.
7. **Redeploy** the project.

### 3.6 Connect Inngest

1. Go to [app.inngest.com](https://app.inngest.com) and sign up.
2. Create an app. Set **App URL** to: `https://YOUR_APP.vercel.app/api/inngest`
3. Go to **API Keys** and copy the **Event Key** and **Signing Key**.
4. Add them in Vercel Settings → Environment Variables:
   - `INNGEST_EVENT_KEY` = Event Key
   - `INNGEST_SIGNING_KEY` = Signing Key
5. **Redeploy**.

> **Inngest can't sync?** If Vercel Deployment Protection is enabled, go to Vercel Settings → Deployment Protection → create a Protection Bypass for Automation secret, then add it in Inngest as the deployment protection key.

### 3.7 Verify Production

1. Open your app URL.
2. Log in with your `APP_PASSWORD`.
3. Create a job and wait for variants to generate.
4. Images should load from Vercel Blob.

---

# 4. Data Migration Guide

This section covers migrating data from an existing deployment (old database, old Vercel Blob store, old service accounts) to a new environment — either localhost or a fresh Vercel deployment.

### What Data Lives Where

| Data | Where It's Stored | How to Migrate |
|------|-------------------|----------------|
| Jobs, Variants, Artifacts, Feedback, Prompt Rules | **PostgreSQL** (Neon in production, Prisma local in dev) | Database dump/restore |
| Generated images (plates, finals, specs, SVGs) | **Vercel Blob** (production) or `public/uploads/` (local) | Blob-to-Blob transfer or local download |
| Brand assets (logos, fonts, illustrations, templates) | **Git repo** (`assets/vault/`) | Already in the repo — no migration needed |
| Vault index and asset metadata | **PostgreSQL** (`AssetVaultItem` table) | Included in database migration, or re-seed with `npm run db:seed` |

---

### 4.1 Migrate the Database (Old Neon → New Neon or Local)

#### Option A: Direct dump and restore (recommended)

Export from the old database and import into the new one:

```bash
# Export from old database
pg_dump --no-owner --data-only \
  "postgresql://old-user:old-pass@old-host/old-db?sslmode=require" \
  > /tmp/migration.sql

# Import into new database
psql "postgresql://new-user:new-pass@new-host/new-db?sslmode=require" \
  < /tmp/migration.sql

# Clean up (contains data — don't commit)
rm /tmp/migration.sql
```

> Make sure the new database has the schema first. Run `npm run setup:prod` (or `npm run setup:local`) against the new database before importing data.

#### Option B: Using a SQL dump file

If you have a `db-export.sql` from a previous `pg_dump`:

```bash
DIRECT_DATABASE_URL="new-database-url" npx tsx scripts/restore-db-export.ts
```

This restores only `Job`, `Variant`, `Artifact`, and `Feedback` data. Templates, vault items, and prompt rules are handled by the seed script.

#### Option C: Neon branch (zero-downtime copy)

If both old and new are on Neon and in the same project:

```bash
neonctl branches create --name new-env --parent main
```

This creates an instant copy of the entire database.

---

### 4.2 Migrate Images (Old Vercel Blob → New Vercel Blob)

When you change Vercel Blob stores (new Vercel account, new project, or new Blob store), images won't load because artifact URLs point to the old Blob domain. You need to re-upload the files and update the database URLs.

#### Step 1: Download images from old Blob to local

If you still have access to the old deployment's `public/uploads/` directory (e.g. from a local checkout that was previously used), you already have the files. If not, download them from the old Blob URLs:

```bash
# Get all artifact URLs from old database
psql "old-database-url" -t -A -c \
  "SELECT url FROM \"Artifact\" WHERE url LIKE 'https://%'" \
  > /tmp/blob-urls.txt

# Download each one into public/uploads/
mkdir -p public/uploads
while read url; do
  # Extract the path portion after the Blob domain
  filepath=$(echo "$url" | sed 's|https://[^/]*/||')
  mkdir -p "public/uploads/$(dirname "$filepath")"
  curl -o "public/uploads/$filepath" "$url"
done < /tmp/blob-urls.txt
```

#### Step 2: Upload to new Blob store and update DB

```bash
BLOB_READ_WRITE_TOKEN="new-blob-token" \
DIRECT_DATABASE_URL="new-database-url" \
npm run assets:upload-to-blob
```

This script:
1. Uploads every file in `public/uploads/` to the new Vercel Blob store
2. Updates all URL references in the database (`Artifact.url`, `AssetVaultItem.pathOrUrl`, `Job.subjectReferenceUrl`, `Job.subjectReferences`, `Job.angleReference`, `Job.retrievalBundle`)

---

### 4.3 Migrate from Local to Cloud

If you've been running locally and want to move everything to Vercel:

1. **Database**: Export your local data and import into Neon:

```bash
# Export from local Prisma Postgres
pg_dump --no-owner --data-only \
  "postgres://postgres:postgres@127.0.0.1:51214/template1" \
  > /tmp/local-export.sql

# Import into Neon
psql "your-neon-url" < /tmp/local-export.sql
rm /tmp/local-export.sql
```

2. **Images**: Upload local files to Vercel Blob:

```bash
BLOB_READ_WRITE_TOKEN="your-blob-token" \
DIRECT_DATABASE_URL="your-neon-url" \
npm run assets:upload-to-blob
```

3. **Deploy** to Vercel (see Section 3).

---

### 4.4 Migrate from Cloud to Local

If you want to run an existing cloud deployment locally (e.g. for debugging):

1. **Pull env vars**:

```bash
npx vercel env pull .env.local
```

2. **Option A**: Point directly at the Neon database (easiest — uses production data live):

Just run `npm run dev`. Your `.env.local` already has `DATABASE_URL` pointing at Neon. Images load from Vercel Blob URLs.

3. **Option B**: Copy data to a local database (fully offline):

```bash
# Start local Postgres
npx prisma dev

# Apply schema
npm run setup:local

# Export from Neon, import locally
pg_dump --no-owner --data-only "your-neon-url" > /tmp/cloud-data.sql
psql "postgres://postgres:postgres@127.0.0.1:51214/template1" < /tmp/cloud-data.sql
rm /tmp/cloud-data.sql
```

Set `BLOB_STORAGE_PROVIDER=local` in `.env.local`. Images with Blob URLs will still load (they're public URLs), but any new images will save locally.

---

### 4.5 Migrate Inngest (Old Account → New Account)

Inngest doesn't store your application data — it only manages the job queue. To switch accounts:

1. Create a new app at [app.inngest.com](https://app.inngest.com).
2. Set the App URL to your deployment's `/api/inngest` endpoint.
3. Copy the new **Event Key** and **Signing Key**.
4. Update `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` in your environment.
5. Redeploy. Any in-flight jobs from the old account will be lost, but completed jobs are in the database.

---

# Scripts Reference

| Script | Description |
|--------|-------------|
| `npm run setup:local` | Run migrations + seed (local). Requires DB running (`npx prisma dev`). |
| `npm run setup:prod` | Run migrations + seed (production). Requires `DATABASE_URL`. |
| `npm run dev` | Start Next.js dev server on port 3000 |
| `npm run inngest:dev` | Start Inngest dev server (for local background jobs) |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Create/apply migrations (interactive, local dev) |
| `npm run db:deploy` | Apply migrations (production, non-interactive) |
| `npm run db:seed` | Seed templates, vault, rules |
| `npm run db:reset` | Reset database (drops all data) |
| `npm run vault:index` | Rebuild `assets/vault/index.json` from folder structure |
| `npm run vault:analyze` | Analyze vault items with AI (embeddings, descriptions) |
| `npm run assets:upload-to-blob` | Upload local `public/uploads/` to Vercel Blob and update DB URLs |

---

# Project Structure

```
├── assets/vault/              # Brand asset vault (reference images + index.json)
├── prisma/
│   ├── schema.prisma          # Database schema
│   ├── seed.ts                # Seed templates + vault items
│   └── migrations/            # SQL migrations
├── scripts/
│   ├── setup-local.ts         # Local setup (migrate + seed)
│   ├── setup-prod.ts          # Production setup
│   ├── upload-assets-to-blob.ts  # Migrate local assets to Blob
│   ├── restore-db-export.ts   # Restore from db-export.sql
│   └── index-vault.ts         # Rebuild vault index
├── src/
│   ├── app/                   # Next.js pages and API routes
│   ├── components/            # React components (shadcn/ui)
│   ├── hooks/                 # React hooks
│   └── lib/
│       ├── ai/                # Claude + Gemini providers
│       ├── inngest/           # Background job workflows
│       ├── storage/           # Blob storage abstraction (local / Vercel)
│       └── vault/             # Asset vault search + embeddings
```

---

# Troubleshooting

| Problem | Solution |
|---------|----------|
| `DATABASE_URL is required` | Add `DATABASE_URL` and `DIRECT_DATABASE_URL` to `.env.local` or Vercel env vars |
| `Connection refused` on setup | Start the database first: `npx prisma dev` |
| Build fails with "Function size exceeds 300MB" | Ensure `.vercelignore` includes `public/uploads` |
| Inngest "App not synced" | Add `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`, redeploy. Check deployment protection bypass. |
| Jobs stay "queued" forever | Verify Inngest is connected; check Inngest dashboard for function registration |
| Images don't load in production | Set `BLOB_STORAGE_PROVIDER=vercel-blob` and add `BLOB_READ_WRITE_TOKEN` |
| Broken images after migration | Run `npm run assets:upload-to-blob` to re-upload and update DB URLs |

---

# API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/jobs` | Create a new generation job |
| `GET` | `/api/jobs/:id` | Get job with variants and artifacts |
| `POST` | `/api/feedback` | Submit accept/reject feedback |
| `GET` | `/api/library` | List jobs with filters |
| `GET` | `/api/vault/search` | Search asset vault |
| `POST` | `/api/enhance-prompt` | AI-enhance a brief or reference instruction |
| `POST` | `/api/rules/synthesize` | Synthesize prompt rules from feedback |
| `POST` | `/api/artifacts/:id/remove-bg` | Remove background from an artifact |
| `POST` | `/api/artifacts/:id/vectorize` | Convert artifact to SVG |
