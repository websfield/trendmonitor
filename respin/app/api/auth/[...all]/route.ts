// Better Auth's endpoint. The auth instance never leaves @respin/auth —
// this route re-exports its pre-built handlers (sanctioned surface).
import { authHandlers } from "@respin/auth";

export const GET = authHandlers.GET;
export const POST = authHandlers.POST;
