// The L2 Free journey's ISOLATED database (launch L2, E-26/E-30).
//
// Its own name, `respin_test_e2el2`, so it carries the test-database marker the
// transport-selection rule requires (`TEST_DATABASE_NAME_RE` in
// `@respin/db`) and so it never touches the dev database the Phase-2 persona
// journeys share. Reads and fixture writes go through `docker exec ... psql`
// on STDIN with psql variables — `e2e/support/brain.ts`' discipline: no
// package import of the product's database layer from a journey, and no caller
// value spliced into SQL text.
import { execFileSync } from "node:child_process";

export const L2_DB_NAME = "respin_test_e2el2";
export const L2_PORT = 8010;
export const FAKE_SELECTOR = "e2e-transport-fake";

const EMAIL = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/;

/** Run SQL on stdin against the isolated database; returns unaligned output. */
export function psql(sql: string, vars: Record<string, string> = {}): string {
  for (const value of Object.values(vars)) {
    if (!EMAIL.test(value) && !/^[0-9a-f-]{36}$/i.test(value)) {
      throw new Error("refusing an unexpected psql variable shape");
    }
  }
  const args = [
    "exec", "-i", "respin-postgres", "psql", "-U", "respin", "-d", L2_DB_NAME,
    "-v", "ON_ERROR_STOP=1", "-t", "-A",
    ...Object.entries(vars).flatMap(([k, v]) => ["-v", `${k}=${v}`]),
  ];
  return execFileSync("docker", args, { input: sql, stdio: ["pipe", "pipe", "pipe"] })
    .toString("utf8")
    .trim();
}

const OWNER_SCOPE = `
  SELECT cp.id AS profile_id, cp.workspace_id
  FROM creator_profiles cp
  JOIN memberships m ON m.workspace_id = cp.workspace_id AND m.role = 'owner'
  JOIN users u ON u.id = m.user_id
  JOIN "user" au ON au.id = u.auth_user_id
  WHERE au.email = :'email'
  ORDER BY cp.created_at DESC
  LIMIT 1`;

/**
 * An ACTIVATED brain for the journey's creator: Voice and Strategy confirmed
 * and active, and one coherent activation snapshot naming both. NO Kill Test
 * rules, so a generation dispatch is exactly one transport call. The brain is
 * fixture state for this journey — its own onboarding and activation flow has
 * its own journeys — written the way `generate.test.ts` writes it.
 */
export function seedActivatedBrain(email: string): void {
  const evidence = JSON.stringify([
    { field: "/register", quote: "c", inputId: "00000000-0000-4000-8000-000000000001", startUtf16: 0, endUtf16: 1 },
  ]);
  const strategyEvidence = JSON.stringify([
    { field: "/audience", quote: "c", inputId: "00000000-0000-4000-8000-000000000001", startUtf16: 0, endUtf16: 1 },
  ]);
  psql(
    `BEGIN;
WITH p AS (${OWNER_SCOPE}),
v AS (
  INSERT INTO brain_docs (id, profile_id, workspace_id, kind, version, content, source_evidence, status, reason, confirmed_at, confirmed_content_sha256, activated_at)
  SELECT gen_random_uuid(), profile_id, workspace_id, 'voice', 1,
    '{"register":"plain and direct","sentenceRhythm":"short lines","signatureMoves":["opens on what went wrong"],"avoid":["hype words"]}'::jsonb,
    '${evidence}'::jsonb, 'active', 'Version 1: you edited this document.', now(), repeat('0', 64), now()
  FROM p RETURNING id, profile_id, workspace_id
),
s AS (
  INSERT INTO brain_docs (id, profile_id, workspace_id, kind, version, content, source_evidence, status, reason, confirmed_at, confirmed_content_sha256, activated_at)
  SELECT gen_random_uuid(), profile_id, workspace_id, 'strategy', 1,
    '{"audience":"people who film alone","positioning":"plain craft","pillars":["lighting"]}'::jsonb,
    '${strategyEvidence}'::jsonb, 'active', 'Version 1: you edited this document.', now(), repeat('0', 64), now()
  FROM p RETURNING id
)
INSERT INTO brain_activation_snapshots (id, profile_id, workspace_id, voice_doc_id, strategy_doc_id)
SELECT gen_random_uuid(), v.profile_id, v.workspace_id, v.id, s.id FROM v, s;
COMMIT;`,
    { email }
  );
}

/** Metering identity only: the served model of every usage row of this creator. */
export function servedModels(email: string): string[] {
  const out = psql(
    `WITH p AS (${OWNER_SCOPE})
SELECT mu.model FROM model_usage mu JOIN p ON mu.profile_id = p.profile_id ORDER BY mu.created_at;`,
    { email }
  );
  return out === "" ? [] : out.split("\n");
}

/** How many ledger DEBITS this creator's workspace carries. */
export function debitCount(email: string): number {
  return Number(
    psql(
      `WITH p AS (${OWNER_SCOPE})
SELECT count(*) FROM credit_ledger cl JOIN p ON cl.workspace_id = p.workspace_id WHERE cl.kind = 'debit';`,
      { email }
    )
  );
}

/** How many generation claims this creator has. */
export function claimCount(email: string): number {
  return Number(
    psql(
      `WITH p AS (${OWNER_SCOPE})
SELECT count(*) FROM generation_attempts ga JOIN p ON ga.profile_id = p.profile_id;`,
      { email }
    )
  );
}
