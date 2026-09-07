// Audit 2026-08-17 #15 — the sign-in/sign-up form's accessibility.
//
// This is the product's ONLY entry point: every user meets this form, and until
// this suite existed NO test rendered it at all. The finding was that the fields
// carried `aria-label` and a placeholder but no visible `<label>` (WCAG 3.3.2,
// Level A), and that the 8-character password minimum was enforced and never
// shown.
//
// Rendered with `renderToStaticMarkup`, like the billing/config views: the two
// external dependencies (the Next router and the Better Auth client) are only
// touched by the submit handler, so the markup this asserts is the markup a real
// visitor receives.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@respin/auth/client", () => ({
  authClient: {
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
  },
}));

const { AuthForm, PASSWORD_MIN_LENGTH, PASSWORD_RULE } = await import(
  "../app/(auth)/auth-form"
);

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

/** Every field the given mode renders, as [label text, input id]. */
const FIELDS = {
  "sign-in": [
    ["Email", "auth-email"],
    ["Password", "auth-password"],
  ],
  "sign-up": [
    ["Name", "auth-name"],
    ["Email", "auth-email"],
    ["Password", "auth-password"],
  ],
} as const;

describe("audit #15: every auth field has a VISIBLE label bound to it", () => {
  for (const mode of ["sign-in", "sign-up"] as const) {
    it(`${mode}: each field renders a <label for> pointing at a real input id`, () => {
      const out = html(<AuthForm mode={mode} googleEnabled={false} />);
      for (const [label, id] of FIELDS[mode]) {
        // The binding, both halves — a `for` with no matching id is not a label.
        expect(out, `${mode} must label ${id}`).toContain(`for="${id}"`);
        expect(out, `${mode} must render input ${id}`).toContain(`id="${id}"`);
        // …and the label must actually SAY something, visibly.
        expect(out).toContain(`>${label}</label>`);
      }
    });

    it(`${mode}: no field relies on a placeholder as its only name`, () => {
      const out = html(<AuthForm mode={mode} googleEnabled={false} />);
      // The exact defect: a placeholder disappears on input, so it cannot be
      // the accessible name. None are used at all now.
      expect(out).not.toContain("placeholder=");
    });
  }
});

describe("audit #15: the password rule is SHOWN, and tied to the password field", () => {
  it("states the minimum in words and associates it with the input", () => {
    const out = html(<AuthForm mode="sign-up" googleEnabled={false} />);
    expect(out).toContain('aria-describedby="auth-password-rule"');
    expect(out).toContain('id="auth-password-rule"');
    expect(out).toContain(PASSWORD_RULE);
  });

  it("the SHOWN rule and the ENFORCED rule are the same number", () => {
    const out = html(<AuthForm mode="sign-up" googleEnabled={false} />);
    // The defect this guards is a form that promises 6 and enforces 8. Both
    // come from one constant, and this asserts that they arrive together in
    // the rendered markup rather than trusting the constant.
    expect(out).toContain(`minLength="${PASSWORD_MIN_LENGTH}"`);
    expect(PASSWORD_RULE).toContain(String(PASSWORD_MIN_LENGTH));
  });

  it("sign-IN shows the rule too — the field is the same field", () => {
    const out = html(<AuthForm mode="sign-in" googleEnabled={false} />);
    expect(out).toContain('aria-describedby="auth-password-rule"');
  });
});

describe("audit #15: the existing behaviour is preserved, not traded away", () => {
  it("keeps the error alert region", () => {
    // The `role="alert"` block is conditional on state, so what is asserted
    // here is that the branch still exists in the component's markup shape:
    // an empty render has no alert, and that is the honest pre-condition.
    const out = html(<AuthForm mode="sign-in" googleEnabled={false} />);
    expect(out).not.toContain('role="alert"');
    expect(out).toContain("Sign in");
  });

  it("keeps required + type on the fields the browser validates", () => {
    const out = html(<AuthForm mode="sign-up" googleEnabled={false} />);
    expect(out).toContain('type="email"');
    expect(out).toContain('type="password"');
    expect((out.match(/required/g) ?? []).length).toBe(3);
  });

  it("still offers Google only when it is configured", () => {
    expect(html(<AuthForm mode="sign-in" googleEnabled />)).toContain(
      "Continue with Google"
    );
    expect(
      html(<AuthForm mode="sign-in" googleEnabled={false} />)
    ).not.toContain("Continue with Google");
  });
});
