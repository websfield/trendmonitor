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
 *
 * ## Why drift is classified by FAMILY, and not by `$id` (D-61)
 *
 * The two rules above pull in opposite directions, and for a while the second one
 * silently won. §3's other half is *a semantic change adds a new file — it never
 * mutates a published schema in place*, and a `$id` contains its own version. So
 * obeying the versioning policy produces a **new** `schemaId`, and a diff keyed on
 * the full `schemaId` sees no predecessor and calls the largest breaking change
 * the programme can make `added`. Measured (spike F-A): across the exact v1→v2
 * transition, criterion 3 stayed green and printed *"no schema major version moved
 * between consecutive packages"* — denying the change in the sentence a human
 * reads. The only way the old keying reached `breaking` was one `$id` appearing in
 * both sets with different majors: the in-place mutation §3 forbids. **The branch
 * was unreachable under the project's own policy.**
 *
 * So two entries belong to the same **family** when their `$id`s differ only by a
 * trailing `-v<digits>` before `.json`, and a family gaining a major it did not
 * carry before is `breaking`.
 *
 * Three constraints on that key, each of which cost something to learn:
 *
 *   - **It comes from the id string, and can come from nowhere else.** Not
 *     `schemaVersion`: `platform-edl-v1` really went 1.0.0 → 1.1.0 in the same
 *     file under the same `$id` (D-52, spike F-E), so the version moves without
 *     the family moving. Not `majorVersion`: that is the thing being stripped.
 *   - **An id with no `-vN` suffix is its own family — the whole stem.** This is
 *     reachable input, not a hypothetical: `content-package-v1.json` types
 *     `contractSet.items.schemaId` as `{type: string, minLength: 1}` with no
 *     pattern, so a recorded set can name anything. An unsuffixed id therefore
 *     shares a family with a `-vN` sibling of the same stem, which is the honest
 *     reading — the suffixed file is a second major of the same thing. **The same
 *     "no pattern" argument makes the `.json` extension optional**, so the key is
 *     computed on the stem and re-spelled canonically; requiring the literal
 *     extension let `…-v1.json` and `…-v2` be two families and readmitted F-A.
 *   - **A family is its whole SET of majors, never one representative entry.**
 *     `currentContractSet` sorts by `schemaId` ascending, so v1 is always seen
 *     before v2 (spike F-B); a reducer keeping the first entry per family records
 *     major 1 for a `{1,2}` family and reports the migration as no change at all —
 *     reproducing the original defect deterministically, while passing any test
 *     that only asks whether *some* family-keyed comparison happened.
 *
 * ### What `{v1,v2} → {v2}` is, and why
 *
 * **`removed`, naming the retired file** — the same classification, on the same
 * `schemaId`, that the per-`$id` code already emitted (spike F-C). Family keying
 * makes it tempting to say "the family still exists, so nothing happened", and
 * that would LOSE a signal the code has today: `status.ts` counts `removed`
 * against criterion 3 deliberately, because every reader pinned to v1 lost its
 * schema — at least as breaking as a bump. Reporting it as a family-level event
 * would also have to invent a `from`/`to` pair for a retirement, and there isn't
 * one. So retirement is reported per file, and a whole family disappearing and a
 * single major being retired out of a surviving family read the same: both name
 * the schema that is gone.
 *
 * ### The payload names a file that exists
 *
 * Keying by family is not licence to put the family in the payload. `status.ts`
 * prints `drift.schemaId.split('/').pop()` and `v{from}→v{to}`, so a
 * family-valued `schemaId` would print `content-package.json` — a file that has
 * never existed — and `from`/`to` are ill-defined for a family holding two
 * majors. Every drift entry therefore keeps naming a real recorded schema: for a
 * family bump that is the schema which introduced the move, with `from` set to the
 * highest major the family already carried and `to` to the new one.
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
 * The two trailing parts of an `$id` that carry no family information: the file
 * extension, and the `-v<digits>` that separates one major of a contract from
 * another.
 *
 * **The extension is OPTIONAL, and both spellings map to one key.** Requiring the
 * literal `.json` made `…-v1.json` and `…-v2` different families, so a family bump
 * across the two spellings classified `added` — F-A restored through the sibling
 * door, reproduced by execution (`diffContractSets([cp-v1], [cp-v1, cp-v2])` with
 * extension-less ids returned `added`). This is reachable by the same argument that
 * makes the unsuffixed case reachable: `contractSet.items.schemaId` is
 * `{type: string, minLength: 1}` with **no pattern**, so a recorded set can name
 * anything, and nothing forces a recorded id to carry the extension.
 */
