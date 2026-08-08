/**
 * The contract set (decisions.md D-36) — the single implementation.
 *
 * Every ContentPackage records the exact contract schemas its lineage was
 * produced against, and Phase 0 exit criterion 3 — *the last ten outputs require
 * no breaking contract change* — is computed by comparing consecutive packages'
 * recorded sets.
 *
 * ## Why the packages are the timeline
 *
 * tech-spec §3 describes a `contract-change` run-log event joined to each
 * package's `contractSet`. The join is unnecessary, and its absence is a feature
 * rather than a shortcut: §3 also fixes the rule that makes it unnecessary — *a
 * semantic change bumps the major version*. So the breaking-change signal is
 * already inside the recorded set:
 *
 *   - a `majorVersion` that moved between two packages **is** a breaking change;
 *   - a `contentHash` that moved under an unchanged major is compatible or
 *     editorial;
 *   - a schema that appeared or disappeared is a change of shape, and is
 *     reported as such.
 *
 * Each package's set is immutable and written at delivery time, so the sequence
 * of packages IS the timeline. A separate mutable log would be a second place for
 * the criterion to disagree with itself, and the disagreement would be invisible.
 */

import { readFileSync } from 'node:fs';

import { hashBytes } from './hash.js';
import { listContractSchemas, schemaName } from './paths.js';

export interface ContractSetEntry {
  readonly schemaId: string;
  readonly majorVersion: number;
  readonly schemaVersion: string;
  readonly contentHash: { readonly algorithm: 'sha256'; readonly value: string };
}

/**
 * Read every committed contract schema and record its identity.
 *
 * ALL of them, not just the ones one package's lineage touches. Two reasons: a
 * package cannot know which schemas a *future* reader will care about, and a
 * per-package subset would make two packages incomparable whenever their subsets
 * differed — which is precisely when criterion 3 needs to compare them. The set
 * is sorted by `schemaId` so equality is a field-by-field walk rather than a
 * set operation.
 */
export function currentContractSet(): ContractSetEntry[] {
  const entries: ContractSetEntry[] = [];
  for (const file of listContractSchemas()) {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { $id?: string; schemaVersion?: string };
    const id = parsed.$id;
    const version = parsed.schemaVersion;
    if (typeof id !== 'string' || typeof version !== 'string') {
      // Every contract schema declares both (tech-spec §3), and `subset-lint`
      // enforces it. Throwing rather than skipping is deliberate: a silently
      // omitted schema would make the recorded set understate what the package
      // was built against, which is the one thing this function must not do.
      throw new Error(
        `${schemaName(file)} declares no $id or no schemaVersion, so it cannot be recorded in a contract set. Every contract schema must carry both (tech-spec §3).`,
      );
    }
    const major = Number(version.split('.')[0]);
    if (!Number.isInteger(major) || major < 1) {
      throw new Error(`${schemaName(file)} has schemaVersion "${version}", whose major component is not a positive integer.`);
    }
    entries.push({
      schemaId: id,
      majorVersion: major,
      schemaVersion: version,
      contentHash: hashBytes(readFileSync(file)),
    });
  }
  entries.sort((a, b) => (a.schemaId < b.schemaId ? -1 : a.schemaId > b.schemaId ? 1 : 0));
  return entries;
}

export type ContractDrift =
  | { readonly kind: 'breaking'; readonly schemaId: string; readonly from: number; readonly to: number }
  | { readonly kind: 'added'; readonly schemaId: string }
  | { readonly kind: 'removed'; readonly schemaId: string }
  | { readonly kind: 'compatible'; readonly schemaId: string };

/**
 * How two recorded contract sets differ.
 *
 * `added` and `removed` are reported separately from `breaking` and are NOT
 * classified as breaking here: adding a schema is additive by definition, and a
 * removed schema is a judgement call the criterion's own reporting should make
 * visible rather than a library silently deciding. The caller decides what counts
 * against the exit criterion; this function only says what moved.
 */
export function diffContractSets(
  before: readonly ContractSetEntry[],
  after: readonly ContractSetEntry[],
): ContractDrift[] {
  const beforeById = new Map(before.map((entry) => [entry.schemaId, entry]));
  const afterById = new Map(after.map((entry) => [entry.schemaId, entry]));
  const drift: ContractDrift[] = [];

  for (const [schemaId, entry] of afterById) {
    const previous = beforeById.get(schemaId);
    if (previous === undefined) {
      drift.push({ kind: 'added', schemaId });
      continue;
    }
    if (previous.majorVersion !== entry.majorVersion) {
      drift.push({ kind: 'breaking', schemaId, from: previous.majorVersion, to: entry.majorVersion });
      continue;
    }
    if (previous.contentHash.value !== entry.contentHash.value) {
      drift.push({ kind: 'compatible', schemaId });
    }
  }
  for (const schemaId of beforeById.keys()) {
    if (!afterById.has(schemaId)) drift.push({ kind: 'removed', schemaId });
  }

  drift.sort((a, b) => (a.schemaId < b.schemaId ? -1 : a.schemaId > b.schemaId ? 1 : 0));
  return drift;
}
