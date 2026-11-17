import { ClickhouseEnvSchema } from "@roost/clickhouse";
import { storage } from "@roost/core";
import { z } from "zod";

/** Treats `KEY=` (empty) in .env as "not set", so optional values can be left blank. */
const blank = (v: string | undefined) => (v ? v : undefined);

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(8787),
    DATABASE_URL: z.url(),
    /** Keys the HMAC of sign-in codes. Generate with `openssl rand -hex 32`. */
    AUTH_SECRET: z.string().min(32),
    EMAIL_PROVIDER: z.enum(["smtp", "resend"]),
    SMTP_URL: z.string().optional().transform(blank).pipe(z.url().optional()),
    RESEND_API_KEY: z.string().optional().transform(blank),
    EMAIL_FROM: z.string().min(3),
    SIGNUP_ALLOWLIST: z.string().default(""),
    /** Enables the AI proxy. Without it /v1/ai/run answers 503 unavailable. */
    OPENROUTER_API_KEY: z.string().optional().transform(blank),
    /** Public dashboard address, linked from issues sent to Linear. */
    DASHBOARD_URL: z.string().optional().transform(blank).pipe(z.url().optional()),
    /** Built SDK packages to serve under /sdk (pnpm build:sdks). */
    SDK_DIR: z.string().default("../../dist/sdk"),
    /** Apply pending Postgres and ClickHouse migrations before listening. Set false to run them yourself. */
    MIGRATE_ON_START: z
      .enum(["true", "false", "1", "0"])
      .default("true")
      .transform((v) => v === "true" || v === "1"),
    /** Defaults suit `pnpm dev` (cwd apps/api); the Docker image sets /app/migrations/*. */
    PG_MIGRATIONS_DIR: z.string().default("../../packages/db/migrations"),
    CH_MIGRATIONS_DIR: z.string().default("../../packages/clickhouse/migrations"),
  })
  .extend(ClickhouseEnvSchema.shape)
  .extend(storage.StorageEnvSchema.shape)
  .refine((e) => e.EMAIL_PROVIDER !== "smtp" || e.SMTP_URL, { path: ["SMTP_URL"], message: "required for smtp" })
  .refine((e) => e.EMAIL_PROVIDER !== "resend" || e.RESEND_API_KEY, {
    path: ["RESEND_API_KEY"],
    message: "required for resend",
  });

export type Env = z.infer<typeof EnvSchema>;

/** Parses process.env once at startup. A missing or bad value stops the process. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid environment: ${fields}`);
  }
  return parsed.data;
}
