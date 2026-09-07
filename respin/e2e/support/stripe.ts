// Fills Stripe's hosted TEST-MODE checkout page with Stripe's documented test
// card. Only ever called after the caller has verified STRIPE_SECRET_KEY is a
// sk_test_ key — see each spec's own guard before importing this.
import type { Page } from "@playwright/test";

export const STRIPE_TEST_CARD = {
  number: "4242424242424242",
  expiry: "12/34",
  cvc: "123",
};

/**
 * Completes a Stripe Checkout session already open in `page` (the app's
 * "Subscribe" / "Buy" action redirects here). Tries several selector shapes
 * because Stripe's own hosted page markup is outside this repo's control.
 */
export async function completeStripeTestCheckout(
  page: Page,
  opts: { email?: string } = {}
): Promise<void> {
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  await page.waitForLoadState("domcontentloaded");

  if (opts.email) {
    const email = page.locator("#email, input[name='email']").first();
    if (await email.count()) {
      await email.fill(opts.email);
    }
  }

  const cardNumber = page
    .locator("#cardNumber, input[name='cardnumber'], input[autocomplete='cc-number']")
    .first();
  await cardNumber.waitFor({ state: "visible", timeout: 30_000 });
  await cardNumber.fill(STRIPE_TEST_CARD.number);

  const expiry = page
    .locator("#cardExpiry, input[name='exp-date'], input[autocomplete='cc-exp']")
    .first();
  await expiry.fill(STRIPE_TEST_CARD.expiry);

  const cvc = page
    .locator("#cardCvc, input[name='cvc'], input[autocomplete='cc-csc']")
    .first();
  await cvc.fill(STRIPE_TEST_CARD.cvc);

  const name = page
    .locator("#billingName, input[name='billingName'], input[autocomplete='cc-name']")
    .first();
  if (await name.count()) {
    await name.fill("Respin E2E");
  }

  const country = page.locator("#billingCountry, select[name='country']").first();
  if (await country.count()) {
    // Pinned to US (not "leave the default"): the default is geo-detected
    // from the test runner's IP, and a non-US default drags in a REQUIRED
    // phone field in a country-specific shape the fixed number below does
    // not match, which blocks submission with a silent "Processing" hang.
    await country.selectOption("US");
  }

  // Some Stripe accounts collect a phone number at checkout (Link). It only
  // appears after the country above resolves, and is required when present.
  const phone = page.getByRole("textbox", { name: /phone number/i }).first();
  if (await phone.count()) {
    await phone.fill("4155552671");
  }

  // Pinning the country to US (above) pulls in a required ZIP field for the
  // US address shape.
  const zip = page.getByRole("textbox", { name: /zip/i }).first();
  if (await zip.count()) {
    await zip.fill("94103");
  }

  const submit = page
    .getByRole("button", { name: /subscribe|pay|start trial/i })
    .first();
  await submit.click();

  // Checkout redirects back to the app's success_url (this repo sends /usage).
  await page.waitForURL((url) => !url.hostname.includes("stripe.com"), {
    timeout: 60_000,
  });
}
