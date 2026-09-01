// Bootstrap-then-scope, for pages that a BRAND NEW creator can land on first.
//
// FOUND BY WALKING IT, not by reading it. The very first `/onboarding` load
// after signing up rendered "This workspace is not available", with the server
// log reading `withWorkspace: unknown user — bootstrap has not run for this
// identity` — while the layout one element up rendered the workspace's name
// correctly on the same request.
//
// The cause is render ordering, and it is structural rather than a mistake in
// either file. `app/(product)/layout.tsx` runs the lazy idempotent bootstrap
// (R-16b), and a Next App Router layout and the page beneath it are rendered
// CONCURRENTLY — so on the one request where the `users` row does not exist
// yet, the page's `withWorkspace` can read before the layout's
// `ensureUserWorkspace` has committed. The layout is not a gate for the same
// reason `gate-completeness.test.ts` says it is not an auth gate: a page cannot
// borrow a guarantee from a sibling render.
//
// The fix is to ask for the bootstrap HERE, before scoping. It is safe to call
// twice — `ensureUserWorkspace` is idempotent by construction and by test
// (AC-2: two sequential calls yield exactly one workspace, and a concurrent
// conflict resolves rather than duplicating) — so this adds a round trip on
// every render and removes a broken first impression for every new creator.
// The bootstrap-safe authority is required anywhere a brand-new creator can
// land directly. `/onboarding`, `/usage`, and `/settings/billing` all route
// through this function; focused first-login tests keep that list honest.
import { respinDb } from "@respin/db";

/**
 * Resolve the caller's workspace scope, ensuring the workspace exists first.
 *
 * Throws exactly what `withWorkspace` throws — `WorkspaceAccessError` for a
 * user in more than one workspace — so the caller's refusal path is unchanged.
 */
export async function scopeForUser(user: {
  id: string;
  name?: string | null;
}): Promise<Awaited<ReturnType<typeof respinDb.withWorkspace>>> {
  await respinDb.ensureUserWorkspace({
    authUserId: user.id,
    name: user.name || undefined,
  });
  return respinDb.withWorkspace({ authUserId: user.id });
}
