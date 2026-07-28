import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  StyleProfileError,
  buildStyleContext,
  defaultProfilesDir,
  findStyleProfileForAccount,
  parseStyleProfile,
} from '../src/index.js';

/** A minimal schema-valid profile as YAML, mutated per test. */
function validProfileYaml(overrides: Record<string, string> = {}): string {
  const base: Record<string, string> = {
    mustAppear: 'true',
    placements: '[bottom_right]',
    hex: '#112233',
  };
  const m = { ...base, ...overrides };
  return `
styleProfileId: "01J9ST2B3C4D5E6F7G8H9K0M9X"
envelope:
  schemaVersion: "1.0.0"
  createdAt: "2026-07-28T04:00:00Z"
  createdBy: { kind: human, name: "Test" }
accountId: "acct-test-001"
profileVersion: "1.0.0"
approval: null
colours:
  - { name: "Brand", hex: "${m['hex']}", role: primary }
fonts:
  - { family: "Inter", role: caption, rightsRecorded: true }
logoRules:
  mustAppear: ${m['mustAppear']}
  allowedPlacements: ${m['placements']}
  prohibitedTreatments: []
toneOfVoice:
  descriptors: [plain]
  casing: sentence
  emojiUse: none
  allowProfanity: false
prohibitedClaims: ["guaranteed views"]
prohibitedTreatments: ["no fake urgency"]
`;
}

test('the two committed placeholder profiles load, validate, and resolve by accountId', () => {
  const dir = defaultProfilesDir();
  const p1 = findStyleProfileForAccount('acct-social-soup-001', dir);
  const p2 = findStyleProfileForAccount('acct-social-soup-002', dir);
  assert.ok(p1, 'acct-social-soup-001 profile should be found');
  assert.ok(p2, 'acct-social-soup-002 profile should be found');
  assert.equal(p1?.accountId, 'acct-social-soup-001');
  assert.equal(p2?.accountId, 'acct-social-soup-002');
  // Placeholders are drafts (D-26): approval is null until owner inputs arrive.
  assert.equal(p1?.approval, null);
});

test('an account with no profile resolves to null, not an error', () => {
  const found = findStyleProfileForAccount('acct-does-not-exist', defaultProfilesDir());
  assert.equal(found, null);
});

test('buildStyleContext surfaces prohibited claims and marks an unapproved profile as DRAFT', () => {
  const profile = parseStyleProfile(validProfileYaml());
  const ctx = buildStyleContext(profile);
  assert.equal(ctx.approved, false);
  assert.ok(ctx.prohibitedClaims.includes('guaranteed views'));
  assert.match(ctx.promptText, /DRAFT/);
  assert.match(ctx.promptText, /guaranteed views/);
});

test('cross-field rule: mustAppear=true with empty placements is rejected (schema cannot express it)', () => {
  assert.throws(
    () => parseStyleProfile(validProfileYaml({ placements: '[]' })),
    (err: unknown) => err instanceof StyleProfileError && err.code === 'LOGO_PLACEMENT_UNSATISFIABLE',
  );
});

test('schema-invalid profile (bad hex colour) is rejected by the contract validator', () => {
  assert.throws(
    () => parseStyleProfile(validProfileYaml({ hex: 'red' })),
    (err: unknown) => err instanceof StyleProfileError && err.code === 'PROFILE_SCHEMA_INVALID',
  );
});
