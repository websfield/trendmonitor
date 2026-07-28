/**
 * Moment retrieval — brute-force cosine in PURE TypeScript (decisions.md D-22).
 *
 * The corpus side never shells to Python: every Moment carries its transcript
 * embedding inline (`moment-v1` `embedding`), so ranking is an in-process cosine
 * over vectors already on disk. The Stage B move to pgvector becomes a re-embed,
 * not a redesign.
 *
 * The QUERY side must be embedded with the SAME model as the corpus, so its
 * vector is computed by the Python `embed_query.py` entrypoint (`embedQuery`),
 * spawned argv-style with no shell. Vectors from two different models are not
 * comparable — cosine between them is meaningless, not merely inaccurate — so a
 * model or dimension mismatch is a fail-closed refusal, never a silent compare.
 *
 * Honesty invariants (do not violate):
 *  - A Moment with a null embedding (b-roll, or a model-unavailable index run) is
 *    ranked LAST with a recorded reason, NEVER dropped silently and NEVER given a
 *    fabricated score.
 *  - Never fabricate a vector or a score. Null-with-reason, never a made-up value.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { MomentV1 } from '@cutdown/contracts/generated';

type Moment = MomentV1.Moment;
type MomentEmbedding = MomentV1.MomentEmbedding;

/**
 * Exact cosine similarity of two equal-length vectors.
 *
 * Length mismatch throws — two vectors of different length are not two views of
 * the same space, and a truncated compare would be a silent correctness bug.
 * A zero-norm vector yields 0 rather than NaN: it is not "maximally dissimilar",
 * it simply has no direction to compare, so it matches nothing.
 */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(`cosineSimilarity: vector length mismatch (${a.length} vs ${b.length}); these are not the same space.`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const ai = a[i] as number;
    const bi = b[i] as number;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** The model identity a query vector was produced with, so it can be checked against the corpus. */
export interface QueryModel {
  model: string;
  modelVersion: string;
}

export interface RankedMoment {
  moment: Moment;
  /** Cosine score in [-1, 1], or null when the Moment has no embedding to rank. */
  score: number | null;
  /** 1-based position. Rankable moments first (by score desc); unrankable appended after. */
  rank: number;
  /** Present exactly when `score` is null — why this Moment could not be scored. */
  reason?: string;
}

export interface RankOptions {
  /**
   * Identity of the model that produced `query`. When given, every Moment
   * embedding must match it exactly — a different model is a fail-closed throw.
   */
  queryModel?: QueryModel;
  /**
   * Cap on the number of RANKABLE moments returned. Unrankable (null-embedding)
   * moments are ALWAYS appended after and never counted against this cap, so the
   * "never dropped silently" invariant holds regardless of topK.
   */
  topK?: number;
}

function isMalformedEmbedding(embedding: MomentEmbedding): boolean {
  return (
    !Array.isArray(embedding.vector) ||
    embedding.vector.length !== embedding.dimensions ||
    embedding.vector.some((v) => typeof v !== 'number' || !Number.isFinite(v))
  );
}

/**
 * Rank Moments against a query vector by cosine similarity.
 *
 * Fail-closed refusals (throw): a Moment whose embedding dimension differs from
 * the query, whose vector is malformed, or (when `queryModel` is given) whose
 * model/version differs from the query's. You cannot compare vectors from
 * different models, so the alternative to throwing is a fabricated ranking.
 */
export function rankMoments(query: readonly number[], moments: readonly Moment[], opts: RankOptions = {}): RankedMoment[] {
  if (query.length === 0) {
    throw new Error('rankMoments: the query vector is empty; there is nothing to rank against.');
  }

  const scored: Array<{ moment: Moment; score: number }> = [];
  const unrankable: Array<{ moment: Moment; reason: string }> = [];

  for (const moment of moments) {
    const embedding = moment.embedding;
    if (embedding === null) {
      unrankable.push({
        moment,
        reason: 'Moment has no transcript embedding (b-roll, or the embedding model was unavailable at index time); it cannot be scored and is not fabricated a score.',
      });
      continue;
    }
    if (opts.queryModel && (embedding.model !== opts.queryModel.model || embedding.modelVersion !== opts.queryModel.modelVersion)) {
      throw new Error(
        `rankMoments: Moment ${moment.momentId} was embedded with ${embedding.model}@${embedding.modelVersion} but the query used ${opts.queryModel.model}@${opts.queryModel.modelVersion}. Vectors from different models are not comparable; refusing to rank.`,
      );
    }
    if (embedding.dimensions !== query.length) {
      throw new Error(
        `rankMoments: Moment ${moment.momentId} has ${embedding.dimensions}-dim embedding but the query is ${query.length}-dim. Refusing to compare mismatched spaces.`,
      );
    }
    if (isMalformedEmbedding(embedding)) {
      throw new Error(`rankMoments: Moment ${moment.momentId} has a malformed embedding vector; refusing to rank on corrupt data.`);
    }
    scored.push({ moment, score: cosineSimilarity(query, embedding.vector) });
  }

  // Stable descending sort by score; ties keep input order.
  scored.sort((x, y) => y.score - x.score);
  const limited = opts.topK !== undefined ? scored.slice(0, Math.max(0, opts.topK)) : scored;

  const ranked: RankedMoment[] = [];
  let rank = 1;
  for (const { moment, score } of limited) {
    ranked.push({ moment, score, rank });
    rank += 1;
  }
  for (const { moment, reason } of unrankable) {
    ranked.push({ moment, score: null, rank, reason });
    rank += 1;
  }
  return ranked;
}

// --- query embedding (Python entrypoint) ------------------------------------

/** A `{model, modelVersion, dimensions, vector}` matching `moment-v1` MomentEmbedding. */
export interface QueryVector {
  model: string;
  modelVersion: string;
  dimensions: number;
  vector: number[];
}

/** Shape of a spawn result, so tests can inject a fake instead of running Python. */
export interface SpawnResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export type SpawnFn = (command: string, args: readonly string[], cwd: string) => SpawnResult;

export interface EmbedQueryOptions {
  /** cutdown workspace root; defaults from `CUTDOWN_WORKSPACE_ROOT` or this module's location. */
  workspaceRoot?: string;
  /** Absolute path to the Python entrypoint; defaults under the indexer worker. */
  scriptPath?: string;
  /** Injectable spawner (default: shell-free `spawnSync('uv', ...)`), so tests never run Python. */
  spawn?: SpawnFn;
  /** Directory for the temp input/output files; defaults to the OS temp dir. */
  tmpDir?: string;
}

function defaultWorkspaceRoot(): string {
  const fromEnv = process.env['CUTDOWN_WORKSPACE_ROOT'];
  if (fromEnv) return fromEnv;
  // dist/src/retrieval.js -> up four to cutdown/.
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', '..', '..');
}

const defaultSpawn: SpawnFn = (command, args, cwd) => {
  const result = spawnSync(command, [...args], { cwd, encoding: 'utf8', shell: false, maxBuffer: 64 * 1024 * 1024 });
  const out: SpawnResult = { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  if (result.error) out.error = result.error;
  return out;
};

function assertQueryVector(value: unknown): QueryVector {
  const rec = value as Record<string, unknown> | null;
  if (!rec || typeof rec !== 'object') throw new Error('embedQuery: entrypoint output was not a JSON object.');
  const { model, modelVersion, dimensions, vector } = rec;
  if (typeof model !== 'string' || model.length === 0) throw new Error('embedQuery: output.model missing.');
  if (typeof modelVersion !== 'string' || modelVersion.length === 0) throw new Error('embedQuery: output.modelVersion missing.');
  if (typeof dimensions !== 'number' || !Number.isInteger(dimensions)) throw new Error('embedQuery: output.dimensions missing.');
  if (!Array.isArray(vector) || vector.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
    throw new Error('embedQuery: output.vector must be an array of finite numbers.');
  }
  if (vector.length !== dimensions) {
    throw new Error(`embedQuery: output vector length (${vector.length}) disagrees with dimensions (${dimensions}); refusing a malformed query vector.`);
  }
  return { model, modelVersion, dimensions, vector: vector as number[] };
}

/**
 * Compute the query-side vector with the SAME model as the corpus (D-22), by
 * spawning the Python `embed_query.py` entrypoint argv-style (no shell), passing
 * the text through a temp `--input` file and reading the `--output` JSON.
 *
 * Mirrors how the CLI spawns Python skills: `uv run --project <workspaceRoot>
 * python <script> --input <in> --output <out>`.
 */
export function embedQuery(text: string, opts: EmbedQueryOptions = {}): QueryVector {
  const root = opts.workspaceRoot ?? defaultWorkspaceRoot();
  const script = opts.scriptPath ?? join(root, 'workers', 'indexer-python', 'src', 'embed_query.py');
  const spawn = opts.spawn ?? defaultSpawn;
  const baseTmp = opts.tmpDir ?? tmpdir();

  const dir = mkdtempSync(join(baseTmp, 'cutdown-embed-query-'));
  const inputPath = join(dir, 'input.json');
  const outputPath = join(dir, 'output.json');
  try {
    writeFileSync(inputPath, JSON.stringify({ text }), 'utf8');
    const args = ['run', '--project', root, 'python', script, '--input', inputPath, '--output', outputPath];
    const result = spawn('uv', args, root);

    if (result.error) {
      throw new Error(`embedQuery: could not start the Python entrypoint: ${result.error.message}`);
    }
    if (result.status !== 0) {
      const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.status}`;
      throw new Error(`embedQuery: entrypoint exited ${result.status}: ${detail}`);
    }

    const raw = JSON.parse(readFileSync(outputPath, 'utf8')) as unknown;
    return assertQueryVector(raw);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
