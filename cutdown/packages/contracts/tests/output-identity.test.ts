import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  comparePackages,
  evidenceGaps,
  outputKeyOf,
  outputKeyString,
  resolveOutputs,
  type ContentPackage,
  type LoadedPackages,
} from '../src/output-identity.js';

/**
 * Output identity and supersession (Stage 0B task 8).
 *
 * Every test here is an eviction the composite key exists to prevent, or a
 * behaviour the module's docstring claims — a comment asserting a property is not
 * the property, so each claim is driven from an input that would produce a
 * different answer if the claim were false.
 *
 * The packages are built in memory rather than written to disk: this module never
 * reads the filesystem (its caller does), and a disk fixture would test the caller.
 * The real corpus IS driven, from the real producer's artefacts, in
 * `apps/cli/tests/output-identity-real.test.ts` — that direction is forced, because
 * `loadAllPackages` lives in `apps/cli` and `packages/contracts` cannot import it.
 */

const H = (c: string) => ({ algorithm: 'sha256' as const, value: c.repeat(64).slice(0, 64) });

interface Overrides {
  readonly id: string;
  readonly createdAt?: string;
  readonly jobId?: string;
  readonly accountId?: string;
  readonly creativeBriefId?: string;
  readonly sourceClassification?: 'real' | 'fixture';
  /** Anything but `cleared` makes the package evidence-INCOMPLETE (the one live gap). */
  readonly weakestRightsState?: 'cleared' | 'unknown' | 'restricted' | 'expired';
}

/** A 26-character ULID-shaped id, so the ULID tiebreak is exercised on realistic values. */
function ulid(seed: string): string {
  return `01KZ${seed.toUpperCase().padStart(22, '0')}`;
}

/**
 * One complete ContentPackage. Typed, not cast: the fields this module reads are
 * four, and a fixture that only carried those four would keep compiling if the
 * resolver started reading a fifth.
 */
function pkg(o: Overrides): ContentPackage {
  const id = ulid(o.id);
  return {
    contentPackageId: id,
    envelope: {
      schemaVersion: '1.0.0',
      createdAt: o.createdAt ?? '2026-07-01T00:00:00.000Z',
      createdBy: { kind: 'skill', skill: 'package', skillVersion: '1.0.0' },
    },
    jobId: o.jobId ?? 'job-a',
    accountId: o.accountId ?? 'acct-001',
    releaseState: 'rights_approved',
    sourceClassification: o.sourceClassification ?? 'real',
    approval: {
      reviewDecisionId: ulid(`rv${o.id}`),
      decidedBy: 'Fred Wang',
      decidedAt: '2026-06-30T02:00:00.000Z',
      subjectDraftRenderId: ulid(`rd${o.id}`),
      subjectRenderManifestId: ulid(`rm${o.id}`),
    },
    lineage: {
      briefId: ulid(`jb${o.id}`),
      creativeBriefId: o.creativeBriefId ?? ulid('cb1'),
      storyPlanId: ulid(`sp${o.id}`),
      edlId: ulid(`ed${o.id}`),
      finalRenderId: ulid(`rf${o.id}`),
      finalRenderManifestId: ulid(`rn${o.id}`),
      approvedDraftManifestId: ulid(`rq${o.id}`),
      editorialPlanHash: H('c'),
      planHash: H('d'),
    },
    master: {
      path: 'master.mp4',
      contentHash: H('e'),
      byteSize: 1000,
      container: 'mp4',
      durationMs: 4000,
      dimensions: { width: 720, height: 1280 },
      burnedInCaptions: true,
    },
    captions: { srtPath: 'captions.srt', vttPath: 'captions.vtt', cueCount: 2 },
    cover: {
      coverImagePath: 'cover.png',
      firstFramePath: 'first-frame.png',
      coverSource: { kind: 'defaulted_to_first_frame', reason: 'no cover declared' },
    },
    rightsManifest: {
      rightsManifestId: ulid(`rg${o.id}`),
      assets: [
        {
          assetId: ulid(`as${o.id}`),
          relativePath: 'clean.mp4',
          sourceClassification: o.sourceClassification ?? 'real',
          contentHash: H('f'),
          rights: {
            state: 'cleared',
            owner: 'Social Soup',
            supplier: 'Social Soup',
            permittedPlatforms: ['tiktok'],
            territories: ['AU'],
            campaignStart: '2026-07-01',
            campaignEnd: '2026-12-31',
            expiryDate: '2026-12-31',
            talentReleaseStatus: 'obtained',
            locationReleaseStatus: 'not_required',
            musicStatus: 'none',
            editingPermitted: true,
            paidAmplificationPermitted: false,
            evidenceUri: 'file:///permissions/clean.mp4.release.pdf',
            notes: null,
          },
        },
      ],
      weakestState: o.weakestRightsState ?? 'cleared',
      allEvidenced: true,
    },
    disclosures: {
      paidPartnership: false,
      aiGeneratedOrAltered: false,
      ownedBusinessPromotion: true,
      thirdPartyPromotion: false,
      affiliateRelationship: false,
      regulatedCategory: null,
    },
    aiAlterationRecord: { operations: ['selection'], materialAlteration: false, capturedAtIntake: false },
    qa: {
      qaReportId: ulid(`qr${o.id}`),
      gateStatus: 'pass',
      rulesetVersion: '1.0.0',
      blockerCount: 0,
      warningCount: 0,
      waivers: [],
    },
    rangeValidation: {
      qaReportId: ulid(`qr${o.id}`),
      checkId: 'source_range_validity',
      status: 'ran',
      rangeCount: 3,
      violationCount: 0,
    },
    contractSet: [
      {
        schemaId: 'https://cutdown.local/contracts/schemas/content-package-v1.json',
        majorVersion: 1,
        schemaVersion: '1.0.0',
        contentHash: H('a'),
      },
    ],
    provenance: {
      renderer: { name: 'renderer-ffmpeg', version: '1.0.0' },
      ffmpegVersion: 'ffmpeg version 8.0.1',
      determinismTier: 1,
      qaRulesetVersion: '1.0.0',
      modelProvenance: {
        provider: 'anthropic',
        modelId: 'claude-sonnet-5',
        promptTemplateId: 'plan-edl',
        promptTemplateVersion: '1.0.0',
      },
      styleProfile: { kind: 'none', reason: 'no profile recorded at Phase 0' },
      platformCapability: { platform: 'tiktok', surface: 'organic-video', overlayVersion: '2026-07' },
      fonts: [{ family: 'Inter', role: 'caption', contentHash: H('f'), licenceNote: 'OFL 1.1' }],
    },
  };
}

