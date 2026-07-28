"""Phase 9 — merging the human submission loop into the feed.

Three one-way flows from the (internal-staff) submission book into the trend surface, none of which
lets untrusted submission content (`rationale`, `evidence_uris`) or a submitter's own `forecast`
reach a decision:

* **term admission** (:func:`admit_submission_terms`, registry-side) — every open submission admits
  its ``label`` as a ``HUMAN_SUBMISSION`` term so the scanner tracks it;
* **confidence upgrade** (inside :func:`merge_resolutions`, signal-side) — a resolved submission
  that **predated automated detection** upgrades the matching automated signal to
  ``human_corroborated``;
* **submission-born signals** (inside :func:`merge_resolutions`) — on a platform with no automated
  series, a resolved submission mints a ``human_sourced`` signal whose stage is the independent
  resolver's ``observed_class`` (never the submitter's forecast).

**Anti-gaming anchor (R1).** The *confidence-upgrade* gate compares ``submitted_at`` against the
persisted ``first_detected_at`` automated-detection anchor (the Phase 4 identity index), never the
resolver-supplied ``corroboration_date`` and never the data-derived ``first_seen``/``start_day`` (a
date recomputed from revisable source data would make the anchor itself gameable). A post-hoc "me
too" submission (``submitted_at >= first_detected_at``) earns no upgrade.

  *Scope of that claim:* this governs the **upgrade gate only**. Submitter *credit* is still scored
  inside ``SubmissionBook.resolve`` from a caller-supplied ``corroboration_date``; binding credit to
  the persisted anchor is an **open deferral**, not something this module does.

**The NDJSON book is UNTRUSTED input (R1/R2).** ``load_submission_book`` is a replay — it restores
rows directly and deliberately does *not* re-run ``submit``/``resolve`` business logic, and the file
is trusted-by-position (anyone who can write it can append a row). So every authority this merge
depends on is **re-asserted here, at the point of use**, never assumed from the writer:

* **staff-only scope** — only ``manager``/``resolver`` submissions may mint public, tenant-neutral
  state. REQ-005a also permits a **client** role to submit; a client submission is tenant-originated
  and would need the internal-scope rule R1 names as a precondition, so it is **refused here**
  (fail-closed) rather than silently published as public. Without this gate a client's label would
  enter the shared ``TermRegistry`` (which Phase 8 uses to steer the tenant-neutral corpus) and mint
  a signal every tenant can read — a tenancy widening needing no override, just an absent check;
* **resolver independence** — a resolution whose ``resolver_id`` equals the submitter is skipped, so
  a submitter can never set the stage that drives verdicts and corpus direction (REQ-005b);
* **stage validity** — ``observed_class`` is validated against :data:`VALIDITY_STAGES` before use.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID

from c1_pattern_engine.detector.archive import TrendSignalStore
from c1_pattern_engine.detector.assemble import (
    VALIDITY_STAGES,
    signal_id,
    validity_horizon_days,
)
from c1_pattern_engine.detector.identity import IdentityIndex, SignalIdentity
from c1_pattern_engine.detector.signals import TrendSignal
from c1_pattern_engine.registry.terms import AdmissionOrigin, TermRegistry, TrackedTerm
from c1_pattern_engine.submissions.submit import SubmissionBook, TrendSubmission

__all__ = [
    "INTERNAL_SUBMISSION_ROLES",
    "ResolutionMergeResult",
    "admit_submission_terms",
    "merge_resolutions",
    "open_submissions_by_platform",
]

_LOG = logging.getLogger(__name__)

# Only these roles may mint PUBLIC, tenant-neutral state from a submission. REQ-005a also permits a
# `client` role to submit; such a submission is tenant-originated, and R1 puts it out of scope until
# an internal-scope rule exists — so it is refused here rather than published as public.
INTERNAL_SUBMISSION_ROLES: frozenset[str] = frozenset({"manager", "resolver"})


def _is_staff(sub: TrendSubmission) -> bool:
    return sub.role in INTERNAL_SUBMISSION_ROLES


@dataclass(frozen=True, slots=True)
class ResolutionMergeResult:
    """What the signal-side merge changed this run."""

    upgraded_signal_ids: tuple[UUID, ...]
    born_signal_ids: tuple[UUID, ...]


def open_submissions_by_platform(book: SubmissionBook) -> dict[str, int]:
    """Open-submission counts per platform — the coverage input that surfaces "a human is watching
    here" even where no signal exists yet (Phase 9 R3).

    Staff-gated like the other two use sites: the coverage report is **shared, tenant-neutral
    output**, so a tenant-originated (client) submission must not appear in it — and counting one
    would also advertise human watching on the strength of a submission this merge has already
    decided it will never act on.
    """
    counts: dict[str, int] = {}
    for sub in book.open_submissions():
        if not _is_staff(sub):
            continue
        counts[sub.platform] = counts.get(sub.platform, 0) + 1
    return counts


def admit_submission_terms(
    book: SubmissionBook, registry: TermRegistry, *, as_of: datetime
) -> list[str]:
    """Registry-side merge: every OPEN submission admits its ``label`` as a ``HUMAN_SUBMISSION``
    term (weight 1.0 — the highest lead-time signal, ADR-0004 §3), so the scanner tracks it.
    Idempotent (``admit`` refreshes an existing key). Returns the labels admitted."""
    admitted: list[str] = []
    for sub in book.open_submissions():
        if not _is_staff(sub):
            # The TermRegistry is SHARED, tenant-neutral state Phase 8's coupling uses to steer the
            # exemplar corpus. A tenant-originated (client) submission must not enter it — refuse
            # rather than widen (CLAUDE.md rule 8; R1's internal-scope rule is the precondition).
            _LOG.warning(
                "SUBMISSION_ROLE_REFUSED submission=%s role=%r: only %s may admit shared terms.",
                sub.id,
                sub.role,
                sorted(INTERNAL_SUBMISSION_ROLES),
            )
            continue
        registry.admit(
            TrackedTerm(
                term=sub.label,
                vertical=sub.vertical,
                platform=sub.platform,
                origin=AdmissionOrigin.HUMAN_SUBMISSION,
                admitted_at=as_of,
                last_activity_at=as_of,
                kind=sub.kind,
            )
        )
        admitted.append(sub.label)
    return admitted


def merge_resolutions(
    book: SubmissionBook,
    *,
    store: TrendSignalStore,
    identity_index: IdentityIndex,
    as_of: datetime,
) -> ResolutionMergeResult:
    """Signal-side merge: for each non-void resolution, either upgrade the matching automated
    signal's confidence (if the submission predated automated detection) or mint a submission-born
    ``human_sourced`` signal (if no automated series exists). Idempotent: an already-upgraded signal
    is left alone and a born signal has a deterministic id, so a re-run neither double-counts nor
    duplicates."""
    upgraded: list[UUID] = []
    born: list[UUID] = []

    for res in book.resolutions():
        if res.void:
            continue
        try:
            sub = book.get(res.submission_id)
        except KeyError:
            # Orphan row (a rotated/truncated NDJSON). Skip and log — one malformed line must not
            # halt the nightly scan.
            _LOG.warning(
                "SUBMISSION_ORPHAN_RESOLUTION submission=%s: no matching submission; skipped.",
                res.submission_id,
            )
            continue

        # --- authorities re-asserted at the point of use (the NDJSON replay enforces none) -------
        if not _is_staff(sub):
            _LOG.warning(
                "SUBMISSION_ROLE_REFUSED submission=%s role=%r: only %s may mint public signals.",
                sub.id,
                sub.role,
                sorted(INTERNAL_SUBMISSION_ROLES),
            )
            continue
        if res.resolver_id == sub.submitter_id:
            # REQ-005b: a submitter may never resolve their own submission. SubmissionBook.resolve
            # enforces this, but load_submission_book is a REPLAY that bypasses it — so without this
            # line a hand-written row lets a submitter's own unverified claim set the lifecycle
            # stage that drives verdicts and corpus direction.
            _LOG.warning(
                "SUBMISSION_SELF_RESOLUTION_SKIPPED submission=%s submitter=%s: void on merge.",
                sub.id,
                sub.submitter_id,
            )
            continue
        if res.observed_class not in VALIDITY_STAGES:
            # Untrusted, unvalidated str: a typo or a non-birth stage ("candidate"/"archived") would
            # otherwise raise mid-run or mint a dead-on-arrival signal.
            _LOG.warning(
                "SUBMISSION_BAD_OBSERVED_CLASS submission=%s observed_class=%r: skipped.",
                sub.id,
                res.observed_class,
            )
            continue

        identity = SignalIdentity(
            scope="public",
            tenant_id=None,
            platform=sub.platform,
            vertical=sub.vertical,
            term=sub.label,
        )
        record = identity_index.get(identity)

        existing: TrendSignal | None = None
        if record is not None:
            try:
                existing = store.get(record.signal_id)
            except KeyError:
                existing = None  # index ahead of a rebuilt/partial store

        if existing is not None:
            if not existing.is_archived:
                # Corroboration UPGRADE — gated on the submission PREDATING automated detection,
                # measured against the persisted first_detected_at anchor (never the resolution's
                # own corroboration_date, never a data-derived first_seen). Post-hoc → no upgrade.
                # A None anchor means no automated detection has happened, so nothing can be
                # predated: fail closed, no upgrade.
                anchor = record.first_detected_at
                if (
                    anchor is not None
                    and sub.submitted_at < anchor
                    and existing.confidence != "human_corroborated"
                ):
                    store.upgrade_confidence(existing.id, to="human_corroborated")
                    upgraded.append(existing.id)
            # Known identity — live OR archived. Never mint a human_sourced born signal over a
            # trend that already has an episode: its origin is however it first came to exist, and a
            # fresh born signal would both mislabel the origin and drop a second resolution sample
            # into the other pool for one real trend.
            continue

        # --- Submission-BORN signal: no prior episode for this identity at all -------------------
        # (a closed platform with no automated series). The INDEPENDENT resolver's observed_class
        # sets the stage — never the submitter's unverified forecast. Public-scope, human_sourced,
        # first_seen = submitted_at.date() (the earliest evidenced human sighting).
        first_seen = sub.submitted_at.date()
        stage = res.observed_class
        # Documented valid_to rule: first_seen + the same lifecycle horizon automated signals use
        # (rising ⇒ long/21d, peak|declining ⇒ short/7d), shared via validity_horizon_days so the
        # two cannot desync — a born signal ages out on the identical presumption.
        valid_to = first_seen + timedelta(days=validity_horizon_days(stage))
        if valid_to < as_of.date():
            # Stale: archive_due already ran this scan, so minting this would put an already-expired
            # sighting into the live feed for a full run — closing a coverage gap and drawing a
            # verdict off a dead trend. Fail closed (fewer signals).
            _LOG.warning(
                "SUBMISSION_STALE_SKIPPED submission=%s valid_to=%s < as_of=%s: not minted.",
                sub.id,
                valid_to,
                as_of.date(),
            )
            continue
        born_id = signal_id(
            scope="public",
            tenant_id=None,
            platform=sub.platform,
            vertical=sub.vertical,
            term=sub.label,
            first_seen=first_seen,
        )
        signal = TrendSignal(
            id=born_id,
            scope="public",
            tenant_id=None,
            platform=sub.platform,
            vertical=sub.vertical,
            kind=sub.kind,  # type: ignore[arg-type]
            lifecycle_stage=stage,  # type: ignore[arg-type]
            confidence="human_corroborated",
            valid_to=valid_to,
            detection_origin="human_sourced",
        )
        store.add(signal, observed_at=as_of.date())
        identity_index.record(
            identity,
            first_seen=first_seen,
            signal_id=born_id,
            # first_detected_at is the AUTOMATED-detection anchor. A born signal has had no
            # automated detection, so it is None — the honest value, and it fails the upgrade gate
            # closed (you cannot predate a detection that never happened). The scan spine sets it
            # when automation genuinely first detects this identity; writing as_of here would let a
            # submission set the very anchor a submitter's lead is graded against.
            first_detected_at=None,
        )
        born.append(born_id)

    return ResolutionMergeResult(tuple(upgraded), tuple(born))
