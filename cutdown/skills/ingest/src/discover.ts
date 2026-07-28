import { readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';

import { isSidecarFile } from './rights.js';

/**
 * Asset discovery for one ingest (PRD REQ-001).
 *
 * REQ-001's Phase 0 path is "a **non-recursive** local directory" containing
 * any supported video, audio, image, logo, subtitle, or brand-reference file; a
 * single file is shorthand for a one-asset job.
 *
 * Two properties this module owes the rest of the skill:
 *
 *  - **Deterministic order.** Discovery order is normalized relative-path
 *    order, so two ingests of the same directory produce the same inventory in
 *    the same sequence — which is what makes the whole operation's content hash
 *    stable and the REQ-005 cache able to hit.
 *  - **Non-recursion is enforced, not assumed.** A subdirectory is reported
 *    rather than silently walked or silently skipped: a nested folder of
 *    footage that ingest quietly ignored would look exactly like a successful
 *    ingest, and the operator would discover the gap at render time.
 */

export interface DiscoveredFile {
  /** Normalized forward-slash path relative to the ingest root. */
  relativePath: string;
  absolutePath: string;
  byteSize: number;
}

export interface Discovery {
  /** The directory that relative paths are relative to. */
  root: string;
  files: DiscoveredFile[];
  /** Subdirectory names found and NOT descended into. */
  skippedDirectories: string[];
  /** True when the caller pointed at a single file rather than a directory. */
  singleFile: boolean;
}

export class DiscoveryError extends Error {
  readonly details: unknown;
  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'DiscoveryError';
    this.details = details;
  }
}

function normalise(p: string): string {
  return p.split(sep).join('/');
}

export function discover(inputPath: string): Discovery {
  let stats;
  try {
    stats = statSync(inputPath);
  } catch (err) {
    throw new DiscoveryError(`Ingest path does not exist: ${inputPath}`, {
      error: (err as Error).message,
    });
  }

  if (stats.isFile()) {
    // Single-file shorthand. The root is its directory so a sibling
    // `<file>.rights.yaml` sidecar still resolves the same way it would in a
    // directory ingest.
    const name = basename(inputPath);
    if (isSidecarFile(name)) {
      throw new DiscoveryError(
        `${name} is a rights sidecar, not an asset. Point ingest at the asset it describes.`,
      );
    }
    return {
      root: dirname(inputPath),
      files: [{ relativePath: name, absolutePath: inputPath, byteSize: stats.size }],
      skippedDirectories: [],
      singleFile: true,
    };
  }

  if (!stats.isDirectory()) {
    throw new DiscoveryError(
      `Ingest path is neither a regular file nor a directory: ${inputPath}. ` +
        `Symlinks, devices, and pipes are rejected — an ingest must read a stable, hashable byte sequence.`,
    );
  }

  const files: DiscoveredFile[] = [];
  const skippedDirectories: string[] = [];

  for (const entry of readdirSync(inputPath)) {
    const absolute = join(inputPath, entry);
    const entryStats = statSync(absolute);

    if (entryStats.isDirectory()) {
      skippedDirectories.push(entry);
      continue;
    }
    if (!entryStats.isFile()) continue;

    // Sidecars are metadata about assets, not assets. They are picked up by the
    // rights resolver keyed on the asset they name.
    if (isSidecarFile(entry)) continue;

    files.push({
      relativePath: normalise(relative(inputPath, absolute)),
      absolutePath: absolute,
      byteSize: entryStats.size,
    });
  }

  if (files.length === 0) {
    throw new DiscoveryError(
      `No ingestable files in ${inputPath}. ` +
        (skippedDirectories.length > 0
          ? `It contains ${skippedDirectories.length} subdirector${skippedDirectories.length === 1 ? 'y' : 'ies'} (${skippedDirectories.join(', ')}), but REQ-001's Phase 0 path is a NON-RECURSIVE directory — move the assets up one level.`
          : `It contains no files.`),
      { skippedDirectories },
    );
  }

  // Deterministic: normalized relative-path order (REQ-001).
  files.sort((a, b) => (a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0));

  return { root: inputPath, files, skippedDirectories, singleFile: false };
}
