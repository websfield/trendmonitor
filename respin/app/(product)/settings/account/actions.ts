"use server";

// Owner-facing deletion actions (plan C2). Thin: gate → reauth → scope → the
// packaged operation → redirect. Every rule — owner-only, typed-name
// confirmation, last-owner refusal, journal-before-acknowledge — lives in
// @respin/db and was gated in Tasks 3–5. The failure channel is the URL, as in
// ../billing/actions.ts: a refusal redirects with a CODE and the page owns
// the words.
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import {
  reauthenticateCurrentSessionWithPassword,
  requireUser,
  resendMailPortFromEnv,
} from "@respin/auth";
import { respinDb } from "@respin/db";
import { rethrowNextControlFlow } from "../../../../lib/next-control-flow";
import { recoverDeletionUrl } from "../../../../lib/routes";
import { logRefusal } from "../../safe-log";

const ACCOUNT_PATH = "/settings/account";

export type AccountErrorCode =
  | "reauthentication"
  | "journal_unavailable"
  | "mail_unavailable"
  | "typed_name"
  | "not_owner"
  | "last_owner"
  | "not_cancellable"
  | "unknown";

function codeOf(err: unknown): AccountErrorCode {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code !== "string") return "unknown";
  if (code.startsWith("journal_")) return "journal_unavailable";
  if (code === "typed_name_mismatch") return "typed_name";
  if (code === "not_owner" || code === "owner_required") return "not_owner";
  if (code === "last_owner") return "last_owner";
  if (code.startsWith("invalid_transition") || code === "erasure_started") return "not_cancellable";
  return "unknown";
}

function fail(err: unknown): never {
  logRefusal("[account-action] refused", err);
  redirect(`${ACCOUNT_PATH}?e=${encodeURIComponent(codeOf(err))}`);
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
