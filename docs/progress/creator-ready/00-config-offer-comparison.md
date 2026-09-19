# Phase 0 configuration/offer comparison

Owner-run export received 2026-09-17; locally inspected at 2026-09-16T22:48:57.429Z, HEAD `79de2dbb14944f2f3089c621dc8bc9d31e0c1882`.

**Active-version comparison: version 18 observed in owner-supplied database output.** The agent's direct Docker access remains denied. The supplied command targets local container `respin-postgres`, database `respin`, user `respin`; its role as the intended acceptance environment is not independently established.

Evidence is preserved in [entry-gate-phase-0.txt](entry-gate-phase-0.txt), section `OWNER-RUN DATABASE EVIDENCE`, including all five result sets and the actual batch command. Source export SHA256: `c93cfcd5b4dc0fbd16b4492dfd0d94a7943f0c3a2b5d8d20b9532642cf05e515`. File modification time: 2026-09-16T22:46:55.483Z; this is not a certified query execution timestamp. Shell exit status was not included in the export; all five expected one-row results are present. This is owner-run evidence, not a Codex-executed live query.

The active-config SELECT was:
```sql
SELECT version, content FROM config_versions ORDER BY version DESC LIMIT 1;
```

| Tier | Landing price | Landing / seed / active monthly credits | Landing / seed / active profile cap |
|---|---|---|---|
| Free | $0 | 25 / 25 / 25 | 1 / 1 / 1 |
| Creator | $10/month | 250 / 250 / 250 | 1 / 1 / 1 |
| Pro | $60/month | 2,000 / 2,000 / 2,000 | 1 / 1 / 1 |
| Studio | $200/month | 8,000 / 8,000 / 8,000 | 5 / 5 / 5 |

All four active allowance/profile mappings match the seed and landing copy. Subscription price amounts are not stored in this configuration document: the mapped Stripe Price objects were not fetched, so actual checkout amount/currency/interval parity remains unverified.

## Credit costs

Every active credit-cost key is listed; all match `CONFIG_V1_SEED`.

| Key | Seed | Active v18 |
|---|---|---|
| spin | 5 | 5 |
| autopsy | 4 | 4 |
| caption | 1 | 1 |
| hookSet | 2 | 2 |
| revision | 2 | 2 |
| fullScript | 5 | 5 |
| trendBrowse | 0 | 0 |
| ideationBatch | 3 | 3 |
| onboardingBrainBuild | 0 | 0 |
| onboardingBrainRebuild | 50 | 50 |

## Active price-map keys

The seed map is empty. The active map contains exactly these four keys; their presence is a recorded difference, not proof that the Stripe objects are active or priced correctly.

| Stripe Price key | Maps to |
|---|---|
| `price_1U5DOSJxxCV4hjOPKQOd8S0X` | studio |
| `price_1U5DOSJxxCV4hjOPe1EP7rb9` | creator |
| `price_1U5DOSJxxCV4hjOPvTmy47TM` | pro |
| `price_1U5DOTJxxCV4hjOPJ5VCaVSi` | pack |

## Other configuration differences and limits

A recursive comparison of the exported JSON with the seed's static object literal found only the four price-map additions above and one additional LLM price entry: `llm.prices.claude-haiku-4-5-20251001`, input 1,000 and output 5,000 nano-USD per token. These are stored configuration values, not independently verified provider prices. Other seed fields match, including pack 1,000 credits / $10 / 12 months, pause 1–3 months and all per-tier entitlements.

Sources reread: `respin/packages/db/src/seed.ts`, `respin/app/(marketing)/pricing-copy.ts`, and `respin/tests/landing-pricing.test.ts`. Static constants were decoded from the TypeScript AST without executing seed code; exported allowances/profile limits were checked against the actual landing strings. The landing test pins seed values and literal marketing prices; its previous green result alone did not establish the active configuration.

Earlier direct queries were blocked and remain recorded as history. No configuration, pricing, product code or database row was changed by this work. Live concurrency tests and end-to-end checkout acceptance remain unrun.
