import { pgEnum } from "drizzle-orm/pg-core";

// Persisted rights authority shared by transcript-derived analysis and the
// framework library. `product_seed` is reserved for checked-in library seed
// rows; no ingestion writer may mint it.
export const contentRightsBasis = pgEnum("content_rights_basis", [
  "profile_private",
  "creator_consent",
  "independently_licensed",
  "product_seed",
]);
