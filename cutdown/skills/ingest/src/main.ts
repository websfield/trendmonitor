import { createHash } from 'node:crypto';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

import { ulid } from 'ulid';

import {
  assertLibass,
  ffmpegVersion,
  generateProxy,
  preflight,
  probeAlpha,
  type PreflightReport,
  type ProxyRecord,
} from '@cutdown/renderer-core';
import {
  contractValidator,
  fail,
  formatAjvErrors,
  jobDir,
  reject,
  runSkillMain,
  skillEnvelope,
  writeJsonAtomic,
  type SkillContext,
} from '@cutdown/skill-runtime';

import { classifyAsset, inspectTextAsset, isMediaKind, needsProxy, UnsupportedAssetError, type AssetKind } from './classify.js';
import { discover, DiscoveryError, type DiscoveredFile } from './discover.js';
import {
  assertManifestMatchesInventory,
  loadRightsManifest,
  readSidecar,
  resolveRights,
  RightsManifestError,
  sidecarPathFor,
  type DeclaredRights,
  type RightsRecord,
} from './rights.js';

const SOURCE_ASSET_ID = 'https://cutdown.local/contracts/schemas/source-asset-v1.json';

/**
 * Compiled once per process, not per asset.
 *
 * `contractValidator()` builds a fresh Ajv and recompiles every contract schema
 * on each call; doing that inside the per-asset loop meant a twelve-asset job
 * built twelve full validator instances.
 */
let cachedAssetValidator: ReturnType<ReturnType<typeof contractValidator>['getSchema']> | null = null;
function sourceAssetValidator() {
  if (!cachedAssetValidator) {
    cachedAssetValidator = contractValidator().getSchema(SOURCE_ASSET_ID) ?? null;
  }
  return cachedAssetValidator;
}

const SKILL = 'ingest';
const VERSION = '1.0.0';

interface IngestRequest {
  jobId: string;
  inputPath: string;
  rightsManifestPath?: string | null;
  sourceClassification?: 'real' | 'fixture';
}

interface SourceAsset {
  assetId: string;
  envelope: ReturnType<typeof skillEnvelope>;
  jobId: string;
  relativePath: string;
  assetKind: AssetKind;
  sourceClassification: 'real' | 'fixture';
  contentHash: { algorithm: 'sha256'; value: string };
  byteSize: number;
  storedPath: string;
  rights: RightsRecord;
  preflight: PreflightReport;
  proxy: ProxyRecord | null;
}

interface IngestResult {
  jobId: string;
  inventoryId: string;
  assetCount: number;
  assets: Array<{
    assetId: string;
    relativePath: string;
    assetKind: AssetKind;
    rightsState: string;
    storedPath: string;
    proxyPath: string | null;
    cacheHit: boolean;
  }>;
  warnings: string[];
  cacheHits: number;
  ffmpegVersion: string;
}

