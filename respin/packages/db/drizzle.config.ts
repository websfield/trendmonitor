import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/schema.ts", "./src/auth-schema.ts", "./src/billing-schema.ts", "./src/trends-schema.ts", "./src/system-spend-schema.ts", "./src/lifecycle-schema.ts", "./src/auth-mail-schema.ts"],
  out: "./migrations",
  dbCredentials: {
    // Only migrate/push need a live database; generate/check work offline.
    url: process.env.DATABASE_URL ?? "",
  },
});
