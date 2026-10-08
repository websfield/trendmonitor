// R-166 (gate security Low): after a successful identity cancellation the
// status receipt travels in a short-lived, page-scoped, HttpOnly cookie — never
// in the redirect URL — and the page reads it from that cookie only.
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  beginRecovery: vi.fn(),
  createProof: vi.fn(),
  cancelIdentityDeletion: vi.fn(),
  readIdentityCancellationStatus: vi.fn(),
  cookieValue: undefined as string | undefined,
}));

vi.mock("@respin/auth", () => ({
  beginIdentityCancellationRecoverySession: mocks.beginRecovery,
  createIdentityCancellationProofWithPassword: mocks.createProof,
}));
vi.mock("@respin/db", () => ({
  respinDb: {
    cancelIdentityDeletion: mocks.cancelIdentityDeletion,
    readIdentityCancellationStatus: mocks.readIdentityCancellationStatus,
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "respin_recovery_receipt" && mocks.cookieValue !== undefined
        ? { name, value: mocks.cookieValue }
        : undefined,
  }),
}));

import { POST } from "../app/api/deletion/recover/route";
import RecoverDeletionPage from "../app/(auth)/recover-deletion/page";
import { RECOVERY_RECEIPT_COOKIE } from "../lib/routes";

const OP = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const RECEIPT = "R".repeat(43);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookieValue = undefined;
  mocks.beginRecovery.mockResolvedValue({ recoverySession: "rs", expiresAt: new Date() });
  mocks.createProof.mockResolvedValue({ proofId: "p", cancellationReceipt: "cr" });
  mocks.cancelIdentityDeletion.mockResolvedValue({ cancellationReceipt: RECEIPT });
  mocks.readIdentityCancellationStatus.mockResolvedValue({ restoredMembershipIds: ["m1", "m2"], conflicts: [] });
});

describe("the identity-cancellation receipt", () => {
  it("rides a page-scoped HttpOnly SameSite=Strict cookie that expires with the receipt, and is NOT in the Location", async () => {
    const body = new URLSearchParams({ op: OP, s: "S".repeat(43), password: "pw" });
    const response = await POST(
      new Request("https://app.example/api/deletion/recover", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      })
    );
    expect(response.status).toBe(303);
    const location = response.headers.get("Location")!;
    expect(location).toBe(`/recover-deletion?done=1&op=${OP}`);
    expect(location).not.toContain(RECEIPT);
    const cookie = response.headers.get("Set-Cookie")!;
    expect(cookie.split("; ")).toEqual(
      expect.arrayContaining([
        `${RECOVERY_RECEIPT_COOKIE}=${RECEIPT}`,
        "Path=/recover-deletion",
        "Max-Age=600",
        "HttpOnly",
        "SameSite=Strict",
      ])
    );
  });

  it("the page reads the receipt from the cookie, and ignores an `r` in the URL", async () => {
    mocks.cookieValue = RECEIPT;
    const html = renderToStaticMarkup(
      await RecoverDeletionPage({ searchParams: Promise.resolve({ done: "1", op: OP, r: "U".repeat(43) }) })
    );
    expect(mocks.readIdentityCancellationStatus).toHaveBeenCalledWith(OP, RECEIPT);
    expect(html).toContain("2 membership(s) restored");
  });

  it("with no cookie, the page renders the plain cancelled line and reads nothing", async () => {
    const html = renderToStaticMarkup(
      await RecoverDeletionPage({ searchParams: Promise.resolve({ done: "1", op: OP, r: RECEIPT }) })
    );
    expect(mocks.readIdentityCancellationStatus).not.toHaveBeenCalled();
    expect(html).toContain("Deletion cancelled.");
    expect(html).not.toContain("membership(s) restored");
  });
});
