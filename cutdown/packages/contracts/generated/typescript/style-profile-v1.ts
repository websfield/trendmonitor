/* eslint-disable */
/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Source of truth: packages/contracts/schemas/. Regenerate with:
 *   pnpm -C cutdown exec cutdown build:contracts
 *
 * This tree is COMMITTED, never gitignored (tech-spec §3): a schema change, its
 * changelog entry, and the regenerated types land in the same commit, and
 * `build:contracts --check` fails when regeneration would dirty it.
 */

/**
 * Object identity (tech-spec §3: 'object IDs are ULIDs'). Crockford base32, 26 chars, lexicographically sortable by creation time.
 */
export type Ulid = string;
/**
 * Excluded from the content hash.
 */
export type Creator = SkillCreator | HumanCreator;
/**
 * User approval (PRD §5.180 'user-approved'), or null for a draft/placeholder profile. A tagged nullable so 'approved by a named human at a time' and 'placeholder awaiting owner inputs (D-26)' are distinct — an unapproved profile is usable for implementation fixtures but is surfaced as a draft.
 */
export type ProfileApproval = ApprovedBy | null;

/**
 * A client's brand invariants (PRD REQ-060/061; decisions.md D-26): the hard half only — colours, fonts, logo rules, prohibitions, and tone. Phase 0 is invariants, hand-authored per client, injected into propose/plan prompts and caption rendering. LEARNED tendencies (pacing, hook preference, caption density) with confidence-by-field are deliberately out of scope until Phase 1 (REQ-061 second half) — a schema that cannot hold a learned tendency cannot silently treat a preference as an invariant. Versioned and user-approved (PRD §5.180); `approval` null marks a draft placeholder still awaiting the D-26 owner inputs.
 */
export interface StyleProfile {
  styleProfileId: Ulid;
  envelope: Envelope;
  /**
   * The account this profile governs — the same stable owner-issued identifier as JobBrief.accountId (D-36). A profile is selected for a job by matching this.
   */
  accountId: string;
  /**
   * Semantic version of THIS client's profile content (distinct from the schema's version). A RenderManifest records the exact profileVersion it rendered against (REQ-080 determinism).
   */
  profileVersion: string;
  approval: ProfileApproval;
  /**
   * Brand colour invariants (REQ-060/061). Injected into caption and background treatment; a hard invariant, not a learned tendency.
   *
   * @minItems 1
   */
  colours: [BrandColour, ...BrandColour[]];
  /**
   * Brand font invariants (REQ-060). Each records whether commercial rights are on file — a brand font without recorded rights cannot be used in a render (PRD §10.8.4); Inter (OFL, D-29) is the fallback.
   *
   * @minItems 1
   */
  fonts: [BrandFont, ...BrandFont[]];
  logoRules: LogoRules;
  toneOfVoice: ToneOfVoice;
  /**
   * Claims THIS BRAND may never make, on any job (REQ-061 legal wording / prohibited claims). A prohibited claim appearing in an EDL is a NON-WAIVABLE deterministic block (D-35/D-37). Brand-level; a job may add more via JobBrief.prohibitedClaims but may not remove these.
   */
  prohibitedClaims: string[];
  /**
   * Editorial treatments this brand forbids (REQ-060 'explicit prohibitions') — e.g. `no fear-based hooks`, `no fake urgency`. Surfaced to the critic; those expressible as a deterministic rule may be promoted per D-37.
   */
  prohibitedTreatments: string[];
}
/**
 * Metadata every generated object instance carries (tech-spec §3, PRD §5.1). IMPORTANT: `createdAt` and `createdBy` are envelope metadata EXCLUDED from the content hash that keys caching and identity — otherwise two identical re-runs would hash differently and the REQ-005 cache would never hit. `schemaVersion` IS inside the hash, because it is semantic. `contentHash` on the enclosing object is computed by `hashContent()` in this package, which is the single implementation of that exclusion rule.
 */
export interface Envelope {
  /**
   * Semantic version of the schema this instance was written against.
   */
  schemaVersion: string;
  /**
   * RFC 3339 UTC instant. Excluded from the content hash.
   */
  createdAt: string;
  createdBy: Creator;
}
export interface SkillCreator {
  kind: "skill";
  skill: string;
  skillVersion: string;
}
export interface HumanCreator {
  kind: "human";
  /**
   * The named human. `cutdown approve --by <name>` writes this; decisions.md D-9 requires approval to be a human act recorded with a name.
   */
  name: string;
}
export interface ApprovedBy {
  approvedByName: string;
  approvedAt: string;
}
export interface BrandColour {
  name: string;
  /**
   * sRGB hex. Six digits, no alpha — brand colours are opaque.
   */
  hex: string;
  role: "primary" | "secondary" | "accent" | "background" | "text";
}
export interface BrandFont {
  family: string;
  role: "heading" | "body" | "caption";
  /**
   * True only if commercial-use rights are on file. False means the renderer must fall back to the OFL default rather than use this family.
   */
  rightsRecorded: boolean;
}
/**
 * Logo usage invariants (REQ-060 'logo use / logo rules').
 */
export interface LogoRules {
  /**
   * Whether every output for this brand must carry the logo.
   */
  mustAppear: boolean;
  /**
   * Where the logo may sit. Empty is only valid when mustAppear is false; the style resolver checks that.
   */
  allowedPlacements: ("top_left" | "top_right" | "bottom_left" | "bottom_right" | "centre")[];
  /**
   * Things never done to the logo (recolour, stretch, rotate, drop-shadow …).
   */
  prohibitedTreatments: string[];
}
/**
 * Editorial voice invariants (REQ-060 'tone of voice, casing, emoji use'). The hard half only — descriptors plus mechanical rules a caption pass can enforce.
 */
export interface ToneOfVoice {
  /**
   * Voice adjectives injected into prompts (e.g. `plain-spoken`, `warm`, `no hype`).
   *
   * @minItems 1
   */
  descriptors: [string, ...string[]];
  casing: "sentence" | "title" | "lower" | "brand_specified";
  emojiUse: "none" | "sparing" | "liberal";
  allowProfanity: boolean;
}
