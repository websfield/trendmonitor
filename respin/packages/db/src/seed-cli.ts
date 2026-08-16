// Runnable seed entrypoint: `pnpm -C respin db:seed` (via tsx).
import { createDb } from "./client";
import { assertSeedAllowed, seedDb } from "./seed";

const connectionString = process.env.DATABASE_URL;
assertSeedAllowed(connectionString);
const db = createDb(connectionString);
await seedDb(db);
console.log("seed complete (idempotent — safe to re-run)");
process.exit(0);
