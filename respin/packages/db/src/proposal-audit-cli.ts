// The pre-deploy result-proposal audit (Phase 10a plan C1, R-115).
//
//   pnpm proposals:audit               → classify and print; exit 2 when an
//                                        accepted proposal carries non-verified
//                                        evidence (a deployment block), else 0
//   pnpm proposals:audit --supersede   → also supersede every still-proposed
//                                        non-verified result proposal (idempotent)
//
// Prints ids and counts only — never a metric label, a value or a brain field.
import { createDb } from "./client";
import {
  auditResultProposals,
  renderProposalAudit,
  supersedeUnverifiedResultProposals,
} from "./promotion-audit";

export async function main(argv: readonly string[], env: Readonly<Record<string, string | undefined>>): Promise<number> {
  const supersede = argv.includes("--supersede");
  const unknown = argv.filter((arg) => arg !== "--supersede");
  if (unknown.length > 0) {
    console.error(`proposal-audit: unknown argument ${unknown[0]}; the only flag is --supersede`);
    return 1;
  }
  const url = env.DATABASE_URL;
  if (!url) {
    console.error("proposal-audit: DATABASE_URL is not set");
    return 1;
  }
  const db = createDb(url);
  try {
    const before = await auditResultProposals(db);
    console.log(renderProposalAudit(before));
    if (supersede && before.unverified.proposed.length > 0) {
      const { superseded } = await supersedeUnverifiedResultProposals(db);
      console.log(`superseded ${superseded.length}: ${superseded.join(", ")}`);
      const after = await auditResultProposals(db);
      if (after.unverified.proposed.length !== 0) {
        console.error("proposal-audit: proposed non-verified proposals remain after supersede; refusing to report success");
        return 1;
      }
    }
    return before.deploymentBlocked ? 2 : 0;
  } finally {
    await db.$client.end();
  }
}

if (process.argv[1] && /proposal-audit-cli\.ts$/.test(process.argv[1])) {
  main(process.argv.slice(2), process.env).then(
    (code) => { process.exitCode = code; },
    (error) => {
      console.error(`proposal-audit: failed (${error instanceof Error ? error.name : "unknown"})`);
      process.exitCode = 1;
    },
  );
}
