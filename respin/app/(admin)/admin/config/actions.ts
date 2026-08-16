"use server";

// The config WRITE action. Two gates, not one (tenancy round-2): `requireAdmin`
// here, AND the eslint allowlist that makes `@respin/config/admin-server`
// unimportable outside `app/(admin)/**` — route gating alone is not a boundary
// for a global write.
//
// Validation happens twice on purpose: `validateConfigContent` so the operator
// gets field-level issues back, and `appendConfigVersion`'s own `.parse` so a
// caller that skipped the first one still cannot write an invalid document.
import { redirect } from "next/navigation";
import { requireAdmin } from "@respin/auth";
import {
  appendConfigVersionServer,
  validateConfigContent,
} from "@respin/config/admin-server";
import { rethrowNextControlFlow } from "../../../../lib/next-control-flow";
import type { ConfigFormState } from "./config-form-state";

export async function appendConfigAction(
  _prev: ConfigFormState,
  formData: FormData
): Promise<ConfigFormState> {
  // THE GATE, above the try. `requireAdmin()` refuses by calling `notFound()`,
  // which signals by THROWING an Error carrying
  // `digest: "NEXT_HTTP_ERROR_FALLBACK;404"` — inside the try below, a
  // non-admin POST was caught and answered "The configuration could not be
  // saved and no version was appended", naming an internal failure that never
  // happened instead of the 404 the gate asked for (billing/tenancy round-2
  // CHANGE 1). Nothing was ever bypassed — the throw still stopped the write —
  // but the page lied about why.
  const admin = await requireAdmin();
  const draft = String(formData.get("content") ?? "");
  let version: number;
  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch (err) {
      rethrowNextControlFlow(err);
      return {
        status: "error",
        message:
          "That is not valid JSON, so nothing was saved. The position of the first problem is below.",
        issues: [
          { path: "(document)", message: (err as Error).message },
        ],
        draft,
      };
    }

    const verdict = validateConfigContent(parsed);
    if (!verdict.ok) {
      return {
        status: "error",
        message:
          "The JSON parsed, but it is not a valid Respin configuration — no version was appended.",
        issues: verdict.issues,
        draft,
      };
    }

    // `admin.id` is the provenance: config_versions.created_by answers "who
    // changed the price of a credit", which is the whole point of versioning it.
    version = await appendConfigVersionServer(verdict.value, admin.id);
  } catch (err) {
    rethrowNextControlFlow(err);
    console.error("[admin-config] append failed", err);
    return {
      status: "error",
      message:
        "The configuration could not be saved and no version was appended. The details are in the server log.",
      draft,
    };
  }
  // Outside the try: `redirect` signals by throwing, and a catch around it
  // would swallow the navigation and report it as a failure.
  redirect(`/admin/config?saved=${version}`);
}
