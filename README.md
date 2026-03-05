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

# Complete Deployment Guide (Step-by-Step)

This guide walks you through deploying this app to the cloud from scratch. No prior experience needed.

## What You'll Create

| Service | What it does | Free tier |
|---------|--------------|-----------|
| **Neon** | Hosts your database | 0.5 GB storage |
| **Vercel** | Hosts your app | 100 GB bandwidth |
| **Vercel Blob** | Stores generated images | 1 GB |
| **Inngest** | Runs background jobs | 5,000 runs/month |

---

## Part 1: Create Your Accounts

### 1.1 GitHub Account

1. Go to [github.com](https://github.com) and sign up (or sign in).
2. You need a GitHub account to connect your code to Vercel.

### 1.2 Neon Account (Database)

1. Go to [neon.tech](https://neon.tech).
2. Click **Sign Up** (top right).
3. Sign up with GitHub or email.
4. You're in! Keep this tab open.

### 1.3 Vercel Account (App Hosting)

1. Go to [vercel.com](https://vercel.com).
2. Click **Sign Up** (top right).
3. Choose **Continue with GitHub**.
4. Authorize Vercel to access your GitHub.
5. You're in! Keep this tab open.

### 1.4 Inngest Account (Background Jobs)

1. Go to [inngest.com](https://www.inngest.com).
2. Click **Sign Up**.
3. Sign up with GitHub or email.
4. You're in! Keep this tab open.

---

## Part 2: Set Up the Database (Neon)

### 2.1 Create a Neon Project

1. In [Neon](https://console.neon.tech), click **New Project**.
2. **Project name**: `ai-socials-gen` (or any name you like).
3. **Region**: Pick one close to you (e.g. US East).
4. Click **Create Project**.

### 2.2 Get Your Connection String

1. After the project is created, you'll see a **Connection string**.
2. Click **Copy** next to it. It looks like:
   ```
   postgresql://neondb_owner:xxxxx@ep-xxx-xxx.aws.neon.tech/neondb?sslmode=require
   ```
3. **Save this somewhere safe** — you'll need it in Part 4.

### 2.3 Run Migrations (Prepare the Database)

1. Open your terminal.
2. Go to your project folder:
   ```bash
   cd /path/to/ai-socials-gen
   ```
3. Run this command (replace `YOUR_NEON_URL` with the connection string you copied):
   ```bash
   DATABASE_URL="YOUR_NEON_URL" npm run db:deploy
   ```
4. You should see: `No pending migrations to apply` or similar success message.
5. (Optional) Seed the database with sample data:
   ```bash
   DATABASE_URL="YOUR_NEON_URL" npm run db:seed
   ```

---

## Part 3: Push Your Code to GitHub

### 3.1 Create a New Repository

1. Go to [github.com/new](https://github.com/new).
2. **Repository name**: `ai-socials-gen`.
3. Choose **Public** or **Private**.
4. Click **Create repository** (don't add README or .gitignore — the project already has them).

### 3.2 Push Your Code

1. In your terminal, from the project folder:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/ai-socials-gen.git
   git push -u origin main
   ```
2. Replace `YOUR_USERNAME` with your GitHub username.
3. If prompted, sign in to GitHub.

---

## Part 4: Deploy to Vercel

### 4.1 Import the Project

1. Go to [vercel.com/new](https://vercel.com/new).
2. Under **Import Git Repository**, find `ai-socials-gen` and click **Import**.
3. If you don't see it, click **Adjust GitHub App Permissions** and allow access to the repo.

### 4.2 Add Environment Variables (Before First Deploy)

1. On the import screen, expand **Environment Variables**.
2. Add each variable below. For each one:
   - **Key**: the variable name
   - **Value**: the value (see table)
   - **Environment**: Production (and Preview if you want)

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Your Neon connection string (from Part 2.2) |
| `DIRECT_DATABASE_URL` | Same Neon connection string |
| `BLOB_STORAGE_PROVIDER` | `vercel-blob` |
| `BLOB_READ_WRITE_TOKEN` | Leave empty for now — you'll add it in Part 4.5 |
| `ANTHROPIC_API_KEY` | Your Claude API key from [console.anthropic.com](https://console.anthropic.com) |
| `NANO_BANANA_API_KEY` | Your Google AI key from [aistudio.google.com](https://aistudio.google.com/apikey) |
| `RECRAFT_API_KEY` | Your Recraft key from [recraft.ai](https://recraft.ai) (optional for vectorize/remove-bg) |
| `USE_MOCK_PROVIDERS` | `false` (use real AI) or `true` (use mocks, no API keys needed) |
| `INNGEST_EVENT_KEY` | Leave empty for now — you'll add it in Part 5 |
| `INNGEST_SIGNING_KEY` | Leave empty for now — you'll add it in Part 5 |

3. Click **Deploy**.

### 4.3 Wait for the Build

1. The first build may take 2–3 minutes.
2. If it fails with "DATABASE_URL is required", go to **Settings → Environment Variables** and add the missing variables, then **Redeploy**.

### 4.4 Note Your App URL

1. When the deploy finishes, you'll see a URL like `https://ai-socials-gen-xxx.vercel.app`.
2. Your main URL is usually `https://ai-socials-gen.vercel.app` or similar.
3. **Save this URL** — you need it for Inngest.

### 4.5 Create Vercel Blob Storage

1. In your Vercel project, go to the **Storage** tab.
2. Click **Create Database** or **Create Store**.
3. Choose **Blob**.
4. Name it (e.g. `ai-socials-gen-assets`) and create it.
5. When asked to link it to the project, choose **Yes** and select **Production**.
6. Go to **Settings** in the Blob store and copy the **Read-Write Token**.
7. Go to your project **Settings → Environment Variables**.
8. Add or edit `BLOB_READ_WRITE_TOKEN` with the token you copied.
9. **Redeploy** so the app picks it up.

---

## Part 5: Connect Inngest (Background Jobs)

### 5.1 Create an Inngest App

1. Go to [app.inngest.com](https://app.inngest.com).
2. Click **Create App** or **Add App**.
3. If asked for a template, choose **Skip** or **Connect existing app** — you already have the code.

### 5.2 Add Your App URL

1. In the **App URL** or **Serve URL** field, enter:
   ```
   https://YOUR_APP.vercel.app/api/inngest
   ```
2. Replace `YOUR_APP` with your actual Vercel URL (e.g. `ai-socials-gen` or `ai-socials-gen-xxx`).
3. Save.

### 5.3 Get Your Inngest Keys

1. In the Inngest dashboard, go to **API Keys** or **Manage Keys**.
2. Copy the **Event Key** (sometimes called "Event key" or "Key").
3. Copy the **Signing Key** (sometimes called "Signing secret").

### 5.4 Add Keys to Vercel

1. In Vercel, go to your project **Settings → Environment Variables**.
2. Add `INNGEST_EVENT_KEY` with the Event Key value.
3. Add `INNGEST_SIGNING_KEY` with the Signing Key value.
4. **Redeploy** the project.

### 5.5 Bypass Vercel Deployment Protection (If Inngest Can't Sync)

If Inngest says "Vercel Deployment Protection might block syncing":

1. In Vercel, go to **Settings → Deployment Protection**.
2. Find **Protection Bypass for Automation**.
3. Click **Create Secret** or **Add Secret**.
4. Name it (e.g. `Inngest`).
5. Copy the generated secret.
6. In Inngest, when configuring the app, use the **Deployment protection key** option and paste the secret.
7. Inngest will use this to access your `/api/inngest` endpoint.

---

## Part 6: Verify Everything Works

1. Open your app URL (e.g. `https://ai-socials-gen.vercel.app`).
2. Create a new job with a short description.
3. Wait for the variants to generate.
4. If images appear and the job completes, you're done!

---

## Troubleshooting

### Build fails with "DATABASE_URL is required"

- Add `DATABASE_URL` and `DIRECT_DATABASE_URL` in Vercel **Settings → Environment Variables**.
- Both should be your Neon connection string.

### Build fails with "Function size exceeds 300MB"

- The project includes a `.vercelignore` that excludes large uploads. Make sure it's in your repo.
- If the error persists, add `assets/vault` to `.vercelignore` (this may affect vault asset serving).

### Inngest shows "App not synced"

- Check that `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` are set in Vercel.
- If you use Vercel Deployment Protection, add the bypass key in Inngest (see Part 5.5).
- Redeploy after adding any new env vars.

### Jobs stay "queued" and never complete

- Verify Inngest is connected: check the Inngest dashboard for your app and functions.
- Ensure `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` are correct.
- Redeploy after adding them.

### Images don't load / upload fails

- Ensure `BLOB_STORAGE_PROVIDER` is `vercel-blob`.
- Add `BLOB_READ_WRITE_TOKEN` from your Vercel Blob store.
- Redeploy.

---

## Quick Start (Local Development)

### Prerequisites

- Node.js 20+
- PostgreSQL (local or Docker)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set your `DATABASE_URL` (see `.env.example` for local options).

### 3. Start local database

```bash
npx prisma dev
```

### 4. Run migrations and seed

```bash
npx prisma generate
npx prisma migrate dev --name init
npm run db:seed
```

### 5. Start development servers

Terminal 1:

```bash
npm run dev
```

Terminal 2:

```bash
npm run inngest:dev
```

### 6. Open the app

Visit [http://localhost:3000](http://localhost:3000)

---

## Project Structure

```
├── assets/vault/           # Asset Vault (reference images + index.json)
├── prisma/
│   ├── schema.prisma       # Database schema
│   └── seed.ts             # Seed templates + vault items
├── src/
│   ├── app/                # Next.js pages and API routes
│   │   ├── create/         # Job creation page
│   │   ├── jobs/[id]/      # Job review page
│   │   ├── library/        # Job library page
│   │   └── api/            # REST API routes
│   ├── components/         # React components
│   ├── hooks/              # Custom hooks (polling)
│   └── lib/
│       ├── ai/             # Claude planner + Nano Banana provider (with mocks)
│       ├── compose/        # Image compositor + QA checks
│       ├── inngest/        # Background workflow definitions
│       ├── storage/        # Blob storage abstraction
│       ├── templates/      # Layout template registry
│       └── vault/          # Asset vault search/retrieval
```

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `DIRECT_DATABASE_URL` | Prod | Same as DATABASE_URL for Neon |
| `BLOB_STORAGE_PROVIDER` | No | `local` (default) or `vercel-blob` |
| `BLOB_READ_WRITE_TOKEN` | Prod | Vercel Blob token |
| `LOCAL_BLOB_DIR` | No | Local upload directory (default: `./public/uploads`) |
| `ANTHROPIC_API_KEY` | No | Claude API key (mock available) |
| `NANO_BANANA_API_KEY` | No | Google AI / Gemini key (mock available) |
| `RECRAFT_API_KEY` | No | Recraft.ai (vectorize, remove-bg) |
| `USE_MOCK_PROVIDERS` | No | `true` to use mock AI providers |
| `INNGEST_EVENT_KEY` | Prod | Inngest event key |
| `INNGEST_SIGNING_KEY` | Prod | Inngest signing key |

## MVP Mock Mode

Set `USE_MOCK_PROVIDERS=true` to run without any API keys:

- **Mock Planner**: Returns realistic structured JSON creative specs
- **Mock Image Provider**: Generates colored gradient placeholder images
- **Local Storage**: Saves artifacts to `public/uploads/`

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/jobs` | Create a new generation job |
| `GET` | `/api/jobs/:id` | Get job with variants and artifacts |
| `POST` | `/api/feedback` | Submit accept/reject feedback |
| `GET` | `/api/library` | List jobs with filters |
| `GET` | `/api/vault/search` | Search asset vault |