const JSON_EXTENSION = /\.json$/;
const MAJOR_SUFFIX = /-v\d+$/;

/**
 * The family an `$id` belongs to: itself, with the extension and any major suffix
 * stripped, then re-spelled with `.json` so every spelling of one family produces
 * the SAME key.
 *
 * The `.json` is re-appended rather than left off because stripping alone would put
 * `legacy-thing` (no extension, no suffix — nothing to strip) and `legacy-thing-v2`
 * (suffix stripped) in two different families, which is the same defect one level
 * down. The key is never printed: `status.ts` renders `drift.schemaId`, which always
 * names a real recorded schema — see the module doc.
 *
 * See the module doc for why the key can only be derived from the id string, and
 * why an id carrying no suffix is its own family.
 */
function contractFamily(schemaId: string): string {
  return `${schemaId.replace(JSON_EXTENSION, '').replace(MAJOR_SUFFIX, '')}.json`;
}

/** Every major of every family the previous set carried — the whole set per
 *  family, because a first-wins representative reproduces F-A exactly (F-B). */
function majorsByFamily(entries: readonly ContractSetEntry[]): Map<string, Set<number>> {
  const byFamily = new Map<string, Set<number>>();
  for (const entry of entries) {
    const family = contractFamily(entry.schemaId);
    const majors = byFamily.get(family);
    if (majors === undefined) byFamily.set(family, new Set([entry.majorVersion]));
    else majors.add(entry.majorVersion);
  }
  return byFamily;
}

/**
 * How two recorded contract sets differ.
 *
 * `added` and `removed` are reported separately from `breaking`: a schema whose
 * whole FAMILY is new is additive by definition, and a removed schema is a
 * judgement call the criterion's own reporting should make visible rather than a
 * library silently deciding. The caller decides what counts against the exit
 * criterion; this function only says what moved.
 *
 * A new file in a family that already existed is the one case this function does
 * decide, and it decides `breaking` — see the module doc (D-61). It is the shape
 * tech-spec §3 mandates for every semantic change, so leaving it to the caller
 * would leave the criterion's whole subject matter unclassified.
 */
export function diffContractSets(
  before: readonly ContractSetEntry[],
  after: readonly ContractSetEntry[],
): ContractDrift[] {
  const beforeById = new Map(before.map((entry) => [entry.schemaId, entry]));
  const afterById = new Map(after.map((entry) => [entry.schemaId, entry]));
  const beforeMajors = majorsByFamily(before);
  const drift: ContractDrift[] = [];

  for (const [schemaId, entry] of afterById) {
    const previous = beforeById.get(schemaId);
    if (previous === undefined) {
      // A new `$id` is only additive if nothing of its family was there before.
      const known = beforeMajors.get(contractFamily(schemaId));
      if (known !== undefined && !known.has(entry.majorVersion)) {
        // `from` is the highest major the family already carried, so the printed
        // detail says which move this file completes. A file whose declared major
        // the family ALREADY holds is not that — it is a mislabelled filename
        // (spike F-D), and `subset-lint`'s `version-matches-filename` rule is what
        // stops one being authored; here it stays `added` rather than printing a
        // meaningless `v1→v1`.
        drift.push({ kind: 'breaking', schemaId, from: Math.max(...known), to: entry.majorVersion });
        continue;
      }
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
  // Retirement is reported per FILE, deliberately — including when the family
  // survives it (`{v1,v2} → {v2}`). Absorbing that into "the family still exists"
  // would lose a signal the per-`$id` code already had (spike F-C); see the
  // module doc.
  for (const schemaId of beforeById.keys()) {
    if (!afterById.has(schemaId)) drift.push({ kind: 'removed', schemaId });
  }

  drift.sort((a, b) => (a.schemaId < b.schemaId ? -1 : a.schemaId > b.schemaId ? 1 : 0));
  return drift;
}
