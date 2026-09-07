# @respin/trends

Scheduler-independent trend-domain contracts for Slice 8. The package has exactly two
sources: YouTube discovery metadata and creator-submitted links. It has no scraper,
caption downloader, database client, scheduler, email sender, or vendor SDK.

YouTube discovery is pinned to the official Data API origin and is metadata/views only.
An API key is not caption authority. Third-party transcript text enters only through the
injected Slice 4 reference-intake port; a quote-budget refusal propagates unchanged.

## Outlier baseline (R5–R7, REQ-E02)

`scoreOutlier` derives the ratio against the channel's own median and DERIVES the data
window from the observations it used: `startsAt` is the earliest selected baseline
publish instant, `endsAt` is the current video's own. The selection rule is the named
constant `BASELINE_RECENT_OBSERVATIONS`, and the scorer applies it ITSELF over the whole
history it is handed: the baseline is the 10 most recently published prior videos of the
channel (by `publishedAt` descending, ties by id) among those published strictly before
the current one and within 90 days of it. A caller cannot choose which ten, in which
order, or how many; an older-than-span video is not selected, while a later-published
video, another channel's, the current video itself or a duplicate is refused. What the
scorer cannot see is a video the caller never passed — a producer's contract test must
show it passes the channel's whole prior history (no producer exists yet). **There is no
minimum n**: a one-video baseline is scored, its `sampleSize` is stored and the feed
displays it; a floor is a stated non-choice until real channel data exists. Those two
numbers are an unmeasured launch choice — no live channel data exists yet (T-15) — and the
constant's docblock carries the revisit trigger. The DB writer (`recordSharedTrendItem` /
`recordPrivateTrendItem`) still accepts the window it is handed; making it refuse a window
that differs from the derivation is recorded as open in
`docs/progress/respin-finish/ledger.md` (2026-09-03).

## Saturation (R7, R-91) — v1 has no method

`measureSaturation` validates a caller-supplied count; **no production code counts a
population over stored rows and no `methodVersion` exists.** Every `trend_items` row the
product can write today is therefore `unmeasured: incomplete_provenance`, which the
storage CHECK and the feed UI render honestly. The `measured` shape is reachable only from
fixtures. A counting query, its population definition and a named method constant are not
built and are not claimed.

## Stale state (R7/R24) — no producer

`trend_items.stale_at` has no writer; `markStale` labels an in-memory candidate only. The
feed reader excludes stale rows (`isNull(staleAt)`), and the page's `stale: false` is a
LITERAL — correct only because the reader has already filtered stale rows out, not because
the page reads the column. So the designed stale state cannot appear until a producer
exists (a refresh that observes a source gone or a niche untracked). Whether a stale item is
then shown with a label or excluded from the feed is recorded here as an open choice, not
decided: today's code excludes, and the literal would become a lie the day the reader
stopped filtering. Recorded, not built.

## Batching placeholder (R19)

For a future documented quota allowance `Q`, one scan's measured endpoint-unit total is
`U`, and `N` niches are requested, the scheduler may admit at most
`floor(Q / U)` scans and must refuse any remainder. This package intentionally supplies
neither `Q` nor `U`: live discovery and quota acceptance are blocked until real API
credentials and quota evidence exist. The production scheduler source therefore applies
an explicit finite niche ceiling and reads one row beyond it; overflow fails closed rather
than silently refreshing only a prefix. The worker drains each admitted batch through a
fixed number of consumers so local queue bounds cannot turn a valid large batch into an
eager-enqueue failure. These controls bound work but do not substitute for measured `Q/U`.
