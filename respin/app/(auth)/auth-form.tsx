"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@respin/auth/client";

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
      <form onSubmit={submit} style={{ display: "grid", gap: "0.5rem" }}>
        {isSignUp && (
          <input
            aria-label="Name"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        )}
        <input
          aria-label="Email"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          aria-label="Password"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
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
