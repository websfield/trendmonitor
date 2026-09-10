// Phase 10a plan C5 / G-15: what the Next.js instrumentation hooks consume.
// `onRequestError` is handed the request (path, method, headers) and a
// context; the ONLY field it may read is the route pattern. The request is a
// Proxy that throws on any property access, so reading it is a red test.
import { describe, expect, it, vi } from "vitest";

const captureError = vi.fn(async () => "sent" as const);
vi.mock("../lib/telemetry", () => ({ telemetry: () => ({ captureError, enabled: true, eventFor: vi.fn() }) }));
const preflight = vi.fn(() => ({ checks: ["brain_content_registry"], ok: true }));
vi.mock("@respin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@respin/db")>()),
  runStartupPreflight: () => preflight(),
}));

describe("instrumentation.ts", () => {
  it("onRequestError forwards the route PATTERN and never touches the request", async () => {
    const { onRequestError } = await import("../instrumentation");
    const request = new Proxy({}, {
      get(_target, property) {
        throw new Error(`instrumentation read request.${String(property)} — headers, path or method would carry content`);
      },
    });
    const error = new Error("boom with secret=abc");
    const before = process.env.NEXT_RUNTIME;
    try {
      process.env.NEXT_RUNTIME = "nodejs";
      await onRequestError(error, request, { routePath: "/api/demo", routerKind: "App Router", routeType: "route" } as never);
      expect(captureError).toHaveBeenCalledWith(error, { route: "/api/demo" });
      // The edge runtime neither loads the driver nor forwards anything.
      process.env.NEXT_RUNTIME = "edge";
      await onRequestError(error, request, { routePath: "/api/demo" } as never);
      expect(captureError).toHaveBeenCalledTimes(1);
    } finally {
      if (before === undefined) delete process.env.NEXT_RUNTIME;
      else process.env.NEXT_RUNTIME = before;
    }
  });

  it("register() runs the startup preflight on the Node runtime and nowhere else", async () => {
    const { register } = await import("../instrumentation");
    const before = process.env.NEXT_RUNTIME;
    try {
      process.env.NEXT_RUNTIME = "edge";
      await register();
      expect(preflight).not.toHaveBeenCalled();
      process.env.NEXT_RUNTIME = "nodejs";
      await register();
      expect(preflight).toHaveBeenCalledTimes(1);
    } finally {
      if (before === undefined) delete process.env.NEXT_RUNTIME;
      else process.env.NEXT_RUNTIME = before;
    }
  });
});
