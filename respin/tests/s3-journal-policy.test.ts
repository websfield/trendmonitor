// The S3 deletion-journal policy templates — parsed and inventoried.
//
// WHY THIS EXISTS. Before it, NOTHING in the repo touched these four files. The
// only appearance of the name `bucket-policy.template.json` anywhere in the
// test tree was a two-character stub written into a temp directory by
// `journal-forecast-cli.test.ts` to prove the price-snapshot loader IGNORES
// non-snapshot filenames — so the single place a reader met the filename taught
// them the file was safely ignorable. Meanwhile `packages/db/src/testing-s3.ts`
// hand-reimplements the policy's semantics and names `bucket-policy.json`, a
// path that does not exist.
//
// WHAT THIS CAN AND CANNOT PROVE. It proves the templates parse, that their
// statement inventory is the enumerated one below, that every condition key is
// one AWS actually defines, that every placeholder is still a placeholder, and
// that the verb split between the three principals is real.
//
// IT CANNOT PROVE THAT AWS EVALUATES THEM AS INTENDED, and the first version of
// this file demonstrated the cost of forgetting that: it PINNED
// `s3:x-amz-object-lock-mode`, a key AWS does not define, as though it were
// correct. Access Analyzer rejected it on the live account with
// INVALID_SERVICE_CONDITION_KEY (RUNBOOK.md, POLICY-CHANGES.md) -- meaning
// `DenyWeakOrAbsentObjectLock` had never evaluated as intended and the writer's
// condition had never matched. A test that asserts a wrong value is worse than
// no test: it defends the mistake. The `VALID_S3_CONDITION_KEYS` case below is
// the guard that would have caught it, and the live simulation in
// `docs/operator/aws.md` is the one that actually did.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const INFRA = join(dirname(dirname(fileURLToPath(import.meta.url))), "infra", "s3-deletion-journal");

const read = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(INFRA, name), "utf8")) as Record<string, unknown>;

type Statement = Readonly<{
  Sid: string;
  Effect: "Allow" | "Deny";
  Action: string | string[];
  Condition?: Record<string, Record<string, unknown>>;
}>;

const statements = (doc: Record<string, unknown>): Statement[] => doc.Statement as Statement[];
const actionsOf = (s: Statement): string[] => (Array.isArray(s.Action) ? s.Action : [s.Action]);
const allActions = (doc: Record<string, unknown>): string[] => statements(doc).flatMap(actionsOf);

