// The ONE sanctioned deep entrypoint the dedicated worker may take into
// @respin/credits: the Stripe-backed external-command adapter for the
// deletion lifecycle (Phase 10b-1 Task 4). Nothing else in this package is
// reachable from `worker/**`; the lint boundary names this file exactly.
export {
  createStripeExternalCommandPort,
  type DeletionStripeClient,
} from "./stripe/deletion-commands";
// R-165: the deletion tick replays money held while a workspace was
// tombstoned, for every workspace that is active again.
export { replayHeldStripeEventsForActiveWorkspaces } from "./stripe/webhooks";
