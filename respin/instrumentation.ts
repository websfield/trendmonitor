// Next.js instrumentation (stable on the installed next@15.5.x; no config
// flag). Two jobs, both Phase 10a plan C5:
//
//  1. `register()` runs the STARTUP PREFLIGHT once per server process (G-15):
//     the brain-content registry guard that used to throw at module load —
//     and took every Stripe webhook delivery down with it — now refuses HERE,
//     before traffic, with a stable code. There is no escape hatch.
//  2. `onRequestError` forwards an ALLOWLISTED event to the collector: the
//     refusal code, the error class, the driver SQLSTATE and the route
//     PATTERN. The request object Next.js hands over — path, method, headers —
//     is deliberately not read: `tests/instrumentation.test.ts` pins that the
//     only context field consumed is `routePath`.
//
// DYNAMIC IMPORTS, DELIBERATELY. Next.js bundles this file for the edge
// runtime as well as Node, and a static import of `@respin/db` pulls the
// Postgres driver (`fs`, `path`, `net`) into the edge bundle, where it cannot
// resolve — `next build` failed on exactly that (entry gate #4). Both imports
// therefore happen inside the Node-only branches.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const node = await import("./instrumentation-node");
    node.preflight();
  }
}

export async function onRequestError(
  err: unknown,
  _request: unknown,
  context: Readonly<{ routePath?: string }>,
): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const node = await import("./instrumentation-node");
    await node.captureRequestError(err, context.routePath);
  }
}
