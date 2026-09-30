import { isGoogleConfigured } from "@respin/auth";
import { isPlanKey } from "../../(marketing)/pricing-copy";
import { AuthForm } from "../auth-form";

/**
 * The plan a pricing CTA carried, or null.
 *
 * WHY THIS READS A PARAM AT ALL (audit 2026-09-19 D5, remediation P6-R4).
 * "Start Creator", "Start Pro" and "Start Studio" all rendered a bare
 * `/sign-up` and this page read no search params, so a button labelled with a
 * purchase performed a free signup and the choice vanished with no trace and
 * no message. This does not start a subscription — signup creates a Free
 * workspace as it always has — it stops the choice being dropped SILENTLY, by
 * carrying it to the one screen where the person can act on it.
 *
 * VALIDATED, NEVER ECHOED. Anything that is not one of `PLAN_KEYS` becomes
 * null: the value reaches a rendered sentence, so an unvalidated param would
 * be reflected content.
 */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const raw = params?.plan;
  // A REPEATED PARAM IS AMBIGUOUS, SO IT IS REFUSED rather than resolved to
  // its first value. `?plan=creator&plan=pro` arrives as an array and names
  // two plans; picking one would tell the person they chose something they
  // may not have. Silence is the honest answer to an ambiguous input, and
  // `free` is silent too — there is nothing to tell someone who picked the
  // plan they are about to get.
  const plan = !Array.isArray(raw) && isPlanKey(raw) && raw !== "free" ? raw : null;
  return (
    <AuthForm
      mode="sign-up"
      googleEnabled={isGoogleConfigured()}
      plan={plan}
    />
  );
}
