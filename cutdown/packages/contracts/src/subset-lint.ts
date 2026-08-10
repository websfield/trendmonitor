import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

import {
  CONTRACTS_ROOT,
  expectedId,
  listAllSchemaFiles,
  listContractSchemas,
} from './paths.js';

/**
 * The documented schema style subset (tech-spec §3).
 *
 * The subset exists because TWO generators must stay valid over these files —
 * `json-schema-to-typescript` and `datamodel-code-generator` — and their
 * intersection is narrower than draft 2020-12. A construct that only one of
 * them understands produces types that disagree between languages, and
 * `validate:contracts` asserts the two validators AGREE. This lint is the
 * cheap, early half of that guarantee: it fails at authoring time rather than
 * at generation time, and names the JSON Pointer so the fix is obvious.
 */

export const DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema';

export interface SubsetViolation {
  /** Path relative to `packages/contracts/`. */
  file: string;
  /** JSON Pointer to the offending node. */
  pointer: string;
  rule: string;
  message: string;
}

type Json = unknown;

function isObject(v: Json): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Does this node DECLARE properties, and therefore need closing?
 *
 * Keyed on `properties` alone, not on `type: "object"`. Draft 2020-12 does not
 * require the two together, so a bare `{"properties": {...}}` is a valid object
 * schema — and an earlier version of this rule, which demanded both, silently
 * exempted exactly that form from the closed-objects check.
 *
 * The converse must NOT be flagged: a node with `type: "object"` and no
 * `properties` — a `oneOf` wrapper, or a file whose body is just `$defs` — has
 * nothing to close. Demanding `additionalProperties: false` there would reject
 * every property its own branches declare.
 */
function declaresProperties(node: Record<string, Json>): boolean {
  return isObject(node['properties']);
}

/** Does this node describe an object alternative inside a union? */
function isObjectSchema(node: Record<string, Json>): boolean {
  return node['type'] === 'object' || declaresProperties(node);
}

/** A `$ref` branch — an object schema whose shape lives in another file. */
function isRefBranch(node: Json): boolean {
  return isObject(node) && typeof node['$ref'] === 'string';
}

/** A branch that only permits `null` — the nullable idiom, not a union member. */
function isNullBranch(node: Json): boolean {
  return isObject(node) && node['type'] === 'null';
}

/** Does this object schema carry a `const`-valued property (a discriminator)? */
function hasConstDiscriminator(node: Record<string, Json>): boolean {
  const props = node['properties'];
  if (!isObject(props)) return false;
  return Object.values(props).some((p) => isObject(p) && 'const' in p);
}

