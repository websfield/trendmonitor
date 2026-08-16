// /admin/config — the versioned runtime config editor (REQ-G05/J01 slice, B5).
// Per-page requireAdmin (client-nav caches layouts — gate-completeness test);
// the config WRITE surface is additionally import-restricted to app/(admin)/**.
import { requireAdmin } from "@respin/auth";
import { getActiveConfigServer } from "@respin/config/app-server";
import { listConfigVersionsServer } from "@respin/config/admin-server";
import { rethrowNextControlFlow } from "../../../../lib/next-control-flow";
import { ConfigEditor, ConfigHistory } from "./config-view";
import type { ConfigEditorFormProps } from "./config-view";
import { appendConfigAction } from "./actions";
import { NO_ACTIVE_CONFIG_COPY, resolveSavedVersion } from "./config-form-state";

export default async function AdminConfigPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const search = await props.searchParams;

  let active: ConfigEditorFormProps["active"];
  try {
    const cfg = await getActiveConfigServer();
    active = {
      ok: true,
      version: cfg.version,
      json: JSON.stringify(cfg.content, null, 2),
    };
  } catch (err) {
    rethrowNextControlFlow(err);
    // Fail closed and SAY THE REMEDY: an empty config_versions table is the
    // ordinary state of a fresh install, and the operator's way forward is one
    // command. A crash here would make the page that fixes the problem the
    // page that cannot load.
    console.error("[admin-config] active config unavailable", err);
    active = { ok: false, ...NO_ACTIVE_CONFIG_COPY };
  }

  // Cross-checked against the ACTIVE version, never trusted from the URL.
  const savedVersion = resolveSavedVersion(
    search.saved,
    active.ok ? active.version : null
  );

  // History is best-effort: it is provenance, not a control, and it must not
  // be able to take the editor down with it.
  let history: Awaited<ReturnType<typeof listConfigVersionsServer>> = [];
  try {
    history = await listConfigVersionsServer(20);
  } catch (err) {
    rethrowNextControlFlow(err);
    console.error("[admin-config] version history unavailable", err);
  }

  return (
    <section>
      <h1>Runtime configuration</h1>
      <p style={{ color: "#555", fontSize: "0.9rem" }}>
        Credit costs, tier allowances, the credit-pack price, the payment-grace
        window, the pause bounds and the Stripe price map. Every save appends a
        new version; the newest version is the active one and nothing is ever
        edited in place.
      </p>
      <ConfigEditor
        active={active}
        action={appendConfigAction}
        savedVersion={savedVersion}
      />
      <ConfigHistory rows={history} />
    </section>
  );
}
