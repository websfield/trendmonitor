// Phase 10a: the public Sample Spin's rollout flag, in the closed-scope shape
// `RESPIN_DELETION_REQUEST_SCOPES` established: unset or blank is CLOSED, a
// named value opens exactly what it names, and an unknown value is a refusal
// rather than "nothing" or "everything".
//
//   RESPIN_PUBLIC_SAMPLE_SPIN=          → disabled (the default; the landing page keeps its mockup)
//   RESPIN_PUBLIC_SAMPLE_SPIN=preview   → the route and the landing panel are live for this deployment
//
// `public` is deliberately NOT a value this slice understands: only 10c may
// turn the public Sample Spin on, after the closed platform registry, the
// claim ledger and the privacy text pass (plan C2, rollout section). A
// deployment that sets it today is refused at read, which is the fail-closed
// direction.
export const PUBLIC_SAMPLE_SPIN_ENV = "RESPIN_PUBLIC_SAMPLE_SPIN";

export type PublicSampleSpinEnablement = "disabled" | "preview";

export class PublicSampleSpinEnablementError extends Error {
  constructor(value: string) {
    super(`${PUBLIC_SAMPLE_SPIN_ENV} names an unknown value "${value}"; allowed: preview (or unset)`);
    this.name = "PublicSampleSpinEnablementError";
  }
}

export function resolvePublicSampleSpinEnablement(
  env: Readonly<Record<string, string | undefined>>,
): PublicSampleSpinEnablement {
  const raw = (env[PUBLIC_SAMPLE_SPIN_ENV] ?? "").trim();
  if (raw === "" || raw === "disabled") return "disabled";
  if (raw === "preview") return "preview";
  throw new PublicSampleSpinEnablementError(raw);
}

/** `preview` is set but the bucket key is not: the deployment is half-configured, and no visitor may be admitted. */
export class PublicSampleSpinNotConfiguredError extends Error {
  constructor() {
    super("The public Sample Spin is enabled but RESPIN_PUBLIC_SAMPLE_SPIN_HMAC_KEYS is not set; no visitor can be admitted until the bucket key is configured.");
    this.name = "PublicSampleSpinNotConfiguredError";
  }
}
