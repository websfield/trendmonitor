import { ok, strictEqual } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { createAjv, formatAjvErrors } from '@cutdown/contracts';

import { checkFrontmatter, mirrorBody, registryEntry, skillsSync } from '../src/commands/skills-sync.js';
import { SKILLS_ROOT } from '../src/paths.js';
import type { SkillFrontmatter } from '../src/skills.js';

/**
 * `skills sync` (tech-spec §6.3/§6.4, decisions.md D-15).
 *
 * The decision layer is tested as a PURE function against in-memory frontmatter,
 * so the rules can be exercised — including every rejection — without writing into
 * the repo's own `.claude/` directory. The real command is then exercised in its
 * read-only modes (`--check`, and a second run that must write nothing), which is
 * where idempotency actually has to hold.
 */

const META_SCHEMA = join(SKILLS_ROOT, 'meta-schema.json');

function validator() {
  const compiled = createAjv().compile(JSON.parse(readFileSync(META_SCHEMA, 'utf8')) as object);
  return {
    validate: (value: unknown) => compiled(value) as boolean,
    validationErrors: () => formatAjvErrors(compiled.errors),
  };
}

const CONTRACTS = new Set(['platform-edl-v1', 'render-v1', 'review-decision-v1']);

const good: SkillFrontmatter = {
  name: 'demo',
  skillVersion: '1.0.0',
  description: 'A description long enough to be invocation-worthy for a conversational agent to pick.',
  entrypoint: ['node', 'dist/src/main.js'],
  execution: 'sync',
  inputSchema: './schema/input.json',
  outputSchema: './schema/output.json',
  contractsUsed: ['platform-edl-v1'],
  sideEffects: ['reads-project-data'],
  timeoutSeconds: 60,
};

const check = (frontmatter: unknown, directoryName = 'demo', schemaExists = () => true) =>
  checkFrontmatter(frontmatter as SkillFrontmatter, {
    directoryName,
    ...validator(),
    contractNames: CONTRACTS,
    schemaExists,
  });

describe('the meta-schema is STRICT from day one (D-15)', () => {
  it('accepts a well-formed frontmatter', () => {
    const result = check(good);
    strictEqual(result.problems.length, 0, JSON.stringify(result.problems));
  });

  it('REJECTS an unknown key — the case a typo produces', () => {
    // `timeoutSecond` (singular) is the realistic typo. Without rejection the skill
    // would run on a default nobody chose, and the runner and the Temporal wrapper
    // would silently disagree with the author's intent.
    const result = check({ ...good, timeoutSecond: 30 });
    strictEqual(result.problems.length, 1);
    ok(result.problems[0]?.problem.includes('meta-schema'));
  });

  it('rejects a missing required field', () => {
    const { timeoutSeconds: _omitted, ...withoutTimeout } = good;
    const result = check(withoutTimeout);
    strictEqual(result.problems.length, 1);
  });

  it('rejects a string entrypoint — argv arrays only (tech-spec §6.2)', () => {
    const result = check({ ...good, entrypoint: 'node dist/src/main.js' });
    strictEqual(result.problems.length, 1);
  });

  it('rejects a side effect outside the declared vocabulary', () => {
    // The real defect this caught on its first run: `skills/index` declared
    // `calls-model`, which is not one of the three values tech-spec §6.1 fixes.
    const result = check({ ...good, sideEffects: ['reads-project-data', 'calls-model'] });
    strictEqual(result.problems.length, 1);
  });

  it('rejects a description too short to be invocation-worthy', () => {
    const result = check({ ...good, description: 'Does a thing.' });
    strictEqual(result.problems.length, 1);
  });

  it('rejects an unanchored schema path (no relative traversal out of the skill)', () => {
    const result = check({ ...good, inputSchema: '../../elsewhere/input.json' });
    strictEqual(result.problems.length, 1);
  });

  it('stops after a schema failure rather than reading fields it just called untrustworthy', () => {
    // Both a schema violation AND a name mismatch. Only the schema problem is
    // reported: the later checks read `contractsUsed` and `name`, and reporting
    // derived problems from a document that failed validation is noise that hides
    // the one error that matters.
    const result = check({ ...good, timeoutSecond: 1, name: 'wrong' }, 'demo');
    strictEqual(result.problems.length, 1);
    ok(result.problems[0]?.problem.includes('meta-schema'));
  });
});