function loaded(packages: readonly ContentPackage[], unreadable: LoadedPackages['unreadable'] = []): LoadedPackages {
  return { packages, unreadable };
}

/** The resolved arm, or a failure naming what came back instead. */
function resolved(input: LoadedPackages) {
  const result = resolveOutputs(input);
  ok(result.kind === 'resolved', `expected a resolved answer, got ${result.kind}`);
  return result;
}

const ids = (packages: readonly ContentPackage[]): string[] => packages.map((p) => p.contentPackageId);

describe('resolveOutputs — one approved cut per CreativeBrief (T-1)', () => {
  test('two packages of one CreativeBrief count once, and the LATER one survives', () => {
    const earlier = pkg({ id: 'a', createdAt: '2026-07-01T00:00:00.000Z' });
    const later = pkg({ id: 'b', createdAt: '2026-07-02T00:00:00.000Z' });

    // Fed in reverse order: the answer is the total order's, not the array's.
    const result = resolved(loaded([later, earlier]));
    strictEqual(result.outputs.length, 1, 'one CreativeBrief in one job for one account is ONE output');
    strictEqual(result.outputs[0]?.survivor.contentPackageId, later.contentPackageId);
    deepStrictEqual(ids(result.outputs[0]?.superseded ?? []), [earlier.contentPackageId], 'the superseded package is NAMED, not just counted');
  });

  test('the ULID breaks a timestamp tie, so "latest" is never the array order', () => {
    const lowId = pkg({ id: 'a', createdAt: '2026-07-01T00:00:00.000Z' });
    const highId = pkg({ id: 'z', createdAt: '2026-07-01T00:00:00.000Z' });
    strictEqual(resolved(loaded([lowId, highId])).outputs[0]?.survivor.contentPackageId, highId.contentPackageId);
    strictEqual(resolved(loaded([highId, lowId])).outputs[0]?.survivor.contentPackageId, highId.contentPackageId);
  });

  test('an unparseable createdAt can never become the latest', () => {
    // comparePackages sorts an unparseable instant FIRST for exactly this reason: a
    // hand-authored `createdAt: "yesterday"` must not be able to win the group.
    const good = pkg({ id: 'a', createdAt: '2026-07-01T00:00:00.000Z' });
    const junk = pkg({ id: 'z', createdAt: 'yesterday' });
    strictEqual(resolved(loaded([junk, good])).outputs[0]?.survivor.contentPackageId, good.contentPackageId);
  });

  test('an offset timestamp is compared as an INSTANT, not as a string', () => {
    // `2026-07-31T04:00:00+10:00` is 18:00Z on the 30th — genuinely EARLIER than
    // `2026-07-30T20:00:00Z` while sorting later lexically.
    const laterInstant = pkg({ id: 'a', createdAt: '2026-07-30T20:00:00.000Z' });
    const earlierWithOffset = pkg({ id: 'z', createdAt: '2026-07-31T04:00:00+10:00' });
    strictEqual(
      resolved(loaded([laterInstant, earlierWithOffset])).outputs[0]?.survivor.contentPackageId,
      laterInstant.contentPackageId,
    );
  });

  test('outputs come back in force order, so a caller can take the last N', () => {
    const first = pkg({ id: 'a', createdAt: '2026-07-01T00:00:00.000Z', creativeBriefId: ulid('cb1') });
    const second = pkg({ id: 'b', createdAt: '2026-07-02T00:00:00.000Z', creativeBriefId: ulid('cb2') });
    const third = pkg({ id: 'c', createdAt: '2026-07-03T00:00:00.000Z', creativeBriefId: ulid('cb3') });
    const result = resolved(loaded([third, first, second]));
    deepStrictEqual(
      result.outputs.map((o) => o.survivor.contentPackageId),
      [first, second, third].map((p) => p.contentPackageId),
    );
  });
});

