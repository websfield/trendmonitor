/**
 * Style profile resolver (Cutdown Phase 3, Task 8; decisions.md D-26).
 *
 * Loads a client's brand invariants (`style-profile-v1`) from a hand-authored YAML
 * profile, validates it against the contract, applies the one cross-field rule the
 * JSON-Schema subset cannot express, and projects the invariants into the shape the
 * `propose`/`plan` prompts inject. Phase 0 is invariants ONLY (REQ-060/061 hard
 * half) — the schema has no home for a learned tendency, so this resolver cannot
 * accidentally treat a preference as an invariant.
 *
 * A profile is DATA (`data/style-profiles/<accountId>.yaml`), selected for a job by
 * matching `accountId` (the same stable owner-issued id as JobBrief.accountId, D-36).
 * An unapproved profile (`approval: null`) is a usable draft placeholder and is
 * surfaced as such — never silently treated as owner-ratified.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse as parseYaml } from 'yaml';

import { createAjv, formatAjvErrors } from '@cutdown/contracts';
import type { StyleProfileV1 } from '@cutdown/contracts/generated';

type StyleProfile = StyleProfileV1.StyleProfile;

export const STYLE_PROFILE_ID = 'https://cutdown.local/contracts/schemas/style-profile-v1.json';

/** Thrown when a profile is unreadable, schema-invalid, or breaks a cross-field rule. */
export class StyleProfileError extends Error {
  readonly code: string;
  readonly details: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'StyleProfileError';
    this.code = code;
    this.details = details;
  }
}

let cachedValidator: ReturnType<ReturnType<typeof createAjv>['getSchema']> | null = null;

function styleValidator(): NonNullable<ReturnType<ReturnType<typeof createAjv>['getSchema']>> {
  if (cachedValidator) return cachedValidator;
  const ajv = createAjv();
  const validate = ajv.getSchema(STYLE_PROFILE_ID);
  if (!validate) {
    throw new StyleProfileError(
      'CONTRACT_UNAVAILABLE',
      `Could not load ${STYLE_PROFILE_ID}. Run \`cutdown build:contracts\`.`,
    );
  }
  cachedValidator = validate;
  return validate;
}

/**
 * Cross-field rules the style-profile-v1 subset cannot express (the subset forbids
 * if/then/else). A mandatory logo with no allowed placement is unsatisfiable — the
 * schema note says the resolver owns this, so it is enforced here in code.
 */
function assertCrossFieldRules(profile: StyleProfile, sourceLabel: string): void {
  if (profile.logoRules.mustAppear && profile.logoRules.allowedPlacements.length === 0) {
    throw new StyleProfileError(
      'LOGO_PLACEMENT_UNSATISFIABLE',
      `Style profile ${sourceLabel} sets logoRules.mustAppear=true but allowedPlacements is empty; a mandatory logo needs at least one placement.`,
      { accountId: profile.accountId },
    );
  }
}

/** Parse + validate a StyleProfile from a YAML (or JSON) document. */
export function parseStyleProfile(document: string, sourceLabel = '<inline>'): StyleProfile {
  let candidate: unknown;
  try {
    candidate = parseYaml(document);
  } catch (err) {
    throw new StyleProfileError('PROFILE_UNPARSEABLE', `Style profile ${sourceLabel} is not valid YAML/JSON: ${(err as Error).message}`);
  }

  const validate = styleValidator();
  if (!validate(candidate)) {
    throw new StyleProfileError(
      'PROFILE_SCHEMA_INVALID',
      `Style profile ${sourceLabel} does not satisfy style-profile-v1.`,
      { errors: validate.errors, formatted: formatAjvErrors(validate.errors) },
    );
  }
  const profile = candidate as StyleProfile;
  assertCrossFieldRules(profile, sourceLabel);
  return profile;
}

/** Load + validate a StyleProfile from a file path. */
export function loadStyleProfile(path: string): StyleProfile {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    throw new StyleProfileError('PROFILE_UNREADABLE', `Could not read style profile at ${path}: ${(err as Error).message}`);
  }
  return parseStyleProfile(text, path);
}

