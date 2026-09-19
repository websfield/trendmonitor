// Sign-up / sign-in helpers over the real UI (email + password, Better Auth) —
// no API shortcuts, so the journeys exercise the actual entry point.
import type { Page } from "@playwright/test";

export type TestIdentity = {
  name: string;
  email: string;
  password: string;
};

/** A fresh, collision-free identity for one journey run. */
export function freshIdentity(label: string): TestIdentity {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  return {
    name: `${label} ${stamp}`,
    email: `e2e.${label}.${stamp}@example.test`,
    password: "correct horse battery staple 9",
  };
}

/** Fills and submits the sign-up form, landing on /onboarding (the app's own redirect). */
export async function signUp(page: Page, identity: TestIdentity): Promise<void> {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill(identity.name);
  await page.getByLabel("Email").fill(identity.email);
  await page.getByLabel("Password").fill(identity.password);
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.waitForURL("**/onboarding", { timeout: 30_000 });
}

export async function signIn(
  page: Page,
  identity: Pick<TestIdentity, "email" | "password">
): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(identity.email);
  await page.getByLabel("Password").fill(identity.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/studio", { timeout: 30_000 });
}

/** Signs out via the shell rail control; the app redirects to the marketing page. */
export async function signOut(page: Page): Promise<void> {
  await page.getByRole("button", { name: /sign out/i }).click();
  await page.waitForURL("http://localhost:8000/", { timeout: 60_000 });
}
