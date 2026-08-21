"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@respin/auth/client";

/**
 * The password minimum, stated ONCE and used twice — as the input's own
 * `minLength` and as the sentence the user reads (audit 2026-08-17 #15). Two
 * copies of a rule is how a form ends up enforcing 8 while promising 6.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_RULE = `At least ${PASSWORD_MIN_LENGTH} characters.`;

const field: React.CSSProperties = { display: "grid", gap: "0.25rem" };
const hint: React.CSSProperties = {
  color: "#555",
  fontSize: "0.85rem",
  margin: 0,
};

export function AuthForm({
  mode,
  googleEnabled,
}: {
  mode: "sign-in" | "sign-up";
  googleEnabled: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isSignUp = mode === "sign-up";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = isSignUp
      ? await authClient.signUp.email({ name, email, password })
      : await authClient.signIn.email({ email, password });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? "Something went wrong — try again.");
      return;
    }
    router.push("/studio");
  }

  return (
    <div style={{ width: 320, display: "grid", gap: "0.75rem" }}>
      <h1>{isSignUp ? "Create your account" : "Sign in"}</h1>
      {/* VISIBLE LABELS, not placeholders (audit 2026-08-17 #15, WCAG 3.3.2
          Level A) — and this is the product's ONLY entry point, so it is the
          one form nobody can route around.

          A placeholder is not a label: it disappears the moment the field has
          content, so a user who tabs back to check what they typed, or who
          relies on a screen reader announcing the field on focus after
          autofill, has nothing left. `aria-label` alone covered the screen
          reader and left every sighted user — including anyone with a memory or
          attention impairment, which is who 3.3.2 is written for — staring at
          three unlabelled boxes.

          The 8-character password minimum was ENFORCED (minLength below, and
          Better Auth server-side) but never SHOWN: the first a user learned of
          it was a rejection. It is stated up front now, and tied to the input
          with `aria-describedby` so it is announced with the field rather than
          sitting nearby in the visual order only. */}
      <form onSubmit={submit} style={{ display: "grid", gap: "0.5rem" }}>
        {isSignUp && (
          <div style={field}>
            <label htmlFor="auth-name">Name</label>
            <input
              id="auth-name"
              name="name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
        )}
        <div style={field}>
          <label htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div style={field}>
          <label htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            name="password"
            type="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={PASSWORD_MIN_LENGTH}
            aria-describedby="auth-password-rule"
            required
          />
          <p id="auth-password-rule" style={hint}>
            {PASSWORD_RULE}
          </p>
        </div>
        <button type="submit" disabled={busy}>
          {busy ? "Working…" : isSignUp ? "Sign up" : "Sign in"}
        </button>
      </form>
      {googleEnabled && (
        <button
          type="button"
          disabled={busy}
          onClick={() => authClient.signIn.social({ provider: "google", callbackURL: "/studio" })}
        >
          Continue with Google
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      <p>
        {isSignUp ? (
          <a href="/sign-in">Already have an account? Sign in</a>
        ) : (
          <a href="/sign-up">New here? Create an account</a>
        )}
      </p>
    </div>
  );
}
