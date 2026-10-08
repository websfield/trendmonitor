// Creator Brain download. This handler owns delivery only: session, sanctioned
// scope, the package facade, and response headers. It never reads a table and
// never places brain content in a URL.
import { requireUser } from "@respin/auth";
import { ExportBusyError, ProfileAccessError, respinDb } from "@respin/db";
import { rethrowNextControlFlow } from "../../../lib/next-control-flow";
import { logRefusal } from "../../(product)/safe-log";
import { readScopeForUser } from "../../(product)/workspace-scope";
import { supportContact } from "../../support-contact";
import { exportFailedText } from "../../support-copy";

const JSON_FILENAME = "respin-creator-brain.json";
const MARKDOWN_FILENAME = "respin-creator-brain.md";

function responseStream(source: AsyncIterable<string>): ReadableStream<Uint8Array> {
  const iterator = source[Symbol.asyncIterator]();
  const encoder = new TextEncoder();
  let finished = false;
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          const next = await iterator.next();
          if (next.done) {
            finished = true;
            controller.close();
            return;
          }
          controller.enqueue(encoder.encode(next.value));
        } catch (error) {
          rethrowNextControlFlow(error);
          finished = true;
          controller.error(error);
        }
      },
      async cancel() {
        if (finished) return;
        finished = true;
        await iterator.return?.();
      },
    },
    // Pull only for an outstanding reader request. This keeps one encoded
    // chunk in flight and lets cancellation release the export iterator before
    // another database page is requested.
    { highWaterMark: 0 }
  );
}

export async function GET(req: Request): Promise<Response> {
  // The real session gate runs before parsing any client-provided profile or
  // format. `requireUser` redirects an expired browser session to sign-in.
  const user = await requireUser();
  const url = new URL(req.url);
  const profileId = url.searchParams.get("profile");
  const format = url.searchParams.get("format");
  if (!profileId || (format !== "json" && format !== "markdown")) {
    return new Response("Choose a creator profile and JSON or markdown.", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  try {
    // THE READ GRADE (R-163, P5-R3): "export at any time" has to hold exactly
    // when a workspace is pending deletion. Under the write grade this route
    // answered 500 there (`user has no workspace`); a read-grade scope reaches
    // `openBrainExport`, whose accessors re-check the deletion's window on
    // every page, so the export stops once erasure begins.
    const scope = await readScopeForUser(user);
    // Await preflight before constructing the Response. Profile and busy
    // refusals can therefore still carry their real HTTP status and headers.
    const source = await respinDb.openBrainExport(scope, profileId, format);
    const json = format === "json";
    return new Response(responseStream(source), {
      status: 200,
      headers: {
        "Content-Type": json
          ? "application/json; charset=utf-8"
          : "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${
          json ? JSON_FILENAME : MARKDOWN_FILENAME
        }"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[brain-export] refused", err);
    if (err instanceof ProfileAccessError) {
      // Foreign, absent and malformed ids are deliberately the same answer.
      return new Response("That creator profile is not available here.", {
        status: 404,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "private, no-store",
        },
      });
    }
    if (err instanceof ExportBusyError) {
      return new Response(
        "Another export for this workspace is already in progress. Wait for it to finish, then try again.",
        {
          status: 429,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "private, no-store",
            "Retry-After": "2",
          },
        }
      );
    }
    return new Response(
      // R-176: names the operator-set support address, or promises nothing.
      exportFailedText(supportContact()),
      {
        status: 500,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "private, no-store",
        },
      }
    );
  }
}