describe("the deletion-journal bucket policy", () => {
  const policy = read("bucket-policy.template.json");

  it("is a well-formed 2012-10-17 policy whose statements are the enumerated list", () => {
    // A LIST, not a count (CLAUDE.md Respin rule 7). Adding or removing a
    // control is a deliberate edit here, in the same change.
    expect(policy.Version).toBe("2012-10-17");
    expect(statements(policy).map((s) => s.Sid)).toEqual([
      "DenyInsecureTransport",
      "DenyNonConditionalCreate",
      "DenyUnencryptedUpload",
      "DenyWeakOrAbsentObjectLock",
      "DenyRetentionShorterThanDay28",
      "DenyRetentionAndVersioningTampering",
    ]);
  });

  it("is all Deny — a bucket policy that grants is a second authority beside the IAM roles", () => {
    expect(statements(policy).map((s) => s.Effect)).toEqual(
      statements(policy).map(() => "Deny")
    );
  });

  it("enforces conditional create with AWS's documented operator pairing", () => {
    // Verified 2026-09-08 against conditional-writes-enforce.html Example 2:
    // `Null` on the if-header plus `Bool` on s3:ObjectCreationOperation, both
    // "true", is the shape AWS itself publishes for a Deny. A review suspected
    // the Bool-on-a-string-key pairing was vacuous; the documentation says
    // otherwise, and this pins the shape so it cannot be "corrected" away.
    const s = statements(policy).find((x) => x.Sid === "DenyNonConditionalCreate")!;
    expect(s.Condition).toEqual({
      Null: { "s3:if-none-match": "true" },
      Bool: { "s3:ObjectCreationOperation": "true" },
    });
  });

  it("names the object-lock mode with the key AWS actually defines", () => {
    // `s3:object-lock-mode`, NOT `s3:x-amz-object-lock-mode`. The x-amz- prefix
    // belongs to the encryption and ACL condition keys; Object Lock's keys carry
    // no prefix. The invalid form is silently inert -- a Deny that never fires.
    const s = statements(policy).find((x) => x.Sid === "DenyWeakOrAbsentObjectLock")!;
    expect(s.Condition).toEqual({ StringNotEquals: { "s3:object-lock-mode": "COMPLIANCE" } });
    expect(actionsOf(s).sort()).toEqual(["s3:PutObject", "s3:PutObjectRetention"]);
  });

  it("puts the 28-day window in the POLICY, not only in application code", () => {
    // Until this statement existed, `deletion-journal.ts` was the only thing
    // enforcing day 28. Any holder of the writer credential — a leaked key, a
    // future code path — could store a journal object under a one-second
    // COMPLIANCE lock, and the purger would remove it on its next run. The
    // append-only evidence store would lose its clock.
    const s = statements(policy).find((x) => x.Sid === "DenyRetentionShorterThanDay28")!;
    expect(s.Condition).toEqual({
      NumericLessThan: { "s3:object-lock-remaining-retention-days": "28" },
    });
    expect(actionsOf(s).sort()).toEqual(["s3:PutObject", "s3:PutObjectRetention"]);
  });

  it("denies the tampering verbs, exempting only the break-glass role", () => {
    const s = statements(policy).find((x) => x.Sid === "DenyRetentionAndVersioningTampering")!;
    for (const verb of [
      "s3:PutBucketVersioning",
      "s3:BypassGovernanceRetention",
      "s3:PutBucketPolicy",
      "s3:DeleteBucketPolicy",
      "s3:PutBucketPublicAccessBlock",
      // Added after live provisioning: without these two, the bucket's ACTUAL
      // default retention and default encryption were unprotected, while the
      // statement's name implied otherwise.
      "s3:PutBucketObjectLockConfiguration",
      "s3:PutEncryptionConfiguration",
    ]) {
      expect(actionsOf(s), `tampering denial omits ${verb}`).toContain(verb);
    }
    // s3:PutObjectRetention MUST NOT be here. A blanket non-break-glass denial
    // of it also denies the retention authorization every valid upload needs,
    // so the writer could never append. Shorter-than-28-day and non-COMPLIANCE
    // retention are still refused, by the two statements above.
    expect(actionsOf(s)).not.toContain("s3:PutObjectRetention");
    expect(s.Condition?.StringNotEquals?.["aws:PrincipalArn"]).toBe("<BREAK_GLASS_ADMIN_ROLE_ARN>");
  });

  it("EVERY condition key in EVERY template is one AWS defines", () => {
    // The guard that was missing. `s3:x-amz-object-lock-mode` shipped in two
    // templates and was pinned by this very file as correct; nothing here could
    // see it, because nothing here knew which keys exist. This is a LIST
    // (CLAUDE.md Respin rule 7) -- a new key is a deliberate edit, checked
    // against the AWS documentation at the time it is added.
    const VALID_S3_CONDITION_KEYS = new Set([
      "aws:SecureTransport",
      "aws:PrincipalArn",
      "aws:MultiFactorAuthPresent",
      "aws:PrincipalType",
      "s3:if-none-match",
      "s3:if-match",
      "s3:ObjectCreationOperation",
      "s3:x-amz-server-side-encryption",
      "s3:object-lock-mode",
      "s3:object-lock-remaining-retention-days",
      "s3:object-lock-retain-until-date",
      "s3:prefix",
    ]);
    const files = [
      "bucket-policy.template.json",
      "iam-writer.template.json",
      "iam-verifier.template.json",
      "iam-purger.template.json",
      "iam-break-glass.template.json",
      "break-glass-trust.template.json",
    ];
    const seen: string[] = [];
    for (const file of files) {
      for (const statement of statements(read(file))) {
        for (const operands of Object.values(statement.Condition ?? {})) {
          for (const key of Object.keys(operands)) {
            seen.push(key);
            expect(
              VALID_S3_CONDITION_KEYS.has(key),
              `${file}: "${key}" is not a condition key AWS defines. ` +
                `Object Lock keys carry NO x-amz- prefix; encryption and ACL keys do.`
            ).toBe(true);
          }
        }
      }
    }
    // Non-vacuity: a scan that found no keys would pass while asserting nothing.
    expect(seen.length).toBeGreaterThan(8);
  });
});

