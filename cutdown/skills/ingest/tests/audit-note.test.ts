import assert from 'node:assert/strict';
import { test, describe } from 'node:test';

import { resolveRights } from '../src/rights.js';

describe('rights — the artefact records WHY a date was discarded', () => {
  test('an unreadable date is named in the committed notes, not only in a warning', () => {
    // Without this, the artefact reads `state: unknown, expiryDate: null` and an
    // auditor cannot tell "nothing was declared" from "something unreadable was
    // declared" — only the second is an operator mistake someone must go fix.
    // The run-time warning answers it in a run-log nobody will still have.
    const resolved = resolveRights(
      { state: 'cleared', owner: 'X', expiryDate: '2024-01-01T00:00:00Z', evidenceUri: 'file:./x' },
      'sidecar',
      'x.mp4',
      new Date('2026-07-21T00:00:00Z'),
    );
    assert.equal(resolved.record.state, 'unknown');
    assert.equal(resolved.record.expiryDate, null);
    assert.match(resolved.record.notes ?? '', /2024-01-01T00:00:00Z/);
  });

  test('an operator note is preserved alongside the appended reason', () => {
    const resolved = resolveRights(
      { state: 'cleared', owner: 'X', expiryDate: 20240101 as never, notes: 'Supplied by the client.' },
      'sidecar',
      'x.mp4',
      new Date('2026-07-21T00:00:00Z'),
    );
    assert.match(resolved.record.notes ?? '', /Supplied by the client\./);
    assert.match(resolved.record.notes ?? '', /Unreadable date/);
  });

  test('a clean record gets no appended note', () => {
    const resolved = resolveRights(
      { state: 'cleared', owner: 'X', expiryDate: '2030-01-01', notes: 'All good.' },
      'sidecar',
      'x.mp4',
      new Date('2026-07-21T00:00:00Z'),
    );
    assert.equal(resolved.record.notes, 'All good.');
  });
});
