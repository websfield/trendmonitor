"""P8-T11 - the forbidden-verb lexicon, at BOTH checkpoints (A16).

The forbidden verbs (cause / drive / lift / predict) are checked against every statement at
ratification AND again at serve time. The human ratifier is the primary control; the lexicon check
is the regression test on the ratifier - neither checkpoint is the sole control.

* Ratification (Python): ``contains_forbidden_verb`` runs inside ``ratify`` - a forbidden verb
  is rejected before a human can promote it.
* Serve time (C#): ``ForbiddenVerbLexicon`` runs again in C4's ``WarrantFilter``; the dedicated
  guard is ``KnowledgeApiTests.ForbiddenVerb_NotServed_EvenIfRatified``.

Both planes now forbid the **identical inflected set**. An earlier drift - the Python ratification
regex missed ``causing`` / ``driving`` / ``drove`` / ``driven`` - was fixed by enumerating the
inflections explicitly in ``FORBIDDEN_VERB_FORMS`` to mirror the C# lexicon verbatim.
``test_both_planes_forbid_the_identical_inflected_set`` is the cross-plane guard that keeps them in
lock-step: it fails if either plane adds or drops an inflection the other does not.
"""

from __future__ import annotations

import pathlib
import re

import pytest

from c1_pattern_engine.synthesiser.statement import (
    FORBIDDEN_VERB_FORMS,
    FORBIDDEN_VERBS,
    contains_forbidden_verb,
)

_C4_LEXICON = (
    pathlib.Path(__file__).resolve().parents[2]
    / "src" / "KnowledgeApi" / "UgcIntelligence.KnowledgeApi" / "Serving"
    / "ForbiddenVerbLexicon.cs"
)

# The single source of truth for the Python plane: every enumerated inflection of every base verb.
_ALL_INFLECTIONS: list[str] = sorted(
    {form for forms in FORBIDDEN_VERB_FORMS.values() for form in forms}
)

# The inflections the pre-fix ratification regex used to miss. They must now be caught - this is the
# regression guard for the fixed defect (was a strict-xfail while the drift existed).
_PREVIOUSLY_DRIFTED = ["causing", "driving", "drove", "driven"]


def _csharp_alternation() -> str:
    """The raw ``a|b|c`` alternation inside the C# serve-time regex, read from the .cs."""
    text = _C4_LEXICON.read_text(encoding="utf-8")
    match = re.search(r'@"\\b\((.*?)\)\\b"', text)
    assert match is not None, "could not locate the C# forbidden-verb regex alternation"
    return match.group(1)


def _csharp_forbidden_regex() -> re.Pattern[str]:
    """The C4 serve-time regex, compiled for matching against statements."""
    return re.compile(rf"\b({_csharp_alternation()})\b", re.IGNORECASE)


def _csharp_forms() -> set[str]:
    """The C# forbidden set expanded to concrete forms (``causes?`` -> ``cause``, ``causes``)."""
    forms: set[str] = set()
    for token in _csharp_alternation().split("|"):
        if token.endswith("s?"):
            base = token[:-2]
            forms.update({base, base + "s"})
        else:
            forms.add(token)
    return forms


# --- the base lexicon: the same four verbs on both planes --------------------------------------


def test_ratification_base_verbs_are_the_four_causal_verbs() -> None:
    assert sorted(FORBIDDEN_VERBS) == ["cause", "drive", "lift", "predict"]


def test_forbidden_verb_forms_cover_every_base_verb() -> None:
    assert set(FORBIDDEN_VERB_FORMS) == set(FORBIDDEN_VERBS)
    # Each base verb's own uninflected form is present in its enumerated inflections.
    for base, forms in FORBIDDEN_VERB_FORMS.items():
        assert base in forms


# --- checkpoint 1: ratification rejects EVERY inflection ---------------------------------------


@pytest.mark.parametrize("verb", _ALL_INFLECTIONS)
def test_ratification_lexicon_catches_every_inflection(verb: str) -> None:
    assert contains_forbidden_verb(f"This structure {verb} engagement.")


@pytest.mark.parametrize("verb", _PREVIOUSLY_DRIFTED)
def test_previously_drifted_inflections_are_now_caught_at_ratification(verb: str) -> None:
    """Regression guard for the fixed drift: the -ing of an e-ending verb (causing/driving) and the
    irregular forms of 'drive' (drove/driven) are now caught at ratification, not just at serve."""
    assert contains_forbidden_verb(f"This structure {verb} engagement.")


def test_ratification_lexicon_ignores_ordinary_prose() -> None:
    ok = (
        "A content structure in which a face appears early recurs among high performers and is "
        "comparatively absent from the same creators' non-performers."
    )
    assert not contains_forbidden_verb(ok)


# --- checkpoint 2: serve time catches EVERY inflection -----------------------------------------


@pytest.mark.parametrize("verb", _ALL_INFLECTIONS)
def test_servetime_lexicon_catches_every_inflection(verb: str) -> None:
    """The C# serve-time regex (read from the .cs) catches every inflection. Dedicated C# guard:
    KnowledgeApiTests.ForbiddenVerb_NotServed_EvenIfRatified."""
    assert _csharp_forbidden_regex().search(f"This structure {verb} engagement.")


# --- the two planes forbid the IDENTICAL inflected set (the lock-step guard) --------------------


def test_both_planes_forbid_the_same_base_verbs() -> None:
    csharp_source = _C4_LEXICON.read_text(encoding="utf-8").lower()
    for base in FORBIDDEN_VERBS:
        assert base in csharp_source, f"C# serve-time lexicon is missing base verb {base!r}"


def test_both_planes_forbid_the_identical_inflected_set() -> None:
    """The strengthening: not just the same base verbs, but the same *inflected forms*. This fails
    if either plane adds or drops an inflection the other does not - the guard against a one-sided
    edit re-opening the drift the synthesiser engineer just closed."""
    python_forms = {form for forms in FORBIDDEN_VERB_FORMS.values() for form in forms}
    assert python_forms == _csharp_forms(), (
        "the Python ratification lexicon and the C# serve-time lexicon forbid different inflected "
        f"forms:\n  python-only={sorted(python_forms - _csharp_forms())}\n"
        f"  csharp-only={sorted(_csharp_forms() - python_forms)}"
    )


def test_every_inflection_is_caught_at_both_checkpoints() -> None:
    """For the full inflected set, both checkpoints fire - a forbidden verb is caught at
    ratification AND at serve, so neither is the sole control and there is no gap between them."""
    cs = _csharp_forbidden_regex()
    for verb in _ALL_INFLECTIONS:
        stmt = f"This structure {verb} engagement."
        assert contains_forbidden_verb(stmt), f"ratification missed {verb!r}"
        assert cs.search(stmt), f"serve time missed {verb!r}"
