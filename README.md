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

## Quick Start

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

Edit `.env` and set your `DATABASE_URL`:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/socials_gen?sslmode=disable"
```

### 3. Start local database (if using Docker)

```bash
docker run -d --name socials-gen-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=socials_gen \
  -p 5432:5432 \
  postgres:16
```

Or use Prisma's built-in local Postgres:

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

In one terminal, start the Next.js dev server:

```bash
npm run dev
```

In another terminal, start the Inngest dev server (handles background jobs):

```bash
npm run inngest:dev
```

### 6. Open the app

Visit [http://localhost:3000](http://localhost:3000)

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

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `BLOB_STORAGE_PROVIDER` | No | `local` (default) or `vercel-blob` |
| `BLOB_READ_WRITE_TOKEN` | Prod | Vercel Blob token |
| `LOCAL_BLOB_DIR` | No | Local upload directory (default: `./public/uploads`) |
| `ANTHROPIC_API_KEY` | No | Claude API key (mock available) |
| `NANO_BANANA_API_KEY` | No | Nano Banana API key (mock available) |
| `USE_MOCK_PROVIDERS` | No | `true` to use mock AI providers (default) |
| `INNGEST_EVENT_KEY` | Prod | Inngest event key |
| `INNGEST_SIGNING_KEY` | Prod | Inngest signing key |

## MVP Mock Mode

By default, `USE_MOCK_PROVIDERS=true` enables the app to run end-to-end without any external API keys:

- **Mock Planner**: Returns realistic structured JSON creative specs
- **Mock Image Provider**: Generates colored gradient placeholder images with text labels using Sharp
- **Local Storage**: Saves artifacts to `public/uploads/` served by Next.js

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/jobs` | Create a new generation job |
| `GET` | `/api/jobs/:id` | Get job with variants and artifacts |
| `POST` | `/api/feedback` | Submit accept/reject feedback |
| `GET` | `/api/library` | List jobs with filters |
| `GET` | `/api/vault/search` | Search asset vault |
