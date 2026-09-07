// CLIENT entrypoint (@respin/auth/client) — the ONLY deep import app/** may
// use (default-deny lint). Client components must not touch the server root,
// which reads next/headers.
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
