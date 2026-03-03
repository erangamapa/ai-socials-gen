import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  BLOB_STORAGE_PROVIDER: z.enum(["local", "vercel-blob"]).default("local"),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  LOCAL_BLOB_DIR: z.string().default("./public/uploads"),

  ANTHROPIC_API_KEY: z.string().optional(),
  NANO_BANANA_API_KEY: z.string().optional(),
  RECRAFT_API_KEY: z.string().optional(),

  USE_MOCK_PROVIDERS: z
    .string()
    .transform((v) => v === "true")
    .default("false"),

  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
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
  return _env;
}