function walk(
  node: Json,
  pointer: string,
  file: string,
  out: SubsetViolation[],
): void {
  if (Array.isArray(node)) {
    node.forEach((child, i) => walk(child, `${pointer}/${i}`, file, out));
    return;
  }
  if (!isObject(node)) return;

  const add = (rule: string, message: string): void => {
    out.push({ file, pointer: pointer || '/', rule, message });
  };

  // --- Forbidden keywords -------------------------------------------------
  for (const kw of ['if', 'then', 'else'] as const) {
    if (kw in node) {
      add(
        'no-if-then-else',
        `\`${kw}\` is outside the subset. Conditional shape is not expressible in both generators; model the alternatives as a tagged union instead.`,
      );
    }
  }

  // Applicators the two generators handle differently — or not at all. `allOf`
  // is the notable one: json-schema-to-typescript intersects it while
  // datamodel-code-generator's treatment diverges, so a schema using it can
  // generate two languages that disagree about the same contract. The rest are
  // listed because an unguarded keyword is indistinguishable from an approved
  // one to whoever writes the next schema.
  for (const kw of [
    'allOf',
    'not',
    'unevaluatedProperties',
    'unevaluatedItems',
    'dependentSchemas',
    'dependentRequired',
    'propertyNames',
    '$dynamicRef',
    '$dynamicAnchor',
    'contains',
  ] as const) {
    if (kw in node) {
      add(
        'unsupported-applicator',
        `\`${kw}\` is outside the documented subset (tech-spec §3). It is either unsupported by one generator or resolved differently by each, which produces two languages that disagree about the same contract.`,
      );
    }
  }
  if ('patternProperties' in node) {
    add(
      'no-pattern-properties',
      '`patternProperties` is outside the subset. Use an array of {key, value} entries — see EngineRecord.parameters in source-index-v1.',
    );
  }
  if ('additionalProperties' in node && isObject(node['additionalProperties'])) {
    add(
      'no-schema-valued-additional-properties',
      'A schema-valued `additionalProperties` (an open map) is outside the subset. Use an explicit entry array.',
    );
  }

  // --- Closed objects -----------------------------------------------------
  if (declaresProperties(node) && node['additionalProperties'] !== false) {
    add(
      'closed-objects',
      'Every object with `properties` must declare `additionalProperties: false`. An open object lets a typo become a silently-ignored field.',
    );
  }

  // --- Tagged unions only -------------------------------------------------
  // A union of two or more *object* alternatives must be discriminated by a
  // `const` property on each branch. `X | null` is the nullable idiom and is
  // exempt: it has exactly one non-null alternative, so nothing is ambiguous.
  const oneOf = node['oneOf'];
  if (Array.isArray(oneOf)) {
    const nonNull = oneOf.filter((b) => !isNullBranch(b));
    const inlineObjects = nonNull.filter((b) => isObject(b) && isObjectSchema(b));
    // A `$ref` branch is an object alternative too — and `oneOf: [{$ref}, {$ref}]`
    // is the MOST idiomatic way to write a union, so treating only inline
    // objects as branches skipped this rule exactly where it matters most.
    // The referenced shape is not resolved here (that would need cross-file
    // resolution); instead a multi-`$ref` union is reported so the author
    // states the discriminator explicitly.
    const refBranches = nonNull.filter(isRefBranch);

    if (nonNull.length > 1 && inlineObjects.length > 0) {
      inlineObjects.forEach((branch) => {
        if (isObject(branch) && !hasConstDiscriminator(branch)) {
          add(
            'tagged-unions-only',
            'A `oneOf` over multiple object alternatives must give every object branch a `const` discriminator property. Undiscriminated unions generate structurally-ambiguous types that the two generators resolve differently.',
          );
        }
      });
    }

    if (refBranches.length > 1) {
      add(
        'tagged-unions-only',
        `A \`oneOf\` over ${refBranches.length} \`$ref\` branches cannot be checked for a discriminator here, and an undiscriminated union of referenced objects is exactly what the subset forbids. Inline the branches with their \`const\` discriminator, or model the union as a single object with a discriminator field.`,
      );
    }
  }
  if (Array.isArray(node['anyOf'])) {
    add(
      'no-any-of',
      '`anyOf` is outside the subset — overlapping alternatives have no single correct generated type. Use `oneOf` with a `const` discriminator.',
    );
  }

  for (const [key, child] of Object.entries(node)) {
    // `properties`/`$defs` keys are data, not keywords — escape per RFC 6901.
    const escaped = key.replace(/~/g, '~0').replace(/\//g, '~1');
    walk(child, `${pointer}/${escaped}`, file, out);
  }
}

const CHANGE_KINDS = new Set(['breaking', 'compatible', 'editorial']);

/** Lint one schema file. Returns every violation found (never throws on content). */
export function lintSchemaFile(absPath: string, isContract: boolean): SubsetViolation[] {
  const file = relative(CONTRACTS_ROOT, absPath).split('\\').join('/');
  const out: SubsetViolation[] = [];

  let parsed: Json;
  const raw = readFileSync(absPath, 'utf8');
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return [
      {
        file,
        pointer: '/',
        rule: 'parseable',
        message: `Not valid JSON: ${(err as Error).message}`,
      },
    ];
  }

  if (!isObject(parsed)) {
    return [{ file, pointer: '/', rule: 'parseable', message: 'Root must be an object.' }];
  }

  // --- Pinned dialect -----------------------------------------------------
  if (parsed['$schema'] !== DRAFT_2020_12) {
    out.push({
      file,
      pointer: '/$schema',
      rule: 'pinned-draft',
      message: `\`$schema\` must be exactly "${DRAFT_2020_12}" (tech-spec §3 pins the dialect).`,
    });
  }

  // --- $id matches path ---------------------------------------------------
  const wanted = expectedId(absPath);
  if (parsed['$id'] !== wanted) {
    out.push({
      file,
      pointer: '/$id',
      rule: 'id-matches-path',
      message: `\`$id\` must be "${wanted}" (derived from the file path). Found ${JSON.stringify(parsed['$id'])}. Two files sharing an $id make every $ref resolve to whichever registered first.`,
    });
  }

  // --- Version lineage, contracts only ------------------------------------
  if (isContract) {
    const version = parsed['schemaVersion'];
    if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
      out.push({
        file,
        pointer: '/schemaVersion',
        rule: 'version-lineage',
        message: 'Every contract schema declares a semver `schemaVersion` (tech-spec §3).',
      });
    }
    // A `-vN` filename is the family key's only evidence, so it has to be true.
    // Contracts only, and only when the file carries a suffix: the four files in
    // `schemas/common/` are named `-v1` and declare no `schemaVersion` at all
    // (they are referenced `$defs`, not versioned contracts), and enums carry no
    // suffix — a blanket rule fires on the commons and says nothing useful. A
    // contract with no suffix is skipped rather than failed; none exists today,
    // and demanding one would be a naming rule this lint has no mandate for.
    const suffix = /-v(\d+)\.json$/.exec(file)?.[1];
    if (suffix !== undefined && typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version)) {
      const named = Number(suffix);
      const declared = Number(version.split('.')[0]);
      if (named !== declared) {
        out.push({
          file,
          pointer: '/schemaVersion',
          rule: 'version-matches-filename',
          message:
            `The filename says major ${String(named)} and \`schemaVersion\` "${version}" says major ${String(declared)}. ` +
            'Contract drift is keyed by family — the `$id` with its `-vN` stripped — while the recorded major comes from `schemaVersion`, so a file that disagrees with its own name makes a v1→v2 migration read as a schema that never moved, and the Phase 0 exit criterion reports "no schema major version moved" across the bump.',
        });
      }
    }

    const changelog = parsed['changelog'];
    if (!Array.isArray(changelog) || changelog.length === 0) {
      out.push({
        file,
        pointer: '/changelog',
        rule: 'version-lineage',
        message: 'Every contract schema declares a non-empty `changelog` array. The Phase 0 exit criterion "last ten outputs required no breaking contract change" is computed from these entries — an unlogged change is unmeasurable.',
      });
    } else {
      changelog.forEach((entry, i) => {
        if (!isObject(entry)) {
          out.push({ file, pointer: `/changelog/${i}`, rule: 'version-lineage', message: 'Changelog entry must be an object.' });
          return;
        }
        if (typeof entry['changedAt'] !== 'string') {
          out.push({ file, pointer: `/changelog/${i}/changedAt`, rule: 'version-lineage', message: 'Missing `changedAt`.' });
        }
        if (typeof entry['changeKind'] !== 'string' || !CHANGE_KINDS.has(entry['changeKind'])) {
          out.push({
            file,
            pointer: `/changelog/${i}/changeKind`,
            rule: 'version-lineage',
            message: `\`changeKind\` must be one of ${[...CHANGE_KINDS].join(' | ')}.`,
          });
        }
        if (typeof entry['reason'] !== 'string' || entry['reason'].length === 0) {
          out.push({ file, pointer: `/changelog/${i}/reason`, rule: 'version-lineage', message: 'Missing `reason`.' });
        }
      });
    }
  }

  walk(parsed, '', file, out);
  return out;
}

/** Lint every schema, enum, and common definition file. */
export function lintAllSchemas(): SubsetViolation[] {
  const contracts = new Set(listContractSchemas());
  return listAllSchemaFiles().flatMap((p) => lintSchemaFile(p, contracts.has(p)));
}

export function formatViolations(violations: SubsetViolation[]): string {
  return violations
    .map((v) => `  ${v.file}${v.pointer}\n    [${v.rule}] ${v.message}`)
    .join('\n');
}
