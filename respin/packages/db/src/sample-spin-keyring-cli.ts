// The key-rotation probe an operator runs BEFORE erasing the prior Sample Spin
// HMAC key (Phase 10a plan C4; tenancy gate round 1 NOTE 1: the probe had no
// caller outside tests, and a prior key erased early re-admits every address
// bucketed under it).
//
//   pnpm sample-spin:keyring      → prints the current and prior key VERSIONS
//                                   (never a key) and whether the prior may be
//                                   erased; exit 0 when it may (or there is
//                                   none), 3 while a bucket under it is live
import { createDb } from "./client";
import { parsePublicSampleSpinKeyring, priorKeyVersionRetired, PublicSampleSpinKeyringError } from "./public-sample-spin";

export type KeyringProbeDb = Parameters<typeof priorKeyVersionRetired>[0];

export async function main(
  env: Readonly<Record<string, string | undefined>>,
  openDb: (url: string) => KeyringProbeDb & { $client: { end(): Promise<void> } } = createDb,
  now: Date = new Date(),
): Promise<number> {
  let keyring;
  try {
    keyring = parsePublicSampleSpinKeyring(env.RESPIN_PUBLIC_SAMPLE_SPIN_HMAC_KEYS);
  } catch (error) {
    console.error(`sample-spin-keyring: ${error instanceof PublicSampleSpinKeyringError ? error.message : "keyring unreadable"}`);
    return 1;
  }
  if (!keyring) {
    console.log("sample-spin-keyring: no keyring configured (RESPIN_PUBLIC_SAMPLE_SPIN_HMAC_KEYS is unset); nothing to retire");
    return 0;
  }
  if (!keyring.prior) {
    console.log(`sample-spin-keyring: current ${keyring.current.version}; no prior key configured`);
    return 0;
  }
  const url = env.DATABASE_URL;
  if (!url) {
    console.error("sample-spin-keyring: DATABASE_URL is not set");
    return 1;
  }
  const db = openDb(url);
  try {
    const retired = await priorKeyVersionRetired(db, keyring.prior.version, now);
    console.log(
      `sample-spin-keyring: current ${keyring.current.version}; prior ${keyring.prior.version} ` +
        (retired ? "has no live bucket and MAY be erased" : "still has a live bucket — keep it (at most 24 h after rotation)"),
    );
    return retired ? 0 : 3;
  } finally {
    await db.$client.end();
  }
}

if (process.argv[1] && /sample-spin-keyring-cli\.ts$/.test(process.argv[1])) {
  main(process.env).then(
    (code) => { process.exitCode = code; },
    (error) => {
      console.error(`sample-spin-keyring: failed (${error instanceof Error ? error.name : "unknown"})`);
      process.exitCode = 1;
    },
  );
}