/** sha256 of a file's bytes, streamed so a large original is never held in memory. */
async function hashFile(path: string): Promise<string> {
  return new Promise((resolve, rejectPromise) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('error', rejectPromise);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Ingest one directory (or one file) ATOMICALLY.
 *
 * The guarantee, from tech-spec §7: "Artefacts commit to the job only after the
 * whole inventory validates, so a mixed directory cannot land half-ingested."
 *
 * How that is achieved, and why this shape rather than the obvious one:
 *
 *   Every asset is discovered, classified, rights-resolved, hashed, preflighted
 *   and proxied into a STAGING directory. Only once every asset has succeeded
 *   is the staging directory promoted into the job by rename. A failure at any
 *   point removes the staging directory and leaves the job untouched.
 *
 * The obvious alternative — write each asset into the job as it succeeds and
 * roll back on failure — is worse in the case that matters. A crash (or a kill)
 * between two writes leaves a half-populated job with no rollback code running,
 * and the next run cannot tell a partial inventory from a complete one. Staging
 * makes the failure mode "a leftover staging directory", which is inert,
 * obviously named, and removable.
 *
 * WHAT THIS ACTUALLY GUARANTEES — stated precisely, because an overstated
 * guarantee is worse than a modest one:
 *
 *   - Any failure during discovery, classification, rights resolution, hashing,
 *     preflight, or proxying leaves the job byte-for-byte untouched. This is
 *     the case that happens in practice and it is fully covered.
 *   - `promote()` is a sequence of renames, NOT a single atomic operation. A
 *     failure part-way through it (on Windows, an AV scanner holding a handle
 *     is the realistic trigger) can leave some assets committed and the rest
 *     discarded. `promote()` therefore moves buckets in DEPENDENCY ORDER —
 *     source bytes, then proxies, then the asset records that reference them,
 *     then the inventory that references those. Every reachable partial state
 *     is missing things from the END; no committed record can point at
 *     something absent. See `promote()` for why the inventory is staged in its
 *     own bucket rather than in `source/`.
 *   - True all-or-nothing across the promotion step needs a filesystem
 *     transaction the platform does not offer. Closing that last gap is a
 *     Stage B concern, where Postgres provides one.
 */
async function run(request: IngestRequest, ctx: SkillContext): Promise<IngestResult> {
  const warnings: string[] = [];
  const classification = request.sourceClassification ?? 'fixture';

  // Fail fast on the toolchain BEFORE touching any media: developer-guide §1
  // requires ingest preflight to assert libass is present, and discovering a
  // missing caption renderer after proxying twelve assets helps nobody.
  try {
    // `await` is load-bearing: assertLibass is async, and without it a rejected
    // promise skips this catch entirely, the fail-fast path becomes dead code,
    // and the process dies later on an unhandled rejection with exit 1 and a
    // stack trace — three §6.2 breaches from one missing keyword.
    await assertLibass();
  } catch (err) {
    throw fail(
      'FFMPEG_CAPABILITY_MISSING',
      `FFmpeg is missing a required capability: ${(err as Error).message}`,
      { remedy: 'Install the gyan.dev "full" FFmpeg build — it includes libass (developer-guide §1).' },
    );
  }

  let discovery;
  try {
    discovery = discover(request.inputPath);
  } catch (err) {
    if (err instanceof DiscoveryError) {
      throw reject('INGEST_DISCOVERY_FAILED', err.message, err.details);
    }
    throw err;
  }

  if (discovery.skippedDirectories.length > 0) {
    warnings.push(
      `Ignored ${discovery.skippedDirectories.length} subdirector${discovery.skippedDirectories.length === 1 ? 'y' : 'ies'} ` +
        `(${discovery.skippedDirectories.join(', ')}): REQ-001's Phase 0 path is a NON-RECURSIVE directory.`,
    );
  }

  // --- Rights manifest, validated against the real inventory ---------------
  let manifest = new Map<string, DeclaredRights>();
  if (request.rightsManifestPath) {
    try {
      manifest = loadRightsManifest(request.rightsManifestPath);
      assertManifestMatchesInventory(manifest, discovery.files.map((f) => f.relativePath));
    } catch (err) {
      if (err instanceof RightsManifestError) {
        throw reject('RIGHTS_MANIFEST_INVALID', err.message, err.details);
      }
      throw err;
    }
  }

  const jobRoot = jobDir(ctx.workspaceRoot, request.jobId);
  const staging = join(jobRoot, `.staging-${ulid()}`);
  mkdirSync(join(staging, 'source'), { recursive: true });
  mkdirSync(join(staging, 'proxy'), { recursive: true });
  mkdirSync(join(staging, 'assets'), { recursive: true });
  mkdirSync(join(staging, 'inventory'), { recursive: true });

  const now = new Date();
  const assets: IngestResult['assets'] = [];
  const inventoryId = ulid();
  let cacheHits = 0;

  // Resolved BEFORE the commit window. It is only a version string, but if it
  // threw after promotion the caller would be told the ingest failed while the
  // job sat fully and correctly populated — reporting failure for completed
  // work is exactly the dishonesty golden rule 6 forbids.
  const ffmpeg = await ffmpegVersion();

  try {
    for (const file of discovery.files) {
      const outcome = await ingestOne({
        file,
        root: discovery.root,
        jobRoot,
        staging,
        jobId: request.jobId,
        classification,
        manifestEntry: manifest.get(file.relativePath),
        now,
      });
      warnings.push(...outcome.warnings);
      if (outcome.cacheHit) cacheHits += 1;
      assets.push(outcome.summary);
    }

    // The inventory is staged, not written directly into the job, so it is
    // promoted in the same pass as the assets it indexes. Writing it after
    // promotion left a window where a crash produced committed assets that no
    // inventory referenced.
    writeJsonAtomic(join(staging, 'inventory', `inventory-${inventoryId}.json`), {
      inventoryId,
      jobId: request.jobId,
      envelope: skillEnvelope(SKILL, VERSION),
      ingestRoot: discovery.root,
      assetIds: assets.map((a) => a.assetId),
    });

    promote(staging, jobRoot);
  } catch (err) {
    rmSync(staging, { recursive: true, force: true });
    if (err instanceof UnsupportedAssetError) {
      throw reject('INGEST_UNSUPPORTED_ASSET', err.message, {
        relativePath: err.relativePath,
        extension: err.extension,
        atomicity: 'No job inventory was committed — the whole ingest failed.',
      });
    }
    throw err;
  } finally {
    // Belt and braces: a promoted staging directory is already gone.
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
  }

  return {
    jobId: request.jobId,
    inventoryId,
    assetCount: assets.length,
    assets,
    warnings,
    cacheHits,
    ffmpegVersion: ffmpeg,
  };
}

interface IngestOneArgs {
  file: DiscoveredFile;
  root: string;
  jobRoot: string;
  staging: string;
  jobId: string;
  classification: 'real' | 'fixture';
  manifestEntry: DeclaredRights | undefined;
  now: Date;
}

async function ingestOne(args: IngestOneArgs): Promise<{
  summary: IngestResult['assets'][number];
  warnings: string[];
  cacheHit: boolean;
}> {
  const { file, jobRoot, staging } = args;
  const warnings: string[] = [];

  // --- Rights first: the sidecar may declare assetKind (D-40 rule 1) -------
  let sidecar: DeclaredRights | undefined;
  try {
    sidecar = readSidecar(sidecarPathFor(args.root, file.relativePath));
  } catch (err) {
    // A malformed sidecar is USER input, exactly like a malformed job-level
    // manifest — which is already converted to exit 2. Without this, the two
    // identical mistakes reported different codes depending on which file the
    // YAML lived in, and this one blamed the skill.
    if (err instanceof RightsManifestError) {
      throw reject('RIGHTS_SIDECAR_INVALID', err.message, { relativePath: file.relativePath });
    }
    throw err;
  }
  const declared = sidecar ?? args.manifestEntry;
  const source = sidecar ? 'sidecar' : args.manifestEntry ? 'manifest' : 'absent';
  const rights = resolveRights(declared, source, file.relativePath, args.now);
  warnings.push(...rights.warnings);

  // --- Hash the ORIGINAL bytes (REQ-005) ----------------------------------
  const contentHash = await hashFile(file.absolutePath);

  // --- Classify -----------------------------------------------------------
  // A raster needs its pixel format before logo/image can be decided, so media
  // assets are probed before classification is finalised.
  const extension = extname(file.relativePath).toLowerCase();
  const rasterLike = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tiff', '.tif'].includes(extension);

  let preflightReport: PreflightReport | null = null;
  if (rasterLike || isProbeCandidate(extension)) {
    try {
      preflightReport = await preflight(file.absolutePath);
    } catch (err) {
      throw fail(
        'PREFLIGHT_FAILED',
        `Preflight failed for ${file.relativePath}: ${(err as Error).message}`,
        { relativePath: file.relativePath },
      );
    }
  }

  // D-40's logo/image split needs a real pixel-level alpha measurement, not
  // just `pix_fmt` — most exported PNGs are RGBA and fully opaque.
  const alpha = rasterLike && preflightReport?.video?.pixelFormat
    ? await probeAlpha(file.absolutePath, preflightReport.video.pixelFormat)
    : null;

  const classification = classifyAsset({
    relativePath: file.relativePath,
    absolutePath: file.absolutePath,
    declaredKind: rights.declaredKind,
    pixelFormat: preflightReport?.video?.pixelFormat,
    hasNonOpaquePixel: alpha?.hasNonOpaquePixel ?? undefined,
  });
  warnings.push(...classification.warnings);

  // A non-media asset that was probed anyway (or a media asset that was not)
  // would produce a preflight that lies. Resolve the mismatch explicitly.
  if (preflightReport === null && isMediaKind(classification.kind)) {
    try {
      preflightReport = await preflight(file.absolutePath);
    } catch (err) {
      throw fail('PREFLIGHT_FAILED', `Preflight failed for ${file.relativePath}: ${(err as Error).message}`, {
        relativePath: file.relativePath,
      });
    }
  }

  if (!isMediaKind(classification.kind)) {
    warnings.push(...inspectTextAsset(file.absolutePath, classification.kind).map((w) => `${file.relativePath}: ${w}`));
  }

  // --- Corruption is a hard stop, and it fails the WHOLE ingest ------------
  if (preflightReport?.corruption?.status === 'corrupt') {
    throw reject(
      'INGEST_CORRUPT_ASSET',
      `${file.relativePath} failed to decode (${preflightReport.corruption.detail ?? 'decode errors'}). ` +
        `No job inventory was committed — the whole ingest failed, so the job cannot end up half-populated.`,
      { relativePath: file.relativePath, corruption: preflightReport.corruption },
    );
  }
  if (preflightReport?.corruption?.status === 'suspect') {
    warnings.push(
      `${file.relativePath}: decode emitted recoverable errors but the stream completed — recorded as \`suspect\`. ` +
        `Non-waivable at packaging (D-35).`,
    );
  }

  // --- Store the original, hash-named and untouched (REQ-004) -------------
  const storedName = `${contentHash}${extension}`;
  const committedSource = join(jobRoot, 'source', storedName);
  const cacheHit = existsSync(committedSource);

  if (!cacheHit) {
    copyFileSync(file.absolutePath, join(staging, 'source', storedName));
  }

  // --- Proxy (D-25) -------------------------------------------------------
  let proxy: ProxyRecord | null = null;
  let proxyPath: string | null = null;
  if (needsProxy(classification.kind) && preflightReport) {
    const proxyName = `${contentHash}.mp4`;
    const committedProxy = join(jobRoot, 'proxy', proxyName);
    if (existsSync(committedProxy)) {
      // REQ-005: reusing footage does not repeat unchanged work. A proxy keyed
      // by the source content hash is already the right proxy.
      proxy = readCommittedProxyRecord(jobRoot, contentHash);
      proxyPath = relative(jobRoot, committedProxy).split('\\').join('/');
    } else {
      const generated = await generateProxy(
        file.absolutePath,
        join(staging, 'proxy', proxyName),
        { sourcePreflight: preflightReport },
      );
      proxyPath = `proxy/${proxyName}`;
      // `generateProxy` returns the absolute path it was told to write to,
      // which is inside the staging directory — a directory `promote()` deletes
      // moments later. Committing that verbatim would put a dangling,
      // machine-absolute, per-run-unique path into a portable artefact, and the
      // ULID it contains would change the artefact's content hash on every run,
      // defeating the REQ-005 cache this whole layer exists to enable. The
      // committed record is therefore job-relative, matching `storedPath`.
      proxy = { ...generated.record, storedPath: proxyPath };
    }
  }

  // A subtitle file or a brand-reference document has no container, no
  // duration, no streams — but it HAS been inspected, and the schema draws
  // exactly that distinction: `inspected: true` with null sub-objects means
  // "looked, nothing applicable", which is different from a preflight that
  // never ran. Synthesising it here is what keeps `inspected: false` an
  // impossible state in the committed inventory rather than a merely
  // discouraged one.
  const finalPreflight: PreflightReport = preflightReport ?? {
    inspected: true,
    container: null,
    duration: null,
    video: null,
    audioTracks: [],
    corruption: null,
  };

  const asset: SourceAsset = {
    assetId: ulid(),
    envelope: skillEnvelope(SKILL, VERSION),
    jobId: args.jobId,
    relativePath: file.relativePath,
    assetKind: classification.kind,
    sourceClassification: args.classification,
    contentHash: { algorithm: 'sha256', value: contentHash },
    byteSize: file.byteSize,
    storedPath: `source/${storedName}`,
    rights: rights.record,
    preflight: finalPreflight,
    proxy,
  };

  // Validate the artefact against its OWN contract before committing it.
  //
  // `brief` already does this; `ingest` originally did not, and that gap let two
  // real defects through to review — a rights record whose `expiryDate` violated
  // `format: date`, and a proxy `storedPath` pointing into a deleted staging
  // directory. Both are schema-visible. Checking here converts "Phase 2 reads a
  // malformed artefact and fails confusingly" into "ingest refuses to commit it",
  // which is the whole point of having the contract be the source of truth.
  const validateAsset = sourceAssetValidator();
  if (!validateAsset) {
    throw fail('CONTRACT_UNAVAILABLE', `Could not load ${SOURCE_ASSET_ID}. Run \`cutdown build:contracts\`.`);
  }
  if (!validateAsset(asset)) {
    throw fail(
      'ASSET_SCHEMA_INVALID',
      `The SourceAsset built for ${file.relativePath} does not satisfy source-asset-v1. This is a defect in ingest, not in the input.`,
      { relativePath: file.relativePath, formatted: formatAjvErrors(validateAsset.errors) },
    );
  }

  writeJsonAtomic(join(staging, 'assets', `${asset.assetId}.json`), asset);

  return {
    summary: {
      assetId: asset.assetId,
      relativePath: asset.relativePath,
      assetKind: asset.assetKind,
      rightsState: asset.rights.state,
      storedPath: asset.storedPath,
      proxyPath,
      cacheHit,
    },
    warnings,
    cacheHit,
  };
}

/** Extensions worth handing to ffprobe. */
function isProbeCandidate(extension: string): boolean {
  return ['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v', '.m4a', '.wav', '.mp3', '.aac', '.flac', '.ogg'].includes(
    extension,
  );
}

function readCommittedProxyRecord(jobRoot: string, contentHash: string): ProxyRecord | null {
  const assetsDir = join(jobRoot, 'assets');
  if (!existsSync(assetsDir)) return null;
  for (const entry of readdirSync(assetsDir)) {
    if (!entry.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(readFileSync(join(assetsDir, entry), 'utf8')) as SourceAsset;
      if (parsed.contentHash?.value === contentHash && parsed.proxy) return parsed.proxy;
    } catch {
      /* a malformed sibling artefact must not fail an unrelated ingest */
    }
  }
  return null;
}

/**
 * Move every staged file into the job. Called only after ALL assets validated.
 *
 * **Order is the whole design here, and it is dependency order — referents
 * before references.**
 *
 *   1. `source/`  — content-addressed original bytes; reference nothing.
 *   2. `proxy/`   — derived bytes; reference nothing.
 *   3. `assets/`  — SourceAsset records, which point INTO source/ and proxy/.
 *   4. `inventory/` → `source/` — the inventory, which points into assets/.
 *
 * `promote()` is a sequence of renames, not one atomic operation, so a failure
 * part-way through is possible (on Windows an AV handle is the realistic
 * trigger). Because the order is dependency order, every reachable partial
 * state is *incomplete* — things missing from the end — and never *dangling*:
 * no committed record can point at something that is not there.
 *
 * The inventory is staged in its own bucket rather than in `source/` precisely
 * so it can be last. Staged inside `source/`, it promoted FIRST — and a failure
 * during `assets/` then left a committed inventory naming six assetIds that had
 * just been deleted with the staging directory. That is a dangling-pointer
 * state, strictly worse than an incomplete one, and it is what Phase 2 would
 * have had to dereference.
 */
function promote(staging: string, jobRoot: string): void {
  const promoteBucket = (bucket: string, destination: string): void => {
    const from = join(staging, bucket);
    if (!existsSync(from)) return;
    const to = join(jobRoot, destination);
    mkdirSync(to, { recursive: true });
    for (const entry of readdirSync(from)) {
      const target = join(to, entry);
      // `source/` and `proxy/` are hash-named, so an existing file IS the same
      // bytes and is left alone rather than overwritten — an in-flight reader is
      // never disturbed. `assets/` and the inventory are ULID-named, so a
      // collision cannot occur; the same guard is harmless there.
      if (existsSync(target) && statSync(target).isFile()) continue;
      renameSync(join(from, entry), target);
    }
  };

  promoteBucket('source', 'source');
  promoteBucket('proxy', 'proxy');
  promoteBucket('assets', 'assets');
  // Last, deliberately. See the ordering note above.
  promoteBucket('inventory', 'source');

  rmSync(staging, { recursive: true, force: true });
}

await runSkillMain<IngestRequest, IngestResult>({
  name: SKILL,
  version: VERSION,
  inputSchema: './schema/input.json',
  outputSchema: './schema/output.json',
  run,
});
