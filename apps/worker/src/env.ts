import { ClickhouseEnvSchema } from "@roost/clickhouse";
import { z } from "zod";

/** Treats `KEY=` (empty) in .env as "not set". */
const blank = (v: string | undefined) => (v ? v : undefined);

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.url(),
    /** Decrypts alert webhook URLs; must match the API's. */
    AUTH_SECRET: z.string().min(32),
    /** Email alerts are skipped (with an error in the alert history) when this is unset. */
    EMAIL_PROVIDER: z.enum(["smtp", "resend"]).optional(),
    SMTP_URL: z.string().optional().transform(blank).pipe(z.url().optional()),
    RESEND_API_KEY: z.string().optional().transform(blank),
    EMAIL_FROM: z.string().optional().transform(blank),
    /** Linked from alerts so they open the issue. */
    DASHBOARD_URL: z.string().optional().transform(blank).pipe(z.url().optional()),
  })
  .extend(ClickhouseEnvSchema.shape);

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid environment: ${fields}`);
  }
  return parsed.data;
}
