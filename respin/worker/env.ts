/**
 * Environment parsing for the worker entrypoint, kept out of `main.ts` (which
 * runs on import) so its refusals can be driven by a test.
 */
export function envInteger(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
  fallback: number,
  options: { readonly minimum?: number } = {},
): number {
  // Default floor 1: every bound here is a count or an interval. A caller
  // whose code floor is 0 (the local wait queue — `resolveQueueLimit` in
  // pool.ts accepts 0 as "no waiting") says so explicitly, so env and code
  // agree on what 0 means instead of env refusing a value code allows.
  const minimum = options.minimum ?? 1;
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${name} must be a safe integer of at least ${minimum}`);
  }
  return value;
}

export function requiredEnv(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
