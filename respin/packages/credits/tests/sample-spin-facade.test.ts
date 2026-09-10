// Phase 10a plan C2: the facade's construction invariants and the rollout
// flag. `maxRetries: 0` is asserted at the SOURCE of the facade because a
// retry inside the SDK is an HTTP attempt the orchestrator cannot count, and
// the facade is the only place the production provider is built for the
// public path.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PUBLIC_SAMPLE_SPIN_ENV,
  PublicSampleSpinEnablementError,
  resolvePublicSampleSpinEnablement,
} from "../src/sample-spin";

const HERE = dirname(fileURLToPath(import.meta.url));

describe("the facade builds the public provider with NO SDK retry", () => {
  const source = readFileSync(join(HERE, "../src/app-server.ts"), "utf8");
  const start = source.indexOf("publicSampleSpin: async");
  const facade = source.slice(start, source.indexOf("};", start));

  it("publicSampleSpin exists and constructs createAnthropicProvider with maxRetries: 0", () => {
    expect(start).toBeGreaterThan(-1);
    expect(facade).toMatch(/createAnthropicProvider\(\{[\s\S]*?maxRetries:\s*0[\s\S]*?\}\)/);
    // NON-VACUITY: the tenant facades build with the config's retries, and the
    // same regex must NOT match them.
    const tenant = source.slice(source.indexOf("generate: async"), source.indexOf("trackedNicheEntitlementFor: async"));
    expect(tenant).toMatch(/maxRetries:\s*content\.llm\.maxRetries/);
    expect(tenant).not.toMatch(/maxRetries:\s*0\b/);
  });

  it("requires the purpose cap and the global cap to be STORED, never defaulted, before a visitor is admitted", () => {
    expect(facade).toContain('"publicSampleSpin.dailyCapMicroUsd"');
    expect(facade).toContain('"systemAutopsy.dailyCapMicroUsd"');
    expect(facade).toContain('"similarity.strictness"');
  });

  it("refuses to admit anyone without the bucket key, with a typed refusal", () => {
    expect(facade).toMatch(/keyring === null\) throw new PublicSampleSpinNotConfiguredError\(\)/);
  });
});

describe("the rollout flag is closed by default and refuses an unknown value", () => {
  it("unset, blank and 'disabled' are disabled", () => {
    expect(resolvePublicSampleSpinEnablement({})).toBe("disabled");
    expect(resolvePublicSampleSpinEnablement({ [PUBLIC_SAMPLE_SPIN_ENV]: "  " })).toBe("disabled");
    expect(resolvePublicSampleSpinEnablement({ [PUBLIC_SAMPLE_SPIN_ENV]: "disabled" })).toBe("disabled");
  });
  it("'preview' opens the route and the panel for this deployment", () => {
    expect(resolvePublicSampleSpinEnablement({ [PUBLIC_SAMPLE_SPIN_ENV]: "preview" })).toBe("preview");
  });
  it("'public' is NOT a value this slice understands — 10c owns it — and anything else refuses", () => {
    expect(() => resolvePublicSampleSpinEnablement({ [PUBLIC_SAMPLE_SPIN_ENV]: "public" })).toThrow(PublicSampleSpinEnablementError);
    expect(() => resolvePublicSampleSpinEnablement({ [PUBLIC_SAMPLE_SPIN_ENV]: "on" })).toThrow(/unknown value/);
  });
});