describe('the checks a JSON Schema cannot make', () => {
  it('fails when the declared name does not match the directory', () => {
    const result = check(good, 'not-demo');
    strictEqual(result.problems.length, 1);
    ok(result.problems[0]?.problem.includes('three callers disagree'));
  });

  it('fails on a DANGLING contractsUsed entry — what §6.4 actually detects is retirement', () => {
    const result = check({ ...good, contractsUsed: ['platform-edl-v1', 'moment-v9'] });
    strictEqual(result.problems.length, 1);
    ok(result.problems[0]?.problem.includes('moment-v9'));
    // The message must NOT claim this check sees a major bump: under tech-spec §3
    // a bump ADDS a new file and the old name keeps resolving, so this check
    // detects retirement (or a typo) only (spike F-O — the old message claimed
    // bump visibility, and that claim survived in this assertion after the two
    // message homes were corrected: the fourth home of one falsehood).
    ok(
      result.problems[0]?.problem.includes('RETIRED'),
      'the message names what the check actually detects',
    );
    ok(
      !result.problems[0]?.problem.includes('major bump must be visible'),
      'and no longer claims bump visibility it does not have',
    );
  });

  it('fails when a declared schema file does not exist', () => {
    const result = check(good, 'demo', () => false);
    strictEqual(result.problems.length, 2, 'both input and output schemas are reported');
  });

  it('WARNS (does not fail) when an async skill omits heartbeatSeconds', () => {
    const result = check({ ...good, execution: 'async' });
    strictEqual(result.problems.length, 0, 'a Stage B field must not block Phase 0 work');
    strictEqual(result.warnings.length, 1);
    ok(result.warnings[0]?.problem.includes('Stage B'));
  });

  it('does not warn when an async skill declares heartbeatSeconds', () => {
    const result = check({ ...good, execution: 'async', heartbeatSeconds: 30 });
    strictEqual(result.warnings.length, 0);
  });
});

describe('the registry row is stable', () => {
  it('prefixes the mirror name and sorts the list fields', () => {
    const entry = registryEntry({
      ...good,
      contractsUsed: ['render-v1', 'platform-edl-v1'],
      sideEffects: ['writes-project-data', 'network', 'reads-project-data'],
    });
    strictEqual(entry.mirrorName, 'cutdown-demo');
    strictEqual(entry.contractsUsed.join(','), 'platform-edl-v1,render-v1');
    strictEqual(entry.sideEffects.join(','), 'network,reads-project-data,writes-project-data');
  });

  it('omits heartbeatSeconds entirely rather than writing null', () => {
    ok(!Object.keys(registryEntry(good)).includes('heartbeatSeconds'));
  });
});

describe('the generated mirror body', () => {
  const body = mirrorBody(good, 'cutdown-demo');

  it('carries the prefixed name and the real description in its frontmatter', () => {
    ok(body.startsWith('---\nname: cutdown-demo\n'));
    ok(body.includes(`description: ${good.description}`));
    ok(body.includes('allowed-tools: Bash(pnpm -C cutdown cutdown:*)'), 'the CLI tool permission is granted');
  });

  it('says it is generated and names the file to edit instead', () => {
    ok(body.includes('DO NOT EDIT'));
    ok(body.includes('Edit cutdown/skills/demo/SKILL.md instead'));
  });

  it('spells out the four-step wrapper body (tech-spec §6.3)', () => {
    ok(body.includes('Author the request'), 'step 1');
    ok(body.includes('do not infer, default, or\n   invent it'), 'step 1 forbids inventing a missing required field');
    ok(body.includes('requests/<ulid>.json'), 'step 2');
    ok(body.includes('cutdown skills run demo --input'), 'step 3');
    ok(body.includes('{code, message, skill, skillVersion, details?}'), 'step 4 surfaces the structured error');
    ok(body.includes('not a stack trace'));
  });

  it('is a pure function of the frontmatter — same input, same bytes', () => {
    // What makes the whole command idempotent. A body that embedded a timestamp
    // would rewrite every mirror on every run, and a real change would then hide in
    // the churn.
    strictEqual(mirrorBody(good, 'cutdown-demo'), body);
  });
});

describe('the real command is idempotent', () => {
  it('--check reports the committed registry and mirror as current', () => {
    // Read-only: safe to run against the real tree. If this fails, someone edited a
    // SKILL.md without re-running sync — which is exactly what it exists to catch.
    const outcome = skillsSync({ check: true });
    strictEqual(
      outcome.problems.length,
      0,
      `stale generated output: ${outcome.problems.map((p) => p.skill).join(', ')} — run \`cutdown skills sync\``,
    );
    ok(outcome.skillCount >= 10, 'every Phase 5 skill is in the registry');
  });

  it('the committed registry matches what a fresh generation would produce', () => {
    const registry = JSON.parse(readFileSync(join(SKILLS_ROOT, 'registry.json'), 'utf8')) as {
      _generated: string;
      mirrorPrefix: string;
      skills: { name: string; mirrorName: string }[];
    };
    ok(registry._generated.includes('DO NOT EDIT'));
    strictEqual(registry.mirrorPrefix, 'cutdown-');
    // Prefixed to avoid colliding with the pack skills this repo already installs
    // (`review`, `plan`, `validate`) — a collision would be resolved by whichever
    // loaded last, silently running the wrong skill.
    for (const skill of registry.skills) {
      strictEqual(skill.mirrorName, `cutdown-${skill.name}`);
    }
    const names = registry.skills.map((s) => s.name);
    for (const expected of ['approve', 'package', 'revise', 'render', 'validate']) {
      ok(names.includes(expected), `${expected} is registered`);
    }
    strictEqual([...names].sort().join(','), names.join(','), 'the registry is sorted, so two generations diff cleanly');
  });
});
