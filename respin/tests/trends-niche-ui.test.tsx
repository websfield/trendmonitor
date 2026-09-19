import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ENTITLEMENT_TIERS } from "@respin/credits";
import {
  TrackNichePanel,
  TrackNicheStatus,
} from "../app/(product)/trends/track-niche-panel";

const action = vi.fn(async () => ({ status: "idle" as const }));
const untrackAction = vi.fn(async () => ({ status: "idle" as const }));
const tracked = [{ id: "tracked_1", niche: "home cooking" }];

function renderPanel(maxTrackedNiches: number): string {
  return renderToStaticMarkup(
    <TrackNichePanel
      tracked={tracked}
      maxTrackedNiches={maxTrackedNiches}
      action={action}
      untrackAction={untrackAction}
    />
  );
}

describe("track-niche entitlement UI", () => {
  it("replaces only the add form at an allowance of zero", () => {
    const html = renderPanel(0);
    expect(html).toContain('data-testid="niche-disabled-tier"');
    expect(html).not.toContain('id="tracked-niche"');
    expect(html).toContain("home cooking");
    expect(html).toContain("Remove");
  });

  it("renders the add form when the allowance is greater than zero", () => {
    const html = renderPanel(1);
    expect(html).toContain('id="tracked-niche"');
    expect(html).toContain("Track niche");
    expect(html).not.toContain('data-testid="niche-disabled-tier"');
  });

  it("uses the exact static tier-block sentence without any configured tier name", () => {
    const html = renderPanel(0).replaceAll("&#x27;", "'");
    const copy = "This workspace's plan does not include tracking niches. The billing page shows what this workspace is on today.";
    expect(html).toContain(`<p class="muted">${copy}</p>`);
    for (const tier of ENTITLEMENT_TIERS) {
      expect(copy.toLowerCase()).not.toContain(tier);
    }
  });

  it("keeps the pending and terminal status copy honest and addressable", () => {
    const pending = renderToStaticMarkup(
      <TrackNicheStatus pending state={{ status: "refused", code: "unknown_entitlement_tier" }} />
    );
    expect(pending).toContain("Tracking\u2026");
    expect(pending).not.toContain("niche-refused");

    const saved = renderToStaticMarkup(
      <TrackNicheStatus pending={false} state={{ status: "saved" }} />
    );
    expect(saved).toContain('data-testid="niche-saved"');
    expect(saved).toContain("Niche saved.");

    const refused = renderToStaticMarkup(
      <TrackNicheStatus pending={false} state={{ status: "refused", code: "unknown_entitlement_tier" }} />
    );
    expect(refused).toContain('data-testid="niche-refused"');
    expect(refused).toContain("Nothing was charged");
  });
});
