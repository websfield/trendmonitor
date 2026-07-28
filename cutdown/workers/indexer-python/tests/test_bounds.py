"""Source-bounds checking, driven from Python THROUGH THE CLI (Phase 2 task 10).

There is exactly one implementation of this rule — `range-check.ts`. This suite
does not reimplement it; it shells out to `cutdown range-check` and asserts the
verdicts recorded in the committed corpus.

That is the whole design. A Python reimplementation would be a second set of
rounding rules, and the Phase 0 exit criterion "zero invalid source ranges in
final renders" would end up measuring whichever validator happened to run. By
driving the same corpus the TypeScript suite drives, a disagreement between the
two languages can only be a wiring bug — never a rounding difference.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

CUTDOWN_ROOT = Path(__file__).resolve().parents[3]
CLI_ENTRY = CUTDOWN_ROOT / "apps" / "cli" / "dist" / "src" / "main.js"
CORPUS = CUTDOWN_ROOT / "packages" / "contracts" / "fixtures" / "range-check" / "cases.json"

def test_the_implementation_under_test_is_actually_built() -> None:
    """FAIL, never skip, when the CLI is absent.

    This is the only coverage the `range-check` command has, and it is the
    evidence behind the "zero invalid source ranges" exit criterion. A
    `skipif` turned the entire cross-language suite into green skips whenever
    `dist/` was missing or stale — which is exactly the state a broken build
    leaves behind, so the suite would vanish precisely when it was most needed.
    """
    assert CLI_ENTRY.exists(), (
        f"{CLI_ENTRY} is missing. Run `pnpm -C cutdown build`. This suite must fail rather "
        "than skip: it is the exit criterion's evidence."
    )


def load_corpus() -> dict:
    return json.loads(CORPUS.read_text(encoding="utf-8"))


def run_range_check(request: dict, tmp_path: Path) -> tuple[int, dict | None]:
    """Invoke the CLI as a subprocess, argv-array style — never through a shell.

    Shell-free spawning is the project's execution contract (tech-spec §6.2); it
    also removes an entire injection class, which matters because the paths here
    are test-controlled today but caller-controlled later.
    """
    request_path = tmp_path / "range-check-request.json"
    request_path.write_text(json.dumps(request), encoding="utf-8")

    completed = subprocess.run(
        ["node", str(CLI_ENTRY), "range-check", "--input", str(request_path)],
        capture_output=True,
        text=True,
        cwd=str(CUTDOWN_ROOT),
        check=False,
    )
    payload = None
    if completed.stdout.strip():
        try:
            payload = json.loads(completed.stdout)
        except json.JSONDecodeError:
            payload = None
    return completed.returncode, payload


class TestCorpusThroughTheCli:
    def test_the_corpus_is_present_and_substantive(self) -> None:
        corpus = load_corpus()
        assert len(corpus["cases"]) >= 12
        assert any(case["expect"]["ok"] for case in corpus["cases"])
        assert any(not case["expect"]["ok"] for case in corpus["cases"])

    @pytest.mark.parametrize("case", load_corpus()["cases"], ids=lambda c: c["name"])
    def test_case_verdict_matches_the_committed_expectation(self, case: dict, tmp_path: Path) -> None:
        corpus = load_corpus()
        code, payload = run_range_check(
            {"bounds": corpus["asset"], "ranges": [case["range"]]}, tmp_path
        )
        assert payload is not None, f"{case['name']}: CLI produced no JSON verdict"
        assert payload["ok"] is case["expect"]["ok"], case["why"]
        assert [v["code"] for v in payload["violations"]] == case["expect"]["codes"], case["why"]
        assert code == (0 if case["expect"]["ok"] else 1), "exit code must carry the verdict"

    def test_unknown_duration_fails_closed_through_the_cli(self, tmp_path: Path) -> None:
        corpus = load_corpus()
        case = corpus["unknownDurationCase"]
        code, payload = run_range_check(
            {
                "bounds": {"assetId": corpus["asset"]["assetId"], "duration": None},
                "ranges": [case["range"]],
            },
            tmp_path,
        )
        assert payload["ok"] is False, case["why"]
        assert [v["code"] for v in payload["violations"]] == case["expect"]["codes"]
        assert code == 1


class TestBatchReporting:
    def test_every_violation_is_attributed_to_its_own_range(self, tmp_path: Path) -> None:
        corpus = load_corpus()
        good = corpus["cases"][0]["range"]
        bad = next(c for c in corpus["cases"] if c["name"] == "one-tick-past-the-end")["range"]
        code, payload = run_range_check(
            {"bounds": corpus["asset"], "ranges": [good, bad, good]}, tmp_path
        )
        assert payload["checked"] == 3
        assert [v["index"] for v in payload["violations"]] == [1], (
            "a report that does not name WHICH moment is bad sends the operator round the loop"
        )
        assert code == 1

    def test_a_clean_batch_reports_how_many_it_checked(self, tmp_path: Path) -> None:
        # "Zero violations" means something different over 40 ranges than over
        # none, so the count must ride along with the verdict.
        corpus = load_corpus()
        good = corpus["cases"][0]["range"]
        code, payload = run_range_check(
            {"bounds": corpus["asset"], "ranges": [good, good]}, tmp_path
        )
        assert payload == {"ok": True, "checked": 2, "violations": []}
        assert code == 0

    def test_an_empty_batch_is_a_usage_error_not_a_clean_run(self, tmp_path: Path) -> None:
        # "Nothing to check" must never be reportable as "nothing wrong". Both
        # callers read the exit code first, so an exit 0 here would let a job
        # that produced zero Moments pass the exit-criterion gate.
        corpus = load_corpus()
        code, payload = run_range_check({"bounds": corpus["asset"], "ranges": []}, tmp_path)
        assert payload["checked"] == 0
        assert code == 2


class TestUnusableInputIsNotACleanRun:
    def test_a_request_missing_ranges_is_a_usage_error_not_a_pass(self, tmp_path: Path) -> None:
        # The dangerous failure mode: "nothing to check" reported as "nothing
        # wrong". Exit 2 keeps it distinct from a clean exit 0.
        corpus = load_corpus()
        code, _ = run_range_check({"bounds": corpus["asset"]}, tmp_path)
        assert code == 2

    def test_a_request_missing_bounds_is_a_usage_error(self, tmp_path: Path) -> None:
        code, _ = run_range_check({"ranges": []}, tmp_path)
        assert code == 2

    def test_an_unreadable_input_file_is_a_usage_error(self, tmp_path: Path) -> None:
        missing = tmp_path / "does-not-exist.json"
        completed = subprocess.run(
            ["node", str(CLI_ENTRY), "range-check", "--input", str(missing)],
            capture_output=True,
            text=True,
            cwd=str(CUTDOWN_ROOT),
            check=False,
        )
        assert completed.returncode == 2
        assert "RANGE_CHECK_INPUT_UNREADABLE" in completed.stderr


class TestGeneratedMomentsAreInBounds:
    """The property test the exit criterion actually rides on.

    Moments produced by the real segmentation code are fed through the real
    bounds checker. This is the end-to-end version of the guarantee: not "the
    checker works" and separately "the segmenter works", but "what the segmenter
    produces passes the checker".
    """

    def test_generated_moments_never_exceed_source_bounds(self, tmp_path: Path) -> None:
        from moments import Timebase, segment_ranges

        timebase = Timebase(1, 30)
        duration_ticks = 3000  # 100 s at 30 fps
        asset_id = "01HQZX3F5G7K9M2N4P6R8S0T2V"

        # A deliberately awkward boundary set: a sub-second runt, a long static
        # stretch needing splitting, and a boundary exactly at the duration.
        boundaries = [0, 10, 400, 900, 2900, duration_ticks]
        ranges = segment_ranges(boundaries, timebase)
        assert ranges, "segmentation produced nothing to check"

        code, payload = run_range_check(
            {
                "bounds": {
                    "assetId": asset_id,
                    "duration": {"ticks": duration_ticks, "timebase": {"num": 1, "den": 30}},
                },
                "ranges": [
                    {
                        "assetId": asset_id,
                        "startTicks": start,
                        "endTicks": end,
                        "timebase": {"num": 1, "den": 30},
                    }
                    for start, end in ranges
                ],
            },
            tmp_path,
        )

        assert payload["checked"] == len(ranges)
        assert payload["ok"] is True, f"segmentation produced out-of-bounds ranges: {payload['violations']}"
        assert code == 0
