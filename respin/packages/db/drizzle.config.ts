import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/schema.ts", "./src/auth-schema.ts", "./src/billing-schema.ts"],
  out: "./migrations",
  dbCredentials: {
    // Only migrate/push need a live database; generate/check work offline.
    url: process.env.DATABASE_URL ?? "",
  },
});
