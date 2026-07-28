import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse as parseYaml } from 'yaml';

import type { AssetKind } from './classify.js';

/**
 * Rights and consent records (PRD REQ-003).
 *
 * The requirement's closing sentence is the one that decides every design
 * choice in this file: **"Unknown material is flagged rather than assumed
 * cleared."** So:
 *
 *  - An asset with no sidecar and no manifest entry resolves to `unknown` with
 *    every detail null. There is no code path that produces `cleared` from an
 *    absent record.
 *  - An asset whose declared `expiryDate` has passed resolves to `expired`
 *    regardless of what the sidecar claims — the declared state is an input to
 *    resolution, never the output.
 *  - `unknown`, `restricted`, and `expired` are all non-waivable packaging
 *    blockers (decisions.md D-35). Nothing here decides that; this module only
 *    has to be honest about which state applies.
 */

export type RightsState = 'cleared' | 'unknown' | 'restricted' | 'expired';
export type ReleaseStatus = 'obtained' | 'not_required' | 'missing' | 'unknown';
export type MusicStatus = 'none' | 'licensed' | 'platform_native' | 'unlicensed' | 'unknown';

export interface RightsRecord {
  state: RightsState;
  owner: string | null;
  supplier: string | null;
  permittedPlatforms: string[] | null;
  territories: string[] | null;
  campaignStart: string | null;
  campaignEnd: string | null;
  expiryDate: string | null;
  talentReleaseStatus: ReleaseStatus;
  locationReleaseStatus: ReleaseStatus;
  musicStatus: MusicStatus;
  editingPermitted: boolean | null;
  paidAmplificationPermitted: boolean | null;
  evidenceUri: string | null;
  notes: string | null;
}

/** What a sidecar or manifest entry may declare. Every field optional. */
export interface DeclaredRights extends Partial<Omit<RightsRecord, 'state'>> {
  state?: RightsState;
  /** D-40: an explicit asset kind here overrides extension-based inference. */
  assetKind?: AssetKind;
}

export interface ResolvedRights {
  record: RightsRecord;
  declaredKind: AssetKind | undefined;
  /** Where the record came from, for provenance and for error messages. */
  source: 'sidecar' | 'manifest' | 'absent';
  warnings: string[];
}

/**
 * Carry the rejected raw date values into the COMMITTED record.
 *
 * The resolved record nulls an unreadable date so it satisfies `format: date`.
 * That alone would erase the distinction between "no expiry was declared" and
 * "an expiry was declared and could not be read" — and only the second is an
 * operator mistake someone needs to go fix. The warning says so at run time,
 * but run-logs are not what an auditor reads months later; the artefact is.
 */
function appendUnreadableDates(notes: string | null, unreadable: readonly string[]): string | null {
  if (unreadable.length === 0) return notes;
  const note =
    `Unreadable date value(s) in the supplied rights record, discarded as not conforming to YYYY-MM-DD: ` +
    `${unreadable.map((d) => JSON.stringify(d)).join(', ')}. Rights resolved to \`unknown\` (REQ-003).`;
  return notes ? `${notes}
${note}` : note;
}

/** The fail-closed record for an asset nobody documented. */
export function unknownRecord(reason: string): RightsRecord {
  return {
    state: 'unknown',
    owner: null,
    supplier: null,
    permittedPlatforms: null,
    territories: null,
    campaignStart: null,
    campaignEnd: null,
    expiryDate: null,
    talentReleaseStatus: 'unknown',
    locationReleaseStatus: 'unknown',
    musicStatus: 'unknown',
    editingPermitted: null,
    paidAmplificationPermitted: null,
    evidenceUri: null,
    notes: reason,
  };
}

export class RightsManifestError extends Error {
  readonly details: unknown;
  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'RightsManifestError';
    this.details = details;
  }
}