describe("the three IAM principals keep their verbs apart", () => {
  const writer = read("iam-writer.template.json");
  const verifier = read("iam-verifier.template.json");
  const purger = read("iam-purger.template.json");

  it("the WRITER cannot delete, and creates only conditionally, encrypted and locked", () => {
    const actions = allActions(writer);
    // `s3:PutObjectRetention` is REQUIRED, not a widening. AWS refuses Object
    // Lock parameters on a PutObject request unless the caller also holds it,
    // so with `s3:PutObject` alone this principal could not write a single
    // journal object — every append would have been denied. Live provisioning
    // found that; no test here could, because nothing here talks to real IAM.
    expect(actions.sort()).toEqual(["s3:PutObject", "s3:PutObjectRetention"]);
    // What must still be absent.
    expect(actions.join(" ")).not.toMatch(/Delete|Versioning|Bypass|GetObject|ListBucket/);

    const create = statements(writer).find((x) => x.Sid === "ConditionalCreateOnly")!;
    expect(create.Condition).toEqual({
      Null: { "s3:if-none-match": "false" },
      StringEquals: {
        "s3:x-amz-server-side-encryption": "AES256",
        "s3:object-lock-mode": "COMPLIANCE",
      },
    });

    // The retention grant is FENCED, not blanket: COMPLIANCE and >= 28 days.
    // That is what keeps "the writer can extend a lock" from becoming "the
    // writer can set any retention it likes".
    const retain = statements(writer).find((x) => x.Sid === "SetComplianceRetentionAtLeast28Days")!;
    expect(retain.Condition).toEqual({
      StringEquals: { "s3:object-lock-mode": "COMPLIANCE" },
      NumericGreaterThanEquals: { "s3:object-lock-remaining-retention-days": "28" },
    });
  });

  it("the VERIFIER cannot write or delete", () => {
    const actions = allActions(verifier);
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) expect(action).toMatch(/^s3:(Get|List)/);
  });

  it("the PURGER cannot create, and never carries BypassGovernanceRetention", () => {
    const actions = allActions(purger);
    expect(actions).toContain("s3:DeleteObjectVersion");
    expect(actions).not.toContain("s3:PutObject");
    expect(actions).not.toContain("s3:BypassGovernanceRetention");
  });

  it("THE SPLIT ITSELF: no single principal can both create and delete", () => {
    // The property the three files exist for, asserted once rather than left
    // to be inferred from three separate readings.
    for (const [name, doc] of [["writer", writer], ["verifier", verifier], ["purger", purger]] as const) {
      const actions = allActions(doc);
      const creates = actions.some((a) => a.startsWith("s3:PutObject"));
      const deletes = actions.some((a) => a.startsWith("s3:DeleteObject"));
      expect(creates && deletes, `${name} can both create and delete`).toBe(false);
    }
  });

  it("every template is still a TEMPLATE — no rendered account or bucket leaked in", () => {
    // A rendered policy committed here would carry a real bucket name and role
    // ARN into the repository.
    for (const name of [
      "bucket-policy.template.json",
      "iam-writer.template.json",
      "iam-verifier.template.json",
      "iam-purger.template.json",
    ]) {
      const text = readFileSync(join(INFRA, name), "utf8");
      expect(text, `${name} has no <BUCKET> placeholder left`).toContain("<BUCKET>");
    }
    // No template may carry a real account id. These were regenerated from the
    // policies applied to a live account, so this is the check that the
    // de-rendering actually happened.
    for (const name of [
      "bucket-policy.template.json",
      "iam-writer.template.json",
      "iam-verifier.template.json",
      "iam-purger.template.json",
      "iam-break-glass.template.json",
      "break-glass-trust.template.json",
    ]) {
      const text = readFileSync(join(INFRA, name), "utf8");
      expect(text, `${name} contains a real-looking account id`).not.toMatch(/\d{12}/);
    }
  });
});
