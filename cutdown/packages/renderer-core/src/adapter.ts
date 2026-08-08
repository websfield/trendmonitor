import type { RenderManifestV1, RenderV1 } from '@cutdown/contracts/generated';

/**
 * The `RendererAdapter` seam (tech-spec §11, PRD REQ-081).
 *
 * **No editorial package calls FFmpeg.** Editorial code produces a
 * `RenderManifest` — a declarative statement of what should exist — and hands it
 * to an adapter. Whether that adapter shells out to FFmpeg, drives Remotion, or
 * writes a stub is invisible from the other side of this interface. That is what
 * makes `renderer-remotion` a Phase 1 addition rather than a Phase 1 rewrite.
 *
 * ## Why `plan` and `execute` are separate
 *
 * They could have been one `render(manifest)` call. Splitting them buys three
 * things that matter more than the extra type:
 *
 *   1. **Refusal happens before cost.** Every reason a render cannot proceed —
 *      an out-of-bounds source range, a font whose hash does not match, a
 *      caption that cannot be represented, a draft manifest claiming
 *      `editorially_approved` — is decided in `plan()`, which spawns nothing and
 *      writes nothing. A render that is going to fail fails in milliseconds
 *      rather than after a full encode.
 *   2. **The command line becomes testable.** `RenderPlan.commands` carries the
 *      exact argv `execute()` will run. The tier-1 determinism pins, the
 *      protocol whitelist, and caption escaping can all be asserted without
 *      FFmpeg installed — so those tests run everywhere and run fast, and the
 *      slow end-to-end test is left to prove only what genuinely needs a
 *      subprocess.
 *   3. **A plan is comparable.** `planHash` over the resolved plan is what lets
 *      "the final render differs from the approved draft only in media and
 *      encode settings" be *checked* rather than asserted in a comment.
 *
 * `plan()` is async because resolving a manifest requires probing media on disk;
 * it is nonetheless free of side effects — it creates no directory and writes no
 * file. Anything that mutates the filesystem belongs to `execute()`.
 */

export type RenderManifest = RenderManifestV1.RenderManifest;
export type Render = RenderV1.Render;

/**
 * One subprocess `execute()` will run, with the argv already assembled.
 *
 * Exposed rather than kept private because an unreadable command line is an
 * unreviewable one: this is the artefact a reviewer, a test, and a failure
 * report all need to see. `purpose` exists so a failure names the step that
 * failed ("loudness measurement") rather than a wall of flags.
 */
export interface RenderCommand {
  readonly purpose: string;
  readonly binary: 'ffmpeg' | 'ffprobe';
  readonly argv: readonly string[];
}

/** A file `execute()` writes before running any command (caption sidecars). */
export interface PlannedFile {
  /** Absolute path. */
  readonly path: string;
  readonly contents: string;
  readonly purpose: string;
}

/**
 * A fully resolved, executable render — every path absolute, every range
 * bounds-checked, every caption escaped.
 *
 * Nothing here is a promise to be kept later. If a `RenderPlan` exists, the
 * render has already been proven possible; `execute()` can still fail on I/O or
 * a decoder fault, but it cannot fail on a decision.
 */
export interface RenderPlan {
  readonly manifest: RenderManifest;
  readonly rendererName: string;
  /** Absolute directory holding the output and its caption sidecars. */
  readonly renderDir: string;
  /** Absolute path of the encoded output. */
  readonly outputPath: string;
  /** Written by `execute()` before the first command runs. */
  readonly files: readonly PlannedFile[];
  readonly commands: readonly RenderCommand[];
  /**
   * sha256 over the canonicalised plan (manifest + resolved inputs + argv),
   * excluding absolute paths — two plans that differ only in where the job
   * directory sits are the same plan.
   */
  readonly planHash: { readonly algorithm: 'sha256'; readonly value: string };
}

export interface ExecuteOptions {
  /** Per-command wall-clock ceiling. A render that hangs is a render that never fails. */
  readonly timeoutMs?: number;
  /** Absolute job directory; `Render.outputPath` is reported relative to it. */
  readonly jobDir: string;
}

export interface RendererAdapter {
  readonly name: string;
  readonly rendererVersion: string;
  plan(manifest: RenderManifest, context: PlanContext): Promise<RenderPlan>;
  execute(plan: RenderPlan, options: ExecuteOptions): Promise<Render>;
}

/**
 * Everything `plan()` needs that the manifest deliberately does not carry.
 *
 * The manifest names media by *tier*, not by path, because a manifest is meant
 * to outlive the machine that produced it — baking `C:\…` into a contract
 * artefact would make it unreplayable anywhere else. Resolution from tier to
 * path therefore happens here, at the edge, against the job on disk.
 */
export interface PlanContext {
  /** Absolute job directory (`project-data/jobs/<jobId>`). */
  readonly jobDir: string;
  /** The EDL this manifest renders — the clip list, captions, and crop intent. */
  readonly edl: unknown;
  /**
   * Absolute media path per `assetId`, already selected for the manifest's tier
   * (proxy for `draft`, source original for `final`). Resolving the tier here
   * rather than inside the adapter keeps the adapter from having an opinion
   * about the job layout.
   */
  readonly mediaByAssetId: ReadonlyMap<string, string>;
  /** Exact duration bound per `assetId`, from preflight — the range-check bound. */
  readonly durationByAssetId: ReadonlyMap<string, { ticks: number; timebase: { num: number; den: number } }>;
  /** Absolute font file path per font `family`+`role`, verified against the manifest hashes. */
  readonly fontFiles: ReadonlyMap<string, string>;
}