describe('the composite key — every component prevents a named eviction', () => {
  test('packages in different jobs never merge', () => {
    // `loadAllPackages` walks EVERY job, so a bare creativeBriefId key groups across
    // them. Same brief, same account, same class — only the job differs.
    const a = pkg({ id: 'a', jobId: 'job-a', createdAt: '2026-07-01T00:00:00.000Z' });
    const b = pkg({ id: 'b', jobId: 'job-b', createdAt: '2026-07-02T00:00:00.000Z' });
    const result = resolved(loaded([a, b]));
    strictEqual(result.outputs.length, 2, 'two jobs are two outputs; neither package supersedes the other');
    deepStrictEqual(result.outputs.flatMap((o) => ids(o.superseded)), []);
  });

  test('packages under different accountIds never merge', () => {
    // Criterion 1 builds its account tally from the survivors, so a cross-account
    // merge would silently REMOVE an account from the count.
    const a = pkg({ id: 'a', accountId: 'acct-001', createdAt: '2026-07-01T00:00:00.000Z' });
    const b = pkg({ id: 'b', accountId: 'acct-002', createdAt: '2026-07-02T00:00:00.000Z' });
    const result = resolved(loaded([a, b]));
    strictEqual(result.outputs.length, 2);
    deepStrictEqual(
      [...new Set(result.outputs.map((o) => o.key.accountId))].sort(),
      ['acct-001', 'acct-002'],
      'both accounts survive into the resolved set',
    );
  });

  test('a fixture never supersedes a real output, even when it is later', () => {
    // D-36 makes sourceClassification solely responsible for keeping fixtures out of
    // exit evidence. The fixture here is LATER and shares everything else, so a
    // class-blind resolver would evict the real output from the Phase 0 count.
    const real = pkg({ id: 'a', sourceClassification: 'real', createdAt: '2026-07-01T00:00:00.000Z' });
    const fixture = pkg({ id: 'b', sourceClassification: 'fixture', createdAt: '2026-07-02T00:00:00.000Z' });
    const result = resolved(loaded([real, fixture]));
    strictEqual(result.outputs.length, 2);
    const realOutputs = result.outputs.filter((o) => o.key.sourceClassification === 'real');
    strictEqual(realOutputs.length, 1, 'the real output is still there');
    strictEqual(realOutputs[0]?.survivor.contentPackageId, real.contentPackageId);
    deepStrictEqual(realOutputs[0]?.superseded, [], 'a fixture is not something a real output can be superseded by');
  });

  test('a delimiter inside an id cannot forge membership of another group', () => {
    // The key is composed with JSON.stringify precisely because accountId and jobId
    // are free strings. Under a `|` join these two would collide into one group and
    // one of them would vanish from the count.
    const a = pkg({ id: 'a', accountId: 'x', jobId: 'y|z', createdAt: '2026-07-01T00:00:00.000Z' });
    const b = pkg({ id: 'b', accountId: 'x|y', jobId: 'z', createdAt: '2026-07-02T00:00:00.000Z' });
    strictEqual(resolved(loaded([a, b])).outputs.length, 2);
    ok(outputKeyString(outputKeyOf(a)) !== outputKeyString(outputKeyOf(b)));
  });
});