/** `cutdown/data/style-profiles/` — resolved from this module's location, not cwd. */
export function defaultProfilesDir(): string {
  // dist/src/index.js -> up to package root (packages/style) -> up two to cutdown/.
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', '..', '..', 'data', 'style-profiles');
}

/**
 * Find the StyleProfile governing an account, or null when the account has none.
 *
 * Scans `.yaml`/`.yml`/`.json` profiles in the directory and returns the one whose
 * `accountId` matches. Null (not throw) when absent: a job without a brand profile
 * is a legitimate Phase 0 state — the editorial stages then run without brand
 * invariants rather than being blocked. A malformed profile in the directory DOES
 * throw, because a broken brand profile is a defect, not an absence.
 */
export function findStyleProfileForAccount(accountId: string, profilesDir: string = defaultProfilesDir()): StyleProfile | null {
  let entries: string[];
  try {
    entries = readdirSync(profilesDir);
  } catch {
    return null;
  }
  for (const name of entries) {
    if (!/\.(ya?ml|json)$/i.test(name)) continue;
    const profile = loadStyleProfile(join(profilesDir, name));
    if (profile.accountId === accountId) return profile;
  }
  return null;
}

// --- prompt projection ------------------------------------------------------

/** The brand invariants a propose/plan prompt injects, plus a rendered text block. */
export interface StyleContext {
  accountId: string;
  profileVersion: string;
  /** False when `approval` is null — the prompt injection notes it is a draft. */
  approved: boolean;
  colours: StyleProfile['colours'];
  fonts: StyleProfile['fonts'];
  logoRules: StyleProfile['logoRules'];
  toneOfVoice: StyleProfile['toneOfVoice'];
  prohibitedClaims: string[];
  prohibitedTreatments: string[];
  /** A compact, human/prompt-readable rendering of the invariants above. */
  promptText: string;
}

/**
 * Project a StyleProfile into the invariants block the editorial prompts inject.
 *
 * Deterministic (no model): it only reformats the profile. `prohibitedClaims` and
 * `prohibitedTreatments` are surfaced verbatim so the model is TOLD the brand's
 * hard limits — but the deterministic gate, not the prompt, is what actually blocks
 * a prohibited claim (D-37). This is guidance to the model, not a substitute for
 * the gate.
 */
export function buildStyleContext(profile: StyleProfile): StyleContext {
  const approved = profile.approval !== null;
  const colourLine = profile.colours.map((c) => `${c.role}:${c.name}(${c.hex})`).join(', ');
  const fontLine = profile.fonts.map((f) => `${f.role}:${f.family}${f.rightsRecorded ? '' : ' (no rights on file — falls back to Inter/OFL)'}`).join(', ');
  const logoLine = profile.logoRules.mustAppear
    ? `logo required, placements: ${profile.logoRules.allowedPlacements.join('/')}`
    : 'logo optional';
  const tone = profile.toneOfVoice;

  const lines = [
    `Brand style invariants for account ${profile.accountId} (profile v${profile.profileVersion}${approved ? '' : ', DRAFT — not owner-approved'}):`,
    `- Colours: ${colourLine}`,
    `- Fonts: ${fontLine}`,
    `- Logo: ${logoLine}`,
    `- Voice: ${tone.descriptors.join(', ')}; casing ${tone.casing}; emoji ${tone.emojiUse}; profanity ${tone.allowProfanity ? 'allowed' : 'forbidden'}`,
    profile.prohibitedClaims.length > 0 ? `- Prohibited claims (NEVER make): ${profile.prohibitedClaims.join('; ')}` : '- Prohibited claims: none recorded',
    profile.prohibitedTreatments.length > 0 ? `- Prohibited treatments: ${profile.prohibitedTreatments.join('; ')}` : '- Prohibited treatments: none recorded',
  ];

  return {
    accountId: profile.accountId,
    profileVersion: profile.profileVersion,
    approved,
    colours: profile.colours,
    fonts: profile.fonts,
    logoRules: profile.logoRules,
    toneOfVoice: profile.toneOfVoice,
    prohibitedClaims: [...profile.prohibitedClaims],
    prohibitedTreatments: [...profile.prohibitedTreatments],
    promptText: lines.join('\n'),
  };
}
