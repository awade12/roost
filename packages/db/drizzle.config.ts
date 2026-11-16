import { defineConfig } from "drizzle-kit";

// drizzle-kit requires a default export.
export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://roost:roost@localhost:5433/roost" },
});
