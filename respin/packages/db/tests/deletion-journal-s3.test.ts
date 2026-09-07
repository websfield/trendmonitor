// Phase 10b-1 Task 5.2 — the AWS SDK adapter, which round 1 found had no test
// at all (security H2).
//
// The gap mattered: `classifyS3Error`'s own docblock says it "decides whether
// an irreversible erasure may proceed", and nothing had ever run it. The two
// worst defects in this task both lived here, and both were invisible because
// the suite only ever exercised the in-memory fake — a *different*
// implementation of the same interfaces, which agreed with the store because
// they were written together.
//
// So this file drives the real adapter over a stubbed `S3Client.send`,
// asserting the exact command input it builds and the exact outcome it derives.
// No network, no credential, no bucket.
import { describe, expect, it, vi } from "vitest";

import {
  classifyS3Error,
  createS3JournalClient,
  s3JournalPurger,
  s3JournalVerifier,
  s3JournalWriter,
} from "../src/deletion-journal-s3";

type SentCommand = { constructor: { name: string }; input: Record<string, unknown> };

function stubClient(handler: (command: SentCommand) => unknown) {
  const sent: SentCommand[] = [];
  const client = {
    send: vi.fn(async (command: SentCommand) => {
      sent.push(command);
      const result = handler(command);
      if (result instanceof Error) throw result;
      return result;
    }),
  };
  return { client: client as never, sent };
}

function awsError(name: string, httpStatusCode?: number): Error {
  const error = new Error(name);
  error.name = name;
  if (httpStatusCode !== undefined) {
    (error as unknown as { $metadata: { httpStatusCode: number } }).$metadata = { httpStatusCode };
  }
  return error;
}

const RETAIN_UNTIL = new Date("2026-09-29T00:00:00.000Z");

const putRequest = {
  bucket: "respin-journal",
  key: "prod/deletion-journal/op-1/000001.json",
  body: '{"schemaVersion":1}',
  contentType: "application/json" as const,
  checksumSha256: "Zm9vYmFy",
  serverSideEncryption: "AES256" as const,
  objectLockMode: "COMPLIANCE" as const,
  objectLockRetainUntil: RETAIN_UNTIL,
  ifNoneMatch: "*" as const,
};

describe("classifyS3Error — the honesty boundary for irreversible work", () => {
  // Each row is a real failure an operator will eventually see. The property
  // under test is that ambiguity NEVER becomes a definitive answer.
  const cases: readonly [string, Error, "precondition" | "refused" | "unknown"][] = [
    ["412 PreconditionFailed by name", awsError("PreconditionFailed"), "precondition"],
    ["412 by status alone", awsError("SomeOtherName", 412), "precondition"],
    ["409 ConditionalRequestConflict", awsError("ConditionalRequestConflict", 409), "unknown"],
    ["409 by status alone", awsError("Whatever", 409), "unknown"],
    ["500 InternalError", awsError("InternalError", 500), "unknown"],
    ["503 SlowDown", awsError("SlowDown", 503), "unknown"],
    ["a client-side timeout", awsError("TimeoutError"), "unknown"],
    ["an abort", awsError("AbortError"), "unknown"],
    ["a socket failure", awsError("NetworkingError"), "unknown"],
    ["403 AccessDenied", awsError("AccessDenied", 403), "refused"],
    ["400 BadDigest", awsError("BadDigest", 400), "refused"],
    ["404 NoSuchBucket", awsError("NoSuchBucket", 404), "refused"],
    ["an error with no status at all", new Error("boom"), "unknown"],
  ];

  for (const [label, error, kind] of cases) {
    it(`maps ${label} to ${kind}`, () => {
      expect(classifyS3Error(error).kind).toBe(kind);
    });
  }

  it("never maps an unrecognised failure to a definitive answer", () => {
    // The direction that matters: an unknown forces reconciliation, a refusal
    // is read as "this will never work", and guessing the second is how an
    // erasure proceeds on a journal write that actually landed.
    for (const odd of [null, undefined, "a string", 42, {}, { name: "" }]) {
      expect(classifyS3Error(odd).kind).toBe("unknown");
    }
  });
});

