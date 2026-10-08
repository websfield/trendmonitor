"use server";

// Owner-facing deletion actions (plan C2) and the billing-contact handover
// (plan C3). Thin: gate → reauth → scope → the packaged operation → redirect.
// Every rule — owner-only, typed-name confirmation, last-owner and
// billing-contact refusals, journal-before-acknowledge, provider-first
// handover — lives in @respin/db and @respin/credits and was gated there. The
// failure channel is the URL, as in ../billing/actions.ts: a refusal redirects
// with a CODE and the page owns the words.
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import {
  reauthenticateCurrentSessionWithPassword,
  requireUser,
  resendMailPortFromEnv,
} from "@respin/auth";
import { respinCredits } from "@respin/credits/app-server";
import { respinDb } from "@respin/db";
import { rethrowNextControlFlow } from "../../../../lib/next-control-flow";
import { recoverDeletionUrl } from "../../../../lib/routes";
import { logRefusal } from "../../safe-log";
import { accountErrorCodeOf } from "./refusal-code";

const ACCOUNT_PATH = "/settings/account";

function fail(err: unknown): never {
  logRefusal("[account-action] refused", err);
  redirect(`${ACCOUNT_PATH}?e=${encodeURIComponent(accountErrorCodeOf(err))}`);
}

async function reauth(formData: FormData) {
  try {
    return await reauthenticateCurrentSessionWithPassword(String(formData.get("password") ?? ""));
  } catch (err) {
    rethrowNextControlFlow(err);
    redirect(`${ACCOUNT_PATH}?e=reauthentication`);
  }
}

export async function requestWorkspaceDeletionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  try {
    const scope = await respinDb.withWorkspace({ authUserId: user.id });
    const authority = await reauth(formData);
    await respinDb.requestWorkspaceDeletion(scope, {
      sessionId: authority.sessionId,
      idempotencyKey: String(formData.get("idempotencyKey") || randomUUID()),
      typedName: String(formData.get("typedName") ?? ""),
    });
  } catch (err) {
    rethrowNextControlFlow(err);
    fail(err);
  }
  redirect(`${ACCOUNT_PATH}?ok=workspace_requested`);
}

/**
 * Cancel a profile or workspace deletion. ANY active owner of the target
 * workspace may (R-162): the package checks owner membership itself against
 * the reauthenticated session, and takes no scope — the workspace is
 * tombstoned, so no write-grade scope exists to hand it. Money Stripe
 * collected while the workspace was tombstoned is replayed by the worker's
 * deletion tick once the workspace is active again (R-165).
 */
export async function cancelScopedDeletionAction(formData: FormData): Promise<void> {
  await requireUser();
  try {
    const authority = await reauth(formData);
    await respinDb.cancelScopedDeletion(String(formData.get("operationId") ?? ""), {
      sessionId: authority.sessionId,
    });
  } catch (err) {
    rethrowNextControlFlow(err);
    fail(err);
  }
  redirect(`${ACCOUNT_PATH}?ok=cancelled`);
}

export async function requestIdentityDeletionAction(formData: FormData): Promise<void> {
  await requireUser();
  try {
    const mailPort = resendMailPortFromEnv(process.env);
    if (!mailPort) redirect(`${ACCOUNT_PATH}?e=mail_unavailable`);
    const authority = await reauth(formData);
    const base = (process.env.BETTER_AUTH_URL ?? "").replace(/\/+$/, "");
    await respinDb.requestIdentityDeletion(
      {
        sessionId: authority.sessionId,
        idempotencyKey: String(formData.get("idempotencyKey") || randomUUID()),
      },
      {
        port: mailPort,
        actionUrl: (operationId, secret) =>
          recoverDeletionUrl(base, operationId, secret),
      },
    );
  } catch (err) {
    rethrowNextControlFlow(err);
    fail(err);
  }
  redirect(`${ACCOUNT_PATH}?ok=identity_requested`);
}

/**
 * Plan C3: the calling owner becomes the workspace's billing contact. The
 * package rewrites the provider's customer record with this owner's email
 * FIRST and moves the binding only once the provider confirms.
 */
export async function acceptBillingContactAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  try {
    const scope = await respinDb.withWorkspace({ authUserId: user.id });
    const authority = await reauth(formData);
    await respinCredits.acceptBillingContact(scope, user.email, authority);
  } catch (err) {
    rethrowNextControlFlow(err);
    fail(err);
  }
  redirect(`${ACCOUNT_PATH}?ok=billing_contact_accepted`);
}
