// Schema -> TypeScript codegen. The ONLY source of the contract types.
// Reads docs/initial/schemas/{rubric,events,mechanisms}-v1.json and emits
// src/types/generated/*.ts.
//
// This is a small, dependency-free JSON-Schema walker (draft 2020-12 subset used
// by these three contracts): object/properties/required, enum, const, arrays,
// $ref (#/$defs/...), patternProperties, and union `type` arrays. The string
// VALUES all come straight from the schema JSON — nothing here is hand-typed.
// Never hand-edit the generated files; regenerate with `npm run gen:types`.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const schemaDir = resolve(repoRoot, 'docs', 'initial', 'schemas');
const outDir = resolve(here, '..', 'src', 'types', 'generated');
mkdirSync(outDir, { recursive: true });

const read = (f) => JSON.parse(readFileSync(resolve(schemaDir, f), 'utf8'));
const rubric = read('rubric-v1.json');
const events = read('events-v1.json');
const mechanisms = read('mechanisms-v1.json');

const BANNER =
  '// GENERATED FILE — do not edit. Source: docs/initial/schemas/*.json\n' +
  '// Regenerate with `npm run gen:types`. Widening a type here by hand is a contract breach.\n\n';

const lit = (v) => (v === null ? 'null' : JSON.stringify(v));
const primitive = (t) =>
  ({ string: 'string', number: 'number', integer: 'number', boolean: 'boolean', null: 'null' })[t] ?? 'unknown';

// Map a JSON-Schema `$ref` to a generated type name.
const REF_NAMES = { '#/$defs/mechanism': 'Mechanism' };

// Render the TS type for a schema node. `indent` gives nesting for inline objects.
function tsType(node, indent = 0) {
  if (!node || typeof node !== 'object') return 'unknown';
  if (node.$ref) return REF_NAMES[node.$ref] ?? 'unknown';
  if ('const' in node) return lit(node.const);
  if (Array.isArray(node.enum)) return node.enum.map(lit).join(' | ');

  // Union `type` arrays, e.g. ["string","null"].
  if (Array.isArray(node.type)) return node.type.map(primitive).join(' | ');

  if (node.type === 'array') {
    const item = node.items ? tsType(node.items, indent) : 'unknown';
    return /[|&]/.test(item) ? `(${item})[]` : `${item}[]`;
  }

  if (node.type === 'object' || node.properties || node.patternProperties) {
    if (node.properties) return objectType(node, indent);
    if (node.patternProperties) {
      const valSchemas = Object.values(node.patternProperties);
      const val = valSchemas.length ? tsType(valSchemas[0], indent) : 'unknown';
      return `{ [k: string]: ${val} }`;
    }
    // Free-form object (e.g. feature_predicate).
    return 'Record<string, unknown>';
  }

  if (typeof node.type === 'string') return primitive(node.type);
  return 'unknown';
}

function objectType(node, indent) {
  const pad = '  '.repeat(indent + 1);
  const closePad = '  '.repeat(indent);
  const required = new Set(node.required ?? []);
  const props = node.properties ?? {};
  const lines = [];

  // Required keys that have no property schema still get emitted as `unknown`.
  for (const key of node.required ?? []) {
    if (!(key in props)) lines.push(`${pad}${quoteKey(key)}: unknown;`);
  }
  for (const [key, sub] of Object.entries(props)) {
    const opt = required.has(key) ? '' : '?';
    lines.push(`${pad}${quoteKey(key)}${opt}: ${tsType(sub, indent + 1)};`);
  }
  return `{\n${lines.join('\n')}\n${closePad}}`;
}

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const quoteKey = (k) => (IDENT.test(k) ? k : JSON.stringify(k));

function iface(name, node, doc) {
  const jsdoc = doc ? `/** ${doc} */\n` : '';
  return `${jsdoc}export interface ${name} ${objectType(node, 0)}\n`;
}

function enumUnion(name, values, doc) {
  const body = values.map((v) => `  | ${lit(v)}`).join('\n');
  const jsdoc = doc ? `/** ${doc} */\n` : '';
  return `${jsdoc}export type ${name} =\n${body};\n`;
}

// --------------------------------------------------------------------------
// rubric.ts — enums lifted verbatim from arrays in rubric-v1.json.
// --------------------------------------------------------------------------
let rubricOut = BANNER;
rubricOut += enumUnion('ProvenanceLabel', rubric.provenance_labels,
  'rubric-v1.json provenance_labels. Every VPS and AWS value is labelled Estimated.');
rubricOut += '\n' + enumUnion('VetoId', rubric.vetoes.map((v) => v.id), 'rubric-v1.json vetoes[].id');
rubricOut += '\n' + enumUnion('VpsCriterionKey', rubric.vps.criteria.map((c) => c.key), 'rubric-v1.json vps.criteria[].key');
writeFileSync(resolve(outDir, 'rubric.ts'), rubricOut);

// --------------------------------------------------------------------------
// events.ts — enums + selected event payload interfaces.
// --------------------------------------------------------------------------
let eventsOut = BANNER;
eventsOut += enumUnion('BreakerState', events.events.SubmissionScored.properties.breaker_state_at_score.enum,
  'events-v1.json contract C. Only `armed` surfaces a VPS number.');
eventsOut += '\n' + enumUnion('VerdictValue', events.events.VerdictIssued.properties.verdict.enum,
  'events-v1.json VerdictIssued.verdict');
eventsOut += '\n' + enumUnion('OutcomeEventType', events.envelope.properties.event_type.enum,
  'events-v1.json envelope.event_type');

for (const name of [
  'SubmissionScored', 'VerdictIssued', 'PerformanceSnapshot',
  'AmplificationAllocated', 'AmplificationSignedOff', 'RightsGrantChanged',
]) {
  const frag = events.events[name];
  eventsOut += '\n' + iface(name, { type: 'object', required: frag.required, properties: frag.properties });
}
writeFileSync(resolve(outDir, 'events.ts'), eventsOut);

// --------------------------------------------------------------------------
// mechanisms.ts — Mechanism + LibraryManifest (resolves the internal $ref).
// --------------------------------------------------------------------------
let mechOut = BANNER;
mechOut += iface('Mechanism', mechanisms.$defs.mechanism);
mechOut += '\n' + iface('LibraryManifest', mechanisms.library_manifest);
mechOut += '\n' + enumUnion('Warrant', mechanisms.$defs.mechanism.properties.warrant.enum,
  'mechanisms-v1.json warrant ladder');
writeFileSync(resolve(outDir, 'mechanisms.ts'), mechOut);

console.log('gen-types: wrote rubric.ts, events.ts, mechanisms.ts to', outDir);