describe("createS3JournalClient", () => {
  it("refuses a plaintext endpoint that is not loopback", () => {
    for (const endpoint of [
      "http://s3.example.com",
      "http://s3.amazonaws.com",
      "http://localhost@evil.com",
      "http://127.0.0.1.evil.com",
    ]) {
      expect(() => createS3JournalClient({ region: "eu-west-2", endpoint }), endpoint).toThrow(
        /refuses plaintext transport/
      );
    }
  });

  it("allows https anywhere and http only on real loopback", () => {
    expect(() => createS3JournalClient({ region: "eu-west-2", endpoint: "https://s3.example.com" })).not.toThrow();
    for (const endpoint of ["http://localhost:9000", "http://127.0.0.1:9000", "http://[::1]:9000"]) {
      expect(() => createS3JournalClient({ region: "eu-west-2", endpoint }), endpoint).not.toThrow();
    }
  });

  it("defaults to a SINGLE attempt so a retried PUT cannot become a false conflict", async () => {
    // Round-1 billing CHANGE 2. With the SDK's default retry, a PUT whose 200
    // was lost is re-sent, S3 answers 412 against our OWN object, and the
    // adapter reports a definitive conflict for a write that succeeded.
    const client = createS3JournalClient({ region: "eu-west-2" });
    expect(await client.config.maxAttempts()).toBe(1);
  });
});

describe("s3JournalWriter", () => {
  it("sends every header R-124 requires, with the wire checksum", async () => {
    const { client, sent } = stubClient(() => ({ VersionId: "v1", ChecksumSHA256: "Zm9vYmFy" }));
    const result = await s3JournalWriter(client).putObject(putRequest);

    expect(result).toEqual({ outcome: "created", versionId: "v1", checksumSha256: "Zm9vYmFy" });
    const input = sent[0]!.input;
    expect(input.IfNoneMatch).toBe("*");
    expect(input.ObjectLockMode).toBe("COMPLIANCE");
    expect(input.ObjectLockRetainUntilDate).toBe(RETAIN_UNTIL);
    expect(input.ServerSideEncryption).toBe("AES256");
    expect(input.ChecksumSHA256).toBe("Zm9vYmFy");
    expect(input.ChecksumAlgorithm).toBe("SHA256");
  });

  it("refuses a bucket that returns no version id — Versioning is off, so nothing is append-only", async () => {
    for (const response of [{}, { VersionId: "" }, { VersionId: "null" }]) {
      const { client } = stubClient(() => response);
      expect(await s3JournalWriter(client).putObject(putRequest)).toEqual({
        outcome: "refused",
        code: "VersioningNotEnabled",
      });
    }
  });

  it("maps a 412 to precondition_failed and a 5xx to unknown", async () => {
    const { client: c1 } = stubClient(() => awsError("PreconditionFailed", 412));
    expect(await s3JournalWriter(c1).putObject(putRequest)).toEqual({ outcome: "precondition_failed" });

    const { client: c2 } = stubClient(() => awsError("InternalError", 500));
    expect(await s3JournalWriter(c2).putObject(putRequest)).toEqual({
      outcome: "unknown",
      code: "InternalError",
    });
  });
});

