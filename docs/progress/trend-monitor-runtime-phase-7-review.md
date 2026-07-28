# Phase 7 review — Live Fetch Adapters + Trend-path Allowlist

**Readiness: Ready.** Entry gate green (pytest **372/372**, ruff clean); all three Critical-Path gates **PASS (A)** after one fix round; Definition of Done met. This card is the proof Phase 8's dependency gate reads.

## What shipped
The fake `RawVolumeFetch` is now swappable for six concrete **keyless** live fetchers behind the unchanged port, gated by a host-pinned, deny-by-default trend-path allowlist that is structurally incapable of widening exemplar-media rights.

- `adapters/allowlist.py` (NEW) — `TrendSource` (validates https + template-host == pinned-host at load), `TrendAllowlist.require`/`check_url` (construction- **and** request-time enforcement; `check_url` pins scheme + host **+ port**), duplicate-name refusal at load, `load_trend_allowlist`. Reads the `trend_sources:` key — a top-level section **structurally disjoint** from the `sources:` key `extraction/acquire.py` reads for media rights.
- `adapters/http.py` (NEW) — `KeylessHttpClient`: stdlib `urllib` only, https-only default cert verification, redirects **refused** (`_NoRedirect`), 5 MB bounded read (no `Accept-Encoding`), 3-attempt bounded retry with backoff (4xx never retried), per-host 1 s pacing; opener/clock/sleeper all injectable (network-free tests).
- `adapters/fetchers.py` (NEW) — one fetcher per source (wikipedia absolute views; hn/reddit/rss/youtube/google_trends counts). `quote(term, safe="")` strict encoding; whole-payload DTD/ENTITY refusal; `json` non-finite (`NaN`/`Infinity`/`1e400→inf`) refusal; exactly one `client.get` per call; **exclude-and-surface** (never abort) on a missing allowlist entry.
- `config/source-allowlist.yaml` — `trend_sources:` section (6 entries; version bumped; **tiktok deliberately absent** — human-in-the-loop, never crawled).
- `detector/run.py` — `--fetchers live` wiring (fresh allowlist + client; construction-time enforcement before any fetch).
- `tests/Architecture/test_trend_fetchers.py` — 33 tests (22 initial + 11 round-2 regression).

## Gate outcomes (round 1 → round 2)

| Gate | Round 1 | Round 2 | Blocking findings, all closed + test-locked |
|---|---|---|---|
| Security | NEEDS CHANGES (B) | **PASS (A)** | DTD 64 KB-window bypass → whole-payload scan; path-slot hostile-term test; port pin; NaN/Infinity refusal; abort→exclude |
| Boundaries | NEEDS CHANGES (B) | **PASS (A)** | build_live_fetchers abort→exclude (R4); construction-refusal tested through the entrypoint; port pin; all-six-host disjointness proof; duplicate-name refusal |
| Measurement | NEEDS CHANGES (B) | **PASS (A)** | hacker_news dishonest "stable" claim → names 1000-hit truncation; google_trends geo/inertness docs; assemble.py stale rationale de-phantomed |

Zero BLOCK at any point. Security round-2 independently confirmed the `1e400 → inf` overflow path that `parse_constant` alone misses but the explicit finite-guard catches. Measurement round-2 verified google_trends' structural inertness **against the detector** (single-fetch window < `MIN_BASELINE_POINTS=14` → `z=None` → no candidate/alert/vote), not just from the docstring. Boundaries confirmed the exclude-don't-abort rewrite preserves deny-by-default via triple gating (not-built / closure `require` / request-time `check_url`) and the D5 legal gate stays closed for all six hosts.

## Accepted-with-rationale residuals (non-blocking; carried forward)
- **Slowloris total-response deadline** (Security LOW): `TIMEOUT_SECONDS` bounds connect/per-recv, not total time. Availability-only against TLS-verified allowlisted hosts; bounded read + 3-attempt cap bound the blast radius. Chunked-read deadline deferred.
- **Excluded-source durability** (Boundaries NOTE): a source missing its allowlist entry surfaces on **stderr** + platform-level coverage; a sibling source on the same platform masks the source-level exclusion in the durable `ScanResult`. Honest and Phase-5-consistent (no fabrication, degrades safe); echoing the exclusion into the durable coverage artefact is a future refinement.
- **google_trends liveness claim** (Measurement/Boundaries NOTE): counts as live `open_web` coverage while structurally inert — safe today because three genuine detecting siblings cover `open_web`; if they were ever removed the "honest liveness" line would become a false coverage claim. **Candidate for a standing test in a later phase.**
- **reddit/hn drop-boundary-day + youtube word-boundary match** (Measurement NOTEs): feed truncation is censoring not rescaling, but the dominant failure is conservative under median/MAD (fewer baseline points → `z=None` → missed trend, never a fabricated spike); youtube substring is a conservative extra filter on an already query-filtered feed.

## Definition of Done
- ✅ Entry gate: schemas parse; pytest 372/372; ruff clean. (No C#/frontend/schema-JSON files in the diff — those gates n/a; `source-allowlist.yaml` is not one of the three rule-9 versioned schemas, so no C#-mirror bump owed.)
- ✅ All three applicable Critical-Path gates PASS.
- ✅ Docs consistent: ADR-0009 invariant 6 + `integration-contract.md` runtime note + yaml header document the reconciliation; D5-owning enforcement (`acquire.py`, `exemplar.py`) unchanged as R4 requires.
- ✅ Acceptance criteria (R1–R7) met; no real network in tests.
