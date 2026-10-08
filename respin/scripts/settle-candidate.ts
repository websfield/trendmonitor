// The operator's settle command for ONE stranded generation candidate
// (audit P3-R1(b), decisions R-157).
//
//   pnpm -C respin settle:candidate <attempt-id>
//   pnpm -C respin settle:candidate --help
//
// It re-enters the ONE settlement path — the same entry the creator's "Finish
// this draft" uses — for a `vendor_complete` attempt whose candidate is still
// stored. It never calls a model and never prints the candidate: the output is
// the attempt id, a state and a closed code. See HELP below for every refusal.
import {
  operatorSettleCandidate,
  type OperatorSettleOutcome,
} from "@respin/credits/operator-server";
import { isEntrypoint } from "./entrypoint";

export const HELP = `settle-candidate <attempt-id>

Settles ONE stored generation candidate (an attempt at vendor_complete) under
the workspace lock, through the same path as the creator's "Finish this draft"
on /studio. This is the operator's recovery for a draft the creator does not
finish within the 24-hour bound; the worker pages
(generation_unsettled_aging) before its 24-hour clear destroys the candidate.

It prints the attempt id, its state and a code — never the candidate, which is
creator content. Running it again on a settled attempt is idempotent: it
prints already_settled and charges nothing.

Refusals it inherits from the settlement, and prints (exit 1):
  paused                 the workspace is paused (R-12); the draft stays held.
                         Settle again after the pause ends.
  insufficient_balance   the balance cannot cover the price; the draft stays
                         held. Settle again after a top-up.
  transient              a serialisation failure, deadlock or lock timeout;
                         the draft stays held. Settle again.
  workspace_unavailable  the workspace is tombstoned or being erased (the
                         withWorkspace lifecycle fence); nothing is settled.
  recovery_required      the candidate is gone — cleared at 24 hours, built
                         from since-erased context, or unreadable. Nothing was
                         charged; reconcile the vendor spend from model_usage
                         by this attempt id.
  refused                the attempt already ended in a refusal.
  in_flight              the attempt has not reached vendor_complete yet.
  profile_unavailable    the creator profile is archived or not in reach.
  no_active_owner        the workspace has no active owner to act as.
  not_found              no attempt carries this id.

A tier change since the claim is NOT a refusal: the settlement prints the tier
the debit was taken under.

Exit codes: 0 settled or already_settled; 1 a refusal above; 2 bad usage.
`;

/** What one outcome prints — ids, state, code and numbers only. */
export function describeOutcome(outcome: OperatorSettleOutcome): string {
  switch (outcome.code) {
    case "settled":
      return `attempt=${outcome.attemptId} state=settled code=settled credits_charged=${outcome.creditsCharged} tier=${outcome.tier} config_version=${outcome.configVersion}`;
    case "already_settled":
      return `attempt=${outcome.attemptId} state=settled code=already_settled credits_charged=0`;
    default:
      return `attempt=${outcome.attemptId} state=${outcome.state ?? "none"} code=${outcome.code}`;
  }
}

export type SettleCandidateDeps = Readonly<{
  settle: (attemptId: string) => Promise<OperatorSettleOutcome>;
  write: (line: string) => void;
}>;

export async function main(
  argv: readonly string[],
  deps: SettleCandidateDeps = {
    settle: (attemptId) => operatorSettleCandidate(attemptId),
    write: (line) => process.stdout.write(line),
  }
): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    deps.write(HELP);
    return 0;
  }
  const ids = argv.filter((arg) => !arg.startsWith("-"));
  if (ids.length !== 1 || !/^[A-Za-z0-9:_-]{1,128}$/.test(ids[0]!)) {
    deps.write(`usage: settle-candidate <attempt-id>   (--help for the refusals)\n`);
    return 2;
  }
  const outcome = await deps.settle(ids[0]!);
  deps.write(`${describeOutcome(outcome)}\n`);
  return outcome.code === "settled" || outcome.code === "already_settled" ? 0 : 1;
}

if (isEntrypoint(import.meta.url, process.argv[1])) {
  void main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
      // The facade's pool would otherwise hold the process open.
      process.exit(code);
    },
    (error: unknown) => {
      // The error's NAME only: a driver message can carry row data.
      process.stderr.write(
        `settle-candidate failed: ${error instanceof Error ? error.name : "unknown"}\n`
      );
      process.exit(1);
    }
  );
}