describe('population — resolution runs over the evidence-complete set', () => {
  test('an evidence-incomplete package never supersedes a complete one', () => {
    // The count would go 1 → 0: the incomplete package is later, so a resolver that
    // grouped it would make it the survivor, and criterion 1 counts survivors.
    const complete = pkg({ id: 'a', createdAt: '2026-07-01T00:00:00.000Z' });
    const incomplete = pkg({ id: 'b', createdAt: '2026-07-02T00:00:00.000Z', weakestRightsState: 'restricted' });
    ok(evidenceGaps(incomplete).length > 0, 'the fixture is genuinely incomplete, or this test proves nothing');

    const result = resolved(loaded([complete, incomplete]));
    strictEqual(result.outputs.length, 1);
    strictEqual(result.outputs[0]?.survivor.contentPackageId, complete.contentPackageId);
    deepStrictEqual(result.outputs[0]?.superseded, [], 'an incomplete package supersedes nothing');
  });

  test('an excluded package is NAMED with its gaps, never silently dropped', () => {
    const incomplete = pkg({ id: 'b', weakestRightsState: 'restricted' });
    const result = resolved(loaded([pkg({ id: 'a' }), incomplete]));
    deepStrictEqual(ids(result.excludedIncomplete.map((e) => e.pkg)), [incomplete.contentPackageId]);
    deepStrictEqual(result.excludedIncomplete[0]?.gaps, ['weakest rights state is "restricted"']);
  });

  test('the filter is INSIDE resolveOutputs, so a caller passing raw packages gets the same answer', () => {
    // Stage 1's cohorts and Stage 6's denominators call this with raw loader output.
    // If the filter lived in status.ts, they would get a different count than
    // `status --phase0` prints — one implementation with two answers.
    const complete = pkg({ id: 'a', createdAt: '2026-07-01T00:00:00.000Z' });
    const incomplete = pkg({ id: 'b', createdAt: '2026-07-02T00:00:00.000Z', weakestRightsState: 'unknown' });
    const rawAnswer = resolved(loaded([complete, incomplete]));
    const preFilteredAnswer = resolved(loaded([complete, incomplete].filter((p) => evidenceGaps(p).length === 0)));
    deepStrictEqual(
      rawAnswer.outputs.map((o) => o.survivor.contentPackageId),
      preFilteredAnswer.outputs.map((o) => o.survivor.contentPackageId),
    );
  });
});

describe('an unreadable file makes resolution indeterminate', () => {
  test('any unreadable package makes the whole answer indeterminate', () => {
    // reviews.ts:352's rule, for its reason: the SET is what determines "latest", so
    // an incomplete set cannot determine it. The readable packages here would resolve
    // cleanly, which is exactly the case that must still refuse.
    const result = resolveOutputs(
      loaded([pkg({ id: 'a' })], [{ path: 'job-x/packages/01KZ/package.json', reason: 'not valid JSON: Unexpected end of JSON input' }]),
    );
    strictEqual(result.kind, 'indeterminate');
    ok(result.kind === 'indeterminate');
    deepStrictEqual(result.unreadable.map((u) => u.path), ['job-x/packages/01KZ/package.json']);
  });

  test('the indeterminate arm carries the reason, so the operator has something to fix', () => {
    const result = resolveOutputs(loaded([], [{ path: 'job-x/packages/01KZ/package.json', reason: 'the package directory holds no package.json' }]));
    ok(result.kind === 'indeterminate');
    strictEqual(result.unreadable[0]?.reason, 'the package directory holds no package.json');
  });
});

