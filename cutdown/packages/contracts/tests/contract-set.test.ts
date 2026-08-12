import { deepEqual, equal, ok, strictEqual } from 'node:assert/strict';
import { describe, test } from 'node:test';

import { currentContractSet, diffContractSets, type ContractSetEntry } from '../src/contract-set.js';

/**
 * Direct tests for the drift classifier.
 *
 * Until this file existed, `diffContractSets` and `currentContractSet` had ZERO
 * direct unit tests (spike F-P) — every assertion about them reached through
 * `status.ts`, and the single test exercising the `breaking` branch modelled a
 * major bump as an IN-PLACE mutation of a published `$id`, which tech-spec §3
 * declares impossible. So the only proof that Phase 0 criterion 3 catches a
 * breaking change came from a state the versioning policy forbids, and the state
 * the policy actually produces — *a semantic change adds a new file* — was
 * covered by nothing.
 *
 * These tests are about the classifier's own vocabulary. They assert on
 * `drift.kind` and on the payload the caller prints, never on a downstream
 * `met` boolean: a reducer that dropped a classification entirely would still
 * satisfy an assertion phrased as "the criterion is green".
 */

const SCHEMAS = 'https://cutdown.local/contracts/schemas';

/** One recorded contract-set entry. `hash` only has to differ to mean "moved". */
function entry(file: string, schemaVersion: string, hash = 'a'): ContractSetEntry {
  return rawEntry(`${file}.json`, schemaVersion, hash);
}

/**
 * The same, with the filename spelled EXACTLY as given — extension and all, or
 * none at all.
 *
 * `contractSet.items.schemaId` is `{type: string, minLength: 1}` with no pattern,
 * so a recorded set is free to omit the extension; `entry` cannot express that
 * because it appends `.json` for every caller.
 */
function rawEntry(fileWithExtension: string, schemaVersion: string, hash = 'a'): ContractSetEntry {
  return {
    schemaId: `${SCHEMAS}/${fileWithExtension}`,
    majorVersion: Number(schemaVersion.split('.')[0]),
    schemaVersion,
    contentHash: { algorithm: 'sha256', value: hash.padEnd(64, '0') },
  };
}

/** The one drift entry, asserted to be the only one — a second one is a finding. */
function only(drift: readonly unknown[]): Record<string, unknown> {
  equal(drift.length, 1, `expected exactly one drift entry, got ${JSON.stringify(drift)}`);
  return drift[0] as Record<string, unknown>;
}

