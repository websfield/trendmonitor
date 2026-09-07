// Waits for a generation control's terminal state — usable draft, honest
// refusal, or an operational refusal — shared by /studio and
// /onboarding/first-ideas, both of which render `GenerationOutcome`. Real
// Anthropic calls can take up to ~60s (see the task brief), so this polls
// generously rather than assuming a fixed delay.
import type { Page } from "@playwright/test";

const TERMINAL_SELECTOR =
  '[data-testid="studio-result"], [data-testid="studio-honest-refusal"], [data-testid="studio-refusal"], [data-testid="studio-replayed"]';

export type GenerationOutcomeKind =
  | "usable"
  | "honest_refusal"
  | "refusal"
  | "replayed"
  | "timed_out";

export async function waitForGenerationOutcome(
  page: Page,
  timeoutMs = 90_000
): Promise<GenerationOutcomeKind> {
  try {
    const locator = page.locator(TERMINAL_SELECTOR).first();
    await locator.waitFor({ state: "visible", timeout: timeoutMs });
    const testId = await locator.getAttribute("data-testid");
    if (testId === "studio-result") return "usable";
    if (testId === "studio-honest-refusal") return "honest_refusal";
    if (testId === "studio-replayed") return "replayed";
    return "refusal";
  } catch {
    return "timed_out";
  }
}
