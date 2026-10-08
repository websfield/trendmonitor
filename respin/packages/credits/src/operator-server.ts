// The ONE sanctioned deep entrypoint an OPERATOR SCRIPT may take into
// @respin/credits (audit P3-R1(b), decisions R-157): the settle command for one
// stranded generation candidate. Operator scripts are otherwise denied the app
// facade, raw DB construction and every write capability; this exports one
// function, wired to the server database here, so `scripts/settle-candidate.ts`
// holds no connection, no scope and no capability of its own. The lint
// boundary names this file exactly (`eslint.config.mjs`, operator surface).
import { getServerDb } from "@respin/db";

import {
  operatorSettleCandidate as settleOne,
  type OperatorSettleOutcome,
} from "./held-drafts";

export type { OperatorSettleOutcome } from "./held-drafts";

/**
 * Settle ONE stored candidate by attempt id, acting as the workspace's owner
 * through `withWorkspace` (so the lifecycle fence applies) and through the
 * same settlement "Finish this draft" uses. Ids, a state and a code come back.
 */
export function operatorSettleCandidate(attemptId: string): Promise<OperatorSettleOutcome> {
  return settleOne(getServerDb(), attemptId, new Date());
}