describe("s3JournalVerifier", () => {
  it("ENABLES checksum mode — without it every object reads as corrupt", async () => {
    // Round-1 security H1 / billing BLOCK 2. The installed SDK's own docs:
    // "To retrieve the checksum, this mode must be enabled." Omitting it made
    // ChecksumSHA256 undefined, so the restore verifier compared null against a
    // real digest and reported checksum_mismatch for every object on a healthy
    // journal — restore refused permanently and purge never ran.
    const { client, sent } = stubClient(() => ({
      Body: { transformToString: async () => "{}" },
      ChecksumSHA256: "Zm9vYmFy",
      ServerSideEncryption: "AES256",
      ObjectLockMode: "COMPLIANCE",
      ObjectLockRetainUntilDate: RETAIN_UNTIL,
    }));

    const result = await s3JournalVerifier(client).getObjectVersion("b", "k", "v1");

    expect(sent[0]!.input.ChecksumMode).toBe("ENABLED");
    expect(result.outcome).toBe("read");
    if (result.outcome !== "read") return;
    expect(result.checksumSha256).toBe("Zm9vYmFy");
    expect(result.objectLockMode).toBe("COMPLIANCE");
  });

  it("reports an unreadable object rather than throwing", async () => {
    const { client } = stubClient(() => awsError("NoSuchVersion", 404));
    expect(await s3JournalVerifier(client).getObjectVersion("b", "k", "v1")).toEqual({
      outcome: "unreadable",
      code: "NoSuchVersion",
    });
  });

  it("pages through a truncated listing, and carries delete markers through", async () => {
    // A listing that silently stopped would hide the extra version or delete
    // marker the verifier exists to find, and report a clean chain over a
    // damaged one.
    let call = 0;
    const { client } = stubClient(() => {
      call += 1;
      if (call === 1) {
        return {
          Versions: [{ Key: "p/1.json", VersionId: "v1", Size: 10, LastModified: RETAIN_UNTIL }],
          IsTruncated: true,
          NextKeyMarker: "p/1.json",
          NextVersionIdMarker: "v1",
        };
      }
      return {
        Versions: [{ Key: "p/2.json", VersionId: "v2", Size: 10, LastModified: RETAIN_UNTIL }],
        DeleteMarkers: [{ Key: "p/1.json", VersionId: "v3" }],
        IsTruncated: false,
      };
    });

    const listed = await s3JournalVerifier(client).listVersions("b", "p/");
    expect(listed.map((v) => `${v.key}#${v.versionId}${v.isDeleteMarker ? ":marker" : ""}`)).toEqual([
      "p/1.json#v1",
      "p/2.json#v2",
      "p/1.json#v3:marker",
    ]);
    expect(call).toBe(2);
  });
});

describe("s3JournalPurger", () => {
  it("requires a version id — a delete without one writes a delete marker instead", async () => {
    const { client, sent } = stubClient(() => ({}));
    expect(await s3JournalPurger(client).deleteObjectVersion("b", "k", "")).toEqual({
      outcome: "refused",
      code: "VersionIdRequired",
    });
    // The critical part: it never reached the SDK.
    expect(sent).toHaveLength(0);
  });

  it("passes the exact version id and reports the outcome honestly", async () => {
    const { client, sent } = stubClient(() => ({}));
    expect(await s3JournalPurger(client).deleteObjectVersion("b", "k", "v9")).toEqual({
      outcome: "deleted",
    });
    expect(sent[0]!.input.VersionId).toBe("v9");

    const { client: denied } = stubClient(() => awsError("AccessDenied", 403));
    expect(await s3JournalPurger(denied).deleteObjectVersion("b", "k", "v9")).toEqual({
      outcome: "refused",
      code: "AccessDenied",
    });

    const { client: lost } = stubClient(() => awsError("TimeoutError"));
    expect(await s3JournalPurger(lost).deleteObjectVersion("b", "k", "v9")).toEqual({
      outcome: "unknown",
      code: "TimeoutError",
    });
  });
});

describe("the principal split is structural, not documentary", () => {
  it("gives each principal exactly one verb, and no way to reach another", () => {
    const { client } = stubClient(() => ({}));
    expect(Object.keys(s3JournalWriter(client))).toEqual(["putObject"]);
    expect(Object.keys(s3JournalVerifier(client)).sort()).toEqual(["getObjectVersion", "listVersions"]);
    expect(Object.keys(s3JournalPurger(client))).toEqual(["deleteObjectVersion"]);
  });
});
