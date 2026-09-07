import {
  runRefresh,
  type YouTubeDiscoveryPort,
} from "./refresh";
import {
  runSystemAutopsyAttempt,
  type SystemUsagePort,
  type SystemVendorPort,
  type SystemVendorPortFactory,
} from "./system-autopsy";
import type {
  DigestRunOnceCommand,
  RunOnceHandlers,
} from "./run-once";
import {
  runWeeklyDigest,
  type DigestDeliveryPort,
  type WeeklyDigestInput,
} from "./weekly-digest";

export interface WeeklyDigestInputPort {
  load(command: DigestRunOnceCommand): Promise<WeeklyDigestInput>;
}

/**
 * Scheduler-neutral composition for both pg-boss and the recorded run-once
 * fallback. External credentials and vendor clients remain injected ports.
 */
export function createRunOnceHandlers(input: {
  readonly discovery: YouTubeDiscoveryPort;
  readonly digestInputs: WeeklyDigestInputPort;
  readonly digestDelivery: DigestDeliveryPort;
  readonly systemUsage: SystemUsagePort;
  /**
   * A fixed port, or a factory resolved once per attempt. Production passes
   * the factory (`attemptBoundAutopsyVendor`), because its vendor is priced
   * from the active config and that read has to land BEFORE the claim.
   */
  readonly autopsyVendor: SystemVendorPort | SystemVendorPortFactory;
}): RunOnceHandlers {
  return {
    async refresh(command) {
      return runRefresh({
        runId: command.runId,
        nicheId: command.nicheId,
        scheduledAt: command.scheduledAt,
      }, input.discovery);
    },
    async digest(command) {
      const digest = await input.digestInputs.load(command);
      if (digest.digestId !== command.digestId || digest.weekStart !== command.weekStart) {
        throw new Error("weekly digest input does not match its scheduled command");
      }
      const result = await runWeeklyDigest(digest, input.digestDelivery);
      return result.status === "delivered" ? { status: "completed" } : result;
    },
    async autopsy(command) {
      // The vendor — and with it every config value it is priced under — is
      // resolved BEFORE `runSystemAutopsyAttempt` places the reservation. A
      // factory that refuses (a config deadline the lease cannot hold) throws
      // here, with no claim and no vendor call to account for: the job
      // retries and dead-letters exactly as a refused dispatch does (billing
      // gate round 2, CHANGE 2).
      const vendor = typeof input.autopsyVendor === "function"
        ? await input.autopsyVendor(command)
        : input.autopsyVendor;
      return runSystemAutopsyAttempt({
        command,
        usage: input.systemUsage,
        vendor,
      });
    },
  };
}
