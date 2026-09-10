// The landing's proof slot (REQ-H01/H02, Phase 10a plan C2). Server component:
// reads the closed rollout flag at request time and renders EITHER the real,
// metered Sample Spin (preview deployments) OR the illustrative mockup whose
// foot says plainly it is not product output. 10a keeps the mockup as the
// default; only 10c may open the public flag. An unknown flag value fails
// closed to the mockup and is logged by code, never by message.
import { respinCredits } from "@respin/credits/app-server";
import { SAMPLE_ORIGINAL, SAMPLE_SPIN_IDEA_MAX_CODE_POINTS } from "@respin/credits/app-server";
import { rethrowNextControlFlow } from "../../../lib/next-control-flow";
import { logRefusal } from "../../(product)/safe-log";
import { DemoPanel } from "../landing-sections";
import type { DemoCopy } from "../audiences";
import { SampleSpinPanel } from "./sample-spin-panel";

export function SampleSpinOrMockup({ demo }: { demo: DemoCopy }) {
  let enabled: "disabled" | "preview" = "disabled";
  try {
    enabled = respinCredits.publicSampleSpinEnablement();
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[landing.sample-spin]", err);
  }
  if (enabled !== "preview") return <DemoPanel demo={demo} />;
  return <SampleSpinPanel original={SAMPLE_ORIGINAL} maxCodePoints={SAMPLE_SPIN_IDEA_MAX_CODE_POINTS} />;
}