describe('contract families — a new major is a new FILE, not a new $id in an old file', () => {
  test('a new major of an existing family is breaking', () => {
    // Spike F-A, measured against the exact transition a v1→v2 migration produces.
    // Keyed by full `schemaId` this returned `[{kind:'added'}]`, and criterion 3
    // then printed "no schema major version moved between consecutive packages" —
    // actively denying the largest breaking change the programme can make.
    const drift = diffContractSets(
      [entry('content-package-v1', '1.0.0')],
      [entry('content-package-v1', '1.0.0'), entry('content-package-v2', '2.0.0')],
    );
    const d = only(drift);
    strictEqual(d['kind'], 'breaking', 'adding content-package-v2 beside v1 is a major move of one family');
    strictEqual(d['schemaId'], `${SCHEMAS}/content-package-v2.json`);
    strictEqual(d['from'], 1);
    strictEqual(d['to'], 2);
  });

  test('a brand-new contract is added, not breaking', () => {
    // The counterweight. If every new file were breaking, adding a contract that
    // has no predecessor would reset the ten-output clock for nothing, and the
    // classifier would be useless in the other direction.
    const drift = diffContractSets(
      [entry('content-package-v1', '1.0.0')],
      [entry('content-package-v1', '1.0.0'), entry('supersession-record-v1', '1.0.0')],
    );
    const d = only(drift);
    strictEqual(d['kind'], 'added', 'no earlier major of this family existed, so nothing moved');
    strictEqual(d['schemaId'], `${SCHEMAS}/supersession-record-v1.json`);
  });

  test('a minor bump under one unchanged $id stays compatible', () => {
    // The anti-vacuity control (spike F-E). `platform-edl-v1` really did go
    // 1.0.0 → 1.1.0 in the SAME file under the SAME `$id` (D-52), so this is a
    // precedent, not a hypothetical — and it is why the family key cannot be
    // `schemaVersion` or `majorVersion`: the version moved and the family did not.
    // Asserted on `kind` directly: `status.test.ts`'s "stays GREEN when only a
    // content hash moves" asserts `met === true`, which a reducer that dropped
    // the `compatible` classification altogether would also satisfy.
    const drift = diffContractSets(
      [entry('platform-edl-v1', '1.0.0', 'a')],
      [entry('platform-edl-v1', '1.1.0', 'b')],
    );
    const d = only(drift);
    strictEqual(d['kind'], 'compatible');
    strictEqual(d['schemaId'], `${SCHEMAS}/platform-edl-v1.json`);
  });

  test('retiring a major is not invisible', () => {
    // Spike F-C. `{v1,v2} → {v2}` is the shape a family reducer swallows most
    // easily — "the family still exists, so nothing happened" — and it would lose
    // a signal the per-`$id` code already had: `status.ts` treats `removed` as
    // breaking on purpose, because every reader pinned to v1 lost its schema.
    const drift = diffContractSets(
      [entry('content-package-v1', '1.0.0'), entry('content-package-v2', '2.0.0')],
      [entry('content-package-v2', '2.0.0')],
    );
    const d = only(drift);
    strictEqual(d['kind'], 'removed', 'the retired major is named, not absorbed into its surviving family');
    strictEqual(d['schemaId'], `${SCHEMAS}/content-package-v1.json`);
  });

  test('a whole family disappearing is still removed', () => {
    const drift = diffContractSets(
      [entry('content-package-v1', '1.0.0'), entry('render-v1', '1.0.0')],
      [entry('content-package-v1', '1.0.0')],
    );
    const d = only(drift);
    strictEqual(d['kind'], 'removed');
    strictEqual(d['schemaId'], `${SCHEMAS}/render-v1.json`);
  });

  test('a first-wins family reducer fails here', () => {
    // Spike F-B. `currentContractSet()` sorts by `schemaId` ascending, so v1 is
    // ALWAYS seen before v2 — a reducer keeping the first entry per family records
    // major 1 for a `{1,2}` family, and then either reports no change at all
    // (reproducing F-A exactly while passing a naive "is it breaking?" test) or
    // reports the move as v1→v3. Both are wrong, and both are caught here:
    // `from` is the HIGHEST major the family already carried, which is 2.
    const drift = diffContractSets(
      [entry('content-package-v1', '1.0.0'), entry('content-package-v2', '2.0.0')],
      [
        entry('content-package-v1', '1.0.0'),
        entry('content-package-v2', '2.0.0'),
        entry('content-package-v3', '3.0.0'),
      ],
    );
    const d = only(drift);
    strictEqual(d['kind'], 'breaking');
    strictEqual(d['schemaId'], `${SCHEMAS}/content-package-v3.json`);
    strictEqual(d['from'], 2, 'a family is its whole set of majors, never one representative entry');
    strictEqual(d['to'], 3);
  });

  test('an in-place major mutation is still breaking', () => {
    // tech-spec §3 forbids this state, so it should never arrive — but it is the
    // one breaking shape the classifier already caught, and a family rewrite that
    // dropped it would trade one blind spot for another.
    const drift = diffContractSets(
      [entry('platform-edl-v1', '1.0.0', 'a')],
      [entry('platform-edl-v1', '2.0.0', 'b')],
    );
    const d = only(drift);
    strictEqual(d['kind'], 'breaking');
    strictEqual(d['from'], 1);
    strictEqual(d['to'], 2);
  });

  test('a second file claiming a major the family already holds is added, not a v1→v1 bump', () => {
    // The mislabelled-filename shape spike F-D measured: `content-package-v2.json`
    // declaring 1.0.0. `subset-lint`'s `version-matches-filename` rule is what
    // stops one being authored, but a RECORDED set can carry anything, and the
    // classifier must not answer it with a printed `v1→v1`. Reported as `added`,
    // which is also the honest statement of what the lint exists to prevent.
    const drift = diffContractSets(
      [entry('content-package-v1', '1.0.0')],
      [entry('content-package-v1', '1.0.0'), entry('content-package-v2', '1.0.0', 'b')],
    );
    const d = only(drift);
    strictEqual(d['kind'], 'added');
    strictEqual(d['from'], undefined, 'no version pair is invented for a move that did not happen');
  });

  test('an identical set produces no drift at all', () => {
    const set = [entry('content-package-v1', '1.0.0'), entry('render-v1', '1.0.0', 'b')];
    deepEqual(diffContractSets(set, set), []);
  });
});