describe('anomalies are reported, never resolved away', () => {
  test('a creativeBriefId spanning two jobs is reported', () => {
    // The key already refused the merge — and that refusal is silent. It splits one
    // output into two, inflating the count.
    const a = pkg({ id: 'a', jobId: 'job-a', createdAt: '2026-07-01T00:00:00.000Z' });
    const b = pkg({ id: 'b', jobId: 'job-b', createdAt: '2026-07-02T00:00:00.000Z' });
    const result = resolved(loaded([a, b]));
    const anomalies = result.anomalies.filter((anomaly) => anomaly.kind === 'creative-brief-spans-jobs');
    strictEqual(anomalies.length, 1);
    deepStrictEqual(anomalies[0]?.values, ['job-a', 'job-b']);
    deepStrictEqual(anomalies[0]?.contentPackageIds, [a.contentPackageId, b.contentPackageId], 'every package involved is named');
    ok(anomalies[0]?.detail.includes('rather than one'), 'the report says what it costs the count');
  });

  test('a creativeBriefId spanning two accounts is reported', () => {
    // Worse than the job case: it also adds an account to criterion 1's tally,
    // moving that criterion TOWARD green.
    const result = resolved(loaded([pkg({ id: 'a', accountId: 'acct-001' }), pkg({ id: 'b', accountId: 'acct-002' })]));
    const anomalies = result.anomalies.filter((a) => a.kind === 'creative-brief-spans-accounts');
    strictEqual(anomalies.length, 1);
    deepStrictEqual(anomalies[0]?.values, ['acct-001', 'acct-002']);
    ok(anomalies[0]?.detail.includes('account tally'));
  });

  test('a brief spanning both a job and an account is reported twice, once per kind', () => {
    const result = resolved(loaded([pkg({ id: 'a', jobId: 'job-a', accountId: 'acct-001' }), pkg({ id: 'b', jobId: 'job-b', accountId: 'acct-002' })]));
    deepStrictEqual(result.anomalies.map((a) => a.kind), ['creative-brief-spans-accounts', 'creative-brief-spans-jobs']);
  });

  test('the ordinary supersession case reports NO anomaly', () => {
    // A report that fires on the normal case is noise, and noise gets ignored.
    const result = resolved(loaded([pkg({ id: 'a', createdAt: '2026-07-01T00:00:00.000Z' }), pkg({ id: 'b', createdAt: '2026-07-02T00:00:00.000Z' })]));
    strictEqual(result.outputs.length, 1);
    deepStrictEqual(result.anomalies, []);
  });

  test('a fixture and a real package sharing a brief is not an anomaly', () => {
    // Anomaly detection runs within a class, matching resolution: the counts these
    // anomalies distort are per-class, and this pair is the fixture-eviction case the
    // key already handles — reporting it would be a false alarm on a legal state.
    const result = resolved(
      loaded([pkg({ id: 'a', sourceClassification: 'real' }), pkg({ id: 'b', sourceClassification: 'fixture' })]),
    );
    strictEqual(result.outputs.length, 2);
    deepStrictEqual(result.anomalies, []);
  });
});

describe('the relocated symbols keep their behaviour', () => {
  test('comparePackages is a total order over the pair (instant, ULID)', () => {
    const a = pkg({ id: 'a', createdAt: '2026-07-01T00:00:00.000Z' });
    const b = pkg({ id: 'b', createdAt: '2026-07-01T00:00:00.000Z' });
    strictEqual(comparePackages(a, a), 0);
    strictEqual(comparePackages(a, b) < 0, true);
    strictEqual(comparePackages(b, a) > 0, true);
    // Antisymmetric even between two unparseable instants — otherwise a sort's
    // answer depends on the input order.
    const junk1 = pkg({ id: 'a', createdAt: 'nonsense' });
    const junk2 = pkg({ id: 'b', createdAt: 'also nonsense' });
    strictEqual(comparePackages(junk1, junk2) < 0, true);
    strictEqual(comparePackages(junk2, junk1) > 0, true);
  });

  test('evidenceGaps reports the one gap that survives contract validation', () => {
    deepStrictEqual(evidenceGaps(pkg({ id: 'a' })), []);
    deepStrictEqual(evidenceGaps(pkg({ id: 'a', weakestRightsState: 'expired' })), ['weakest rights state is "expired"']);
  });

  test('outputKeyOf reads the four key components and nothing else', () => {
    deepStrictEqual(outputKeyOf(pkg({ id: 'a', jobId: 'job-q', accountId: 'acct-9', creativeBriefId: ulid('cbx') })), {
      sourceClassification: 'real',
      accountId: 'acct-9',
      jobId: 'job-q',
      creativeBriefId: ulid('cbx'),
    });
  });
});
