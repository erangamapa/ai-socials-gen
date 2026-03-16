import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_DATABASE_URL: z.string().optional(),

  BLOB_STORAGE_PROVIDER: z.enum(["local", "vercel-blob"]).default("local"),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  LOCAL_BLOB_DIR: z.string().default("./public/uploads"),

  ANTHROPIC_API_KEY: z.string().optional(),
  NANO_BANANA_API_KEY: z.string().optional(),
  RECRAFT_API_KEY: z.string().optional(),

  USE_MOCK_PROVIDERS: z
    .string()
    .optional()
    .default("false")
    .transform((v) => v === "true"),

  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),

  APP_PASSWORD: z.string().optional(),

  NODE_ENV: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (_env) return _env;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    console.error(`[ENV] Invalid environment variables:\n${formatted}`);
    throw new Error(`Invalid environment variables:\n${formatted}`);
  }

  _env = result.data;

  if (_env.NODE_ENV === "production") {
    if (!_env.INNGEST_SIGNING_KEY) {
      console.warn("[SECURITY] INNGEST_SIGNING_KEY is not set in production — Inngest webhooks are unverified.");
    }
    if (!_env.APP_PASSWORD) {
      console.warn("[SECURITY] APP_PASSWORD is not set in production — the app has no authentication.");
    }
  }

  return _env;
}
