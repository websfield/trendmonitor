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
 * The declared job objective. Members are the seven rows of PRD §12.2 'Objective scorecards' verbatim — that table is what makes an objective meaningful (it names the primary metric candidates and guardrails), so the enum tracks it rather than inventing a parallel vocabulary. PRD REQ-002 requires exactly one per job; REQ-123 requires it declared before generation.
 */
export type Objective =
  | "discovery"
  | "education_utility"
  | "community"
  | "authority_trust"
  | "organic_conversion"
  | "paid_acquisition"
  | "retention_loyalty";
/**
 * Target publishing platforms (PRD REQ-050). Phase 0 resolves capabilities for `tiktok` only, from the D-3 hard-coded fixture; the remaining members exist so a Phase 1 PlatformCapability registry is an additive change, not a schema bump.
 */
export type Platform = "tiktok" | "instagram_reels" | "youtube_shorts" | "linkedin";
/**
 * Organic or paid mode (PRD REQ-002). Kept separate from `objective` because REQ-122 forbids comparing paid and organic posts as equivalent — a single blended enum would make that error unrepresentable-as-wrong.
 */
export type DistributionMode = "organic" | "paid";
/**
 * Primary CTA, or an explicit declaration of none (REQ-002: 'primary CTA or "no CTA"'). Tagged union rather than a nullable string so 'we deliberately chose no CTA' and 'nobody filled this in' are different states.
 */
export type CtaDirective = NoCta | PrimaryCta;
/**
 * Optional funnel stage on a JobBrief (PRD REQ-002 optional-field list).
 */
export type FunnelStage = "awareness" | "consideration" | "decision" | "retention";

/**
 * The explicit brief that opens a job (PRD REQ-002, object table §5). Every required property below is a REQ-002 'require' item; the optional block is REQ-002's optional list. `cutdown brief` is non-interactive — a missing required field fails naming the field, it is never inferred, because an inferred audience or objective silently changes what the whole pipeline optimises for.
 */
export interface JobBrief {
  briefId: Ulid;
  envelope: Envelope;
  /**
   * The revision this one supersedes, or null for the first. PRD §5 makes JobBrief versioned: a revision is a new object with a parent link, never an in-place edit.
   */
  parentBriefId?: Ulid | null;
  /**
   * Stable owner-issued account identifier (decisions.md D-36). `cutdown status --phase0` groups the '3 accounts' exit criterion by THIS value only. A display-name change must never create a new account in status reporting — which is exactly why the human-readable name lives in a separate optional field.
   */
  accountId: string;
  /**
   * Human-readable label. Never used for grouping or counting.
   */
  accountDisplayName?: string | null;
  /**
   * Target audience (REQ-002, required).
   */
  audience: string;
  objective: Objective;
  /**
   * One or more target platforms (REQ-002). REQ-050 produces a distinct PlatformEDL per entry. At Phase 0 only `tiktok` resolves to a capability fixture (decisions.md D-3); `plan` fails explicitly on any other member rather than falling back to a generic profile.
   *
   * @minItems 1
   */
  platforms: [Platform, ...Platform[]];
  distributionMode: DistributionMode;
  durationRange: DurationRange;
  /**
   * BCP-47 language[-region]. decisions.md D-4 fixes Phase 0 at `en-AU`; the pattern permits others so the first non-English job is a data change plus a D-4 revisit, not a schema bump.
   */
  locale: string;
  brandOrCampaign: string;
  /**
   * What the viewer is promised (REQ-002). The critic checks the delivered edit against this; a hook that overpromises relative to it is a REQ-038 finding.
   */
  contentPromise: string;
  cta: CtaDirective;
  /**
   * How many distinct CreativeBriefs `propose` should return (REQ-002). REQ-036 permits returning fewer with a stated reason when the footage cannot support genuinely distinct angles — fewer-with-a-reason is a valid result, padding is not.
   */
  variantCount: number;
  funnelStage?: FunnelStage | null;
  offer?: string | null;
  /**
   * Claims that must be evidenced on screen. The deterministic editorial gate (decisions.md D-37) blocks an EDL whose required evidence links do not resolve — so this list has teeth, it is not guidance.
   */
  proofRequirements?: string[];
  keyMessages?: string[];
  /**
   * Claims this brand may not make. A prohibited claim appearing in an EDL is a NON-WAIVABLE deterministic block (decisions.md D-35/D-37) — never an advisory critic finding.
   */
  prohibitedClaims?: string[];
  riskTolerance?: ("low" | "medium" | "high") | null;
  notes?: string | null;
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
/**
 * Desired output duration window (REQ-002). Integer seconds — this is a brief parameter, not timecode, so it does not use the rational representation. `maxSeconds >= minSeconds` is enforced in the brief resolver, not in schema (tech-spec §3 forbids if/then/else).
 */
export interface DurationRange {
  minSeconds: number;
  maxSeconds: number;
}
export interface NoCta {
  kind: "none";
}
export interface PrimaryCta {
  kind: "cta";
  text: string;
}