describe('an id with no -vN suffix', () => {
  // Reachable input, not a hypothetical: `content-package-v1.json` types
  // `contractSet.items.schemaId` as `{type: string, minLength: 1}` with no
  // pattern, so a recorded set can name a schema whose filename carries no
  // version suffix at all. The family key must not throw, and must not merge
  // two unrelated ids just because neither has a suffix to strip.

  test('two unsuffixed ids are two families', () => {
    const drift = diffContractSets(
      [entry('legacy-thing', '1.0.0')],
      [entry('legacy-thing', '1.0.0'), entry('other-thing', '1.0.0', 'b')],
    );
    const d = only(drift);
    strictEqual(d['kind'], 'added', 'an unsuffixed id is its own family — nothing moved');
  });

  test('an unsuffixed id still tracks a hash move as compatible', () => {
    const drift = diffContractSets(
      [entry('legacy-thing', '1.0.0', 'a')],
      [entry('legacy-thing', '1.0.1', 'b')],
    );
    strictEqual(only(drift)['kind'], 'compatible');
  });

  test('a -vN id with NO .json extension is still the same family', () => {
    // Reproduced by execution before this test existed: keyed on a regex that
    // required the literal `.json`, `content-package-v2` (no extension) shared no
    // family with `content-package-v1` (either spelling), so the largest breaking
    // change the programme can make came back as `added` — F-A restored through
    // the sibling door. The module's own reachability argument is what opens that
    // door: `contractSet.items.schemaId` has NO pattern, so nothing obliges a
    // recorded id to carry the extension.
    const extensionless = diffContractSets(
      [rawEntry('content-package-v1', '1.0.0')],
      [rawEntry('content-package-v1', '1.0.0'), rawEntry('content-package-v2', '2.0.0', 'b')],
    );
    const d = only(extensionless);
    strictEqual(d['kind'], 'breaking', 'the extension carries no family information');
    strictEqual(d['from'], 1);
    strictEqual(d['to'], 2);

    // And the two spellings resolve to ONE key, so a set that changes spelling
    // across the bump is the same family too — otherwise the fix would only move
    // the seam rather than close it.
    const mixed = diffContractSets(
      [rawEntry('content-package-v1.json', '1.0.0')],
      [rawEntry('content-package-v1.json', '1.0.0'), rawEntry('content-package-v2', '2.0.0', 'b')],
    );
    strictEqual(only(mixed)['kind'], 'breaking', 'one family, however its members spell themselves');
  });

  test('an unsuffixed id and its -vN sibling are the same family', () => {
    // `legacy-thing.json` and `legacy-thing-v2.json` share a stem, so stripping
    // the suffix puts them in one family. That is the honest reading — the second
    // file is a second major of the first thing — and it is the reading that keeps
    // the bump visible rather than letting it in as `added`.
    const drift = diffContractSets(
      [entry('legacy-thing', '1.0.0')],
      [entry('legacy-thing', '1.0.0'), entry('legacy-thing-v2', '2.0.0', 'b')],
    );
    const d = only(drift);
    strictEqual(d['kind'], 'breaking');
    strictEqual(d['from'], 1);
    strictEqual(d['to'], 2);
  });
});

describe('the drift payload is what a human reads', () => {
  test('a family bump prints a file that exists, and a version pair that means something', () => {
    // `status.ts:320` renders the detail as `drift.schemaId.split('/').pop()` and
    // `:326` as `v{from}→v{to}`. Keying by family is not licence to PUT the family
    // in the payload: `content-package.json` is a file that has never existed, and
    // `from`/`to` would be ill-defined for a family holding two majors. So the
    // payload keeps naming a real recorded schema — the one that introduced the
    // move — and `from` is the highest major the family already carried.
    const drift = diffContractSets(
      [entry('content-package-v1', '1.0.0')],
      [entry('content-package-v1', '1.0.0'), entry('content-package-v2', '2.0.0')],
    );
    const d = only(drift);
    const short = String(d['schemaId']).split('/').pop();
    strictEqual(short, 'content-package-v2.json');
    strictEqual(`${String(short)} v${String(d['from'])}→v${String(d['to'])}`, 'content-package-v2.json v1→v2');
  });
});

describe('currentContractSet — the input ordering F-B exploits is real', () => {
  test('the live tree carries the 0B-3 bump: 15 entries, render family {1,2}, breaking v1→v2 vs the pre-bump set', () => {
    // Not a hypothetical set: this exercises the family reducer on the REAL
    // transition this repository performed (D-62), with v1 sorted before v2
    // exactly as F-B warns. A first-wins reducer fails here on live data.
    const set = currentContractSet();
    strictEqual(set.length, 15, 'fourteen contracts plus render-v2 (D-62)');
    const renders = set.filter((e) => /\/render-v[0-9]+\.json$/.test(e.schemaId));
    deepEqual(
      renders.map((e) => e.majorVersion).sort(),
      [1, 2],
      'the render family holds BOTH majors — v1 stays on disk (tech-spec §3)',
    );
    const preBump = set.filter((e) => !e.schemaId.endsWith('/render-v2.json'));
    const d = only(diffContractSets(preBump, set));
    strictEqual(d['kind'], 'breaking', 'keyed by family, a new major of an existing family is breaking — never added');
    strictEqual(String(d['schemaId']).split('/').pop(), 'render-v2.json');
    strictEqual(`v${String(d['from'])}→v${String(d['to'])}`, 'v1→v2', '`from` is the max the family already carried');
  });

  test('entries are sorted by schemaId, and each major matches its own schemaVersion', () => {
    const set = currentContractSet();
    ok(set.length > 0, 'the committed contract schemas must produce a non-empty set');
    const ids = set.map((e) => e.schemaId);
    deepEqual(ids, [...ids].sort(), 'sorted ascending — which is why v1 is always seen before v2');
    for (const e of set) {
      strictEqual(
        e.majorVersion,
        Number(e.schemaVersion.split('.')[0]),
        `${e.schemaId} records a majorVersion its own schemaVersion does not support`,
      );
    }
  });
});