/**
 * Load a job-level rights manifest keyed by normalized relative path.
 *
 * Validated against the discovered inventory by `assertManifestMatchesInventory`
 * rather than trusted: a manifest key that matches nothing is almost always a
 * typo, and silently ignoring it means an asset the operator believed was
 * documented lands as `unknown`.
 */
export function loadRightsManifest(path: string): Map<string, DeclaredRights> {
  let parsed: unknown;
  try {
    parsed = parseYaml(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new RightsManifestError(`Rights manifest ${path} is not valid YAML: ${(err as Error).message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new RightsManifestError(
      `Rights manifest ${path} must be a mapping of relative path to rights record.`,
    );
  }

  const out = new Map<string, DeclaredRights>();
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const normalized = key.split('\\').join('/');
    if (out.has(normalized)) {
      throw new RightsManifestError(
        `Rights manifest ${path} declares ${JSON.stringify(normalized)} more than once.`,
      );
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new RightsManifestError(
        `Rights manifest entry for ${JSON.stringify(normalized)} must be a mapping.`,
      );
    }
    out.set(normalized, value as DeclaredRights);
  }
  return out;
}

/**
 * A manifest must describe exactly the assets that exist — no extras.
 *
 * Missing entries are fine (they resolve to `unknown`, which is the documented
 * behaviour and is visible in the output). EXTRA entries are an error, because
 * they mean the operator documented something that is not being ingested, and
 * the most likely cause is a path typo that has left a real asset undocumented.
 */
export function assertManifestMatchesInventory(
  manifest: Map<string, DeclaredRights>,
  relativePaths: readonly string[],
): void {
  const known = new Set(relativePaths);
  const extra = [...manifest.keys()].filter((k) => !known.has(k)).sort();
  if (extra.length > 0) {
    throw new RightsManifestError(
      `Rights manifest declares ${extra.length} path(s) that are not in the ingest directory: ${extra.join(', ')}. ` +
        `This is almost always a typo — and a typo here means a real asset silently lands as \`rights: unknown\`.`,
      { extra, discovered: [...known].sort() },
    );
  }
}

/** Sidecar path convention: `<full-filename-including-extension>.rights.yaml`. */
export function sidecarPathFor(dir: string, fileName: string): string {
  return join(dir, `${fileName}.rights.yaml`);
}

export function isSidecarFile(fileName: string): boolean {
  return fileName.endsWith('.rights.yaml');
}

function asStringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Read a date-shaped field, distinguishing ABSENT from PRESENT-BUT-WRONG-TYPE.
 *
 * The distinction is load-bearing. `expiryDate: 2024-01-01` unquoted in YAML
 * parses as a `Date` object (or `20240101` as an integer), and a plain
 * string-or-null coercion turns both into `null` — indistinguishable from "no
 * expiry declared", so a `cleared` record with a real, long-past expiry stays
 * `cleared`. Reporting the rejected value lets the caller fail closed instead.
 */
function asDateField(v: unknown): { value: string | null; rejected: string[] } {
  if (v === undefined || v === null) return { value: null, rejected: [] };
  if (typeof v === 'string') {
    return v.length > 0 ? { value: v, rejected: [] } : { value: null, rejected: [] };
  }
  // Present, but not a string. YAML gave us a Date, a number, or a collection.
  return { value: null, rejected: [String(v)] };
}

function asBoolOrNull(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

function asStringArrayOrNull(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  return v.filter((x): x is string => typeof x === 'string');
}

const RELEASE_STATUSES: ReadonlySet<string> = new Set(['obtained', 'not_required', 'missing', 'unknown']);
const MUSIC_STATUSES: ReadonlySet<string> = new Set(['none', 'licensed', 'platform_native', 'unlicensed', 'unknown']);

function asRelease(v: unknown): ReleaseStatus {
  return typeof v === 'string' && RELEASE_STATUSES.has(v) ? (v as ReleaseStatus) : 'unknown';
}

function asMusic(v: unknown): MusicStatus {
  return typeof v === 'string' && MUSIC_STATUSES.has(v) ? (v as MusicStatus) : 'unknown';
}

/**
 * Resolve one asset's rights.
 *
 * `now` is injected rather than read from the clock so expiry behaviour is
 * testable — a rights rule that can only be exercised by waiting is a rights
 * rule nobody tests.
 */
export function resolveRights(
  declared: DeclaredRights | undefined,
  source: 'sidecar' | 'manifest' | 'absent',
  relativePath: string,
  now: Date,
): ResolvedRights {
  const warnings: string[] = [];

  if (!declared) {
    return {
      record: unknownRecord(
        `No rights record accompanied ${relativePath}. REQ-003: unknown material is flagged, never assumed cleared.`,
      ),
      declaredKind: undefined,
      source: 'absent',
      warnings: [
        `${relativePath}: no rights sidecar or manifest entry — landed as \`rights: unknown\`. ` +
          `This is a non-waivable packaging blocker (D-35) until a record is supplied.`,
      ],
    };
  }

  // `asDateField` reports a present-but-wrong-TYPE value rather than collapsing
  // it to null. `asStringOrNull` treats `expiryDate: 20240101` — which YAML
  // parses as an integer — identically to an absent field, so a declared
  // `cleared` sailed through with nothing to expire it. Same fail-open class as
  // the string-format defect, just a narrower trigger.
  const expiry = asDateField(declared.expiryDate);
  const campaign = asDateField(declared.campaignEnd);

  let state: RightsState =
    declared.state === 'cleared' || declared.state === 'restricted' || declared.state === 'expired'
      ? declared.state
      : 'unknown';

  // Expiry is RESOLVED, not copied. A sidecar that says `cleared` while its own
  // expiryDate has passed is not cleared, and the discrepancy is worth naming.
  const { expiredOn, unparseable } = evaluateDates([expiry.value, campaign.value], now);
  const allUnreadable = [...unparseable, ...expiry.rejected, ...campaign.rejected];

  // What actually gets COMMITTED. An unreadable date is written as null, never
  // verbatim: `rights-record-v1` pins `format: date` on these fields, so writing
  // the raw value back would make the artefact fail its own contract — the
  // record would be refused at the commit gate with a message blaming the skill,
  // and this `unknown` resolution could never be observed.
  //
  // The rejected value is appended to the committed `notes` below. That is not
  // decoration: without it the artefact reads `state: unknown, expiryDate: null`
  // and an auditor months later cannot tell whether the sidecar declared nothing
  // or declared something unreadable — which is a REQ-003 audit question, and
  // the warning alone answers it only in a run-log nobody will still have.
  let expiryDate = expiry.value;
  let campaignEnd = campaign.value;

  if (allUnreadable.length > 0) {
    // Fail closed. We cannot tell whether these rights have lapsed, and REQ-003
    // says unknown material is flagged rather than assumed cleared.
    warnings.push(
      `${relativePath}: rights record carries ${allUnreadable.length} unreadable date(s) ` +
        `(${allUnreadable.map((d) => JSON.stringify(d)).join(', ')}). Dates must be a quoted bare \`YYYY-MM-DD\`. ` +
        `Resolved to \`unknown\` — a date that cannot be read cannot be shown to be current.`,
    );
    state = 'unknown';
    if (expiry.rejected.length > 0 || unparseable.includes(expiry.value ?? '')) expiryDate = null;
    if (campaign.rejected.length > 0 || unparseable.includes(campaign.value ?? '')) campaignEnd = null;
  }

  if (expiredOn && state !== 'restricted' && state !== 'unknown') {
    if (state === 'cleared') {
      warnings.push(
        `${relativePath}: sidecar declares \`cleared\` but the record expired on ${expiredOn}. ` +
          `Resolved to \`expired\` — the declared state is an input to resolution, never the output.`,
      );
    }
    state = 'expired';
  }

  if (state === 'cleared' && asStringOrNull(declared.evidenceUri) === null) {
    warnings.push(
      `${relativePath}: claims \`cleared\` with no \`evidenceUri\`. Recorded as declared, but surfaced as unevidenced at packaging.`,
    );
  }

  return {
    record: {
      state,
      owner: asStringOrNull(declared.owner),
      supplier: asStringOrNull(declared.supplier),
      permittedPlatforms: asStringArrayOrNull(declared.permittedPlatforms),
      territories: asStringArrayOrNull(declared.territories),
      campaignStart: asStringOrNull(declared.campaignStart),
      campaignEnd,
      expiryDate,
      talentReleaseStatus: asRelease(declared.talentReleaseStatus),
      locationReleaseStatus: asRelease(declared.locationReleaseStatus),
      musicStatus: asMusic(declared.musicStatus),
      editingPermitted: asBoolOrNull(declared.editingPermitted),
      paidAmplificationPermitted: asBoolOrNull(declared.paidAmplificationPermitted),
      evidenceUri: asStringOrNull(declared.evidenceUri),
      notes: appendUnreadableDates(asStringOrNull(declared.notes), allUnreadable),
    },
    declaredKind: declared.assetKind,
    source,
    warnings,
  };
}

/** Strict `YYYY-MM-DD`, matching the schema's `format: date` on these fields. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface DateEvaluation {
  /** The earliest supplied date already in the past, if any. */
  expiredOn: string | null;
  /** Values that were present but could not be understood as a calendar date. */
  unparseable: string[];
}

/**
 * Decide whether any supplied date has passed — FAIL-CLOSED on anything it
 * cannot parse.
 *
 * The obvious implementation, `Date.parse(`${d}T23:59:59Z`)`, fails OPEN in a
 * way that is easy to miss and expensive to get wrong: any value that is not
 * bare `YYYY-MM-DD` — `2024-01-01T00:00:00Z`, an offset-bearing timestamp, or
 * plain junk — concatenates into an unparseable string, yields `NaN`, and is
 * silently treated as "not expired". A licence two years dead would resolve to
 * `cleared` and sail through the D-35 packaging gate.
 *
 * So an unparseable date is REPORTED rather than ignored, and the caller
 * resolves the record to `unknown`. REQ-003's rule is that unknown material is
 * flagged, never assumed cleared — a date we cannot read is exactly that.
 */
export function evaluateDates(dates: Array<string | null>, now: Date): DateEvaluation {
  const present = dates.filter((d): d is string => typeof d === 'string' && d.length > 0);
  const unparseable: string[] = [];
  const past: string[] = [];

  for (const value of present) {
    if (!ISO_DATE.test(value)) {
      unparseable.push(value);
      continue;
    }
    // End-of-day UTC: a record expiring "on" a date is valid through that day.
    const parsed = Date.parse(`${value}T23:59:59Z`);
    if (!Number.isFinite(parsed)) {
      // Shape matched but the calendar rejected it (e.g. 2024-13-45).
      unparseable.push(value);
      continue;
    }
    if (parsed < now.getTime()) past.push(value);
  }

  past.sort();
  return { expiredOn: past[0] ?? null, unparseable };
}

/** Read a sidecar file if it exists. */
export function readSidecar(path: string): DeclaredRights | undefined {
  if (!existsSync(path)) return undefined;
  let parsed: unknown;
  try {
    parsed = parseYaml(readFileSync(path, 'utf8')) as unknown;
  } catch (err) {
    // A hand-edited sidecar with a tab-indented line is USER input, not a skill
    // defect. Unwrapped, the YAMLParseError escaped as an UNEXPECTED_ERROR and
    // the caller was told the skill was broken when the file was.
    throw new RightsManifestError(
      `Rights sidecar ${path} is not valid YAML: ${(err as Error).message}`,
    );
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new RightsManifestError(`Rights sidecar ${path} must be a YAML mapping.`);
  }
  return parsed as DeclaredRights;
}
