import { strictEqual } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { PLATFORM_EDL_SCHEMA_VERSION } from '../src/versions.js';

// The constant exists so producers stamp truthful envelopes; this test exists
// so the constant cannot drift from the schema it describes. A version bump
// that misses versions.ts fails here instead of shipping a false claim.
test('PLATFORM_EDL_SCHEMA_VERSION matches the schema file', () => {
  // Compiled tests run from dist/tests/, so the source schemas dir is two up.
  const schema = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', '..', 'schemas', 'platform-edl-v1.json'), 'utf8'),
  ) as { schemaVersion?: string };
  strictEqual(PLATFORM_EDL_SCHEMA_VERSION, schema.schemaVersion);
});
