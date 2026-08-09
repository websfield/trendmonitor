"""Validate every contract fixture through the GENERATED Pydantic models.

This is the Python half of `cutdown validate:contracts`. tech-spec §3 makes the
point that motivates it: every fixture is validated through **both** Ajv and the
generated Pydantic model, and *agreement between the two validators is itself
part of the contract*. A schema construct that one generator understands and the
other quietly reinterprets would otherwise produce two languages that disagree
about what a valid object is — and the disagreement would surface as a
production bug rather than a build failure.

This script only reports; the TypeScript caller owns the verdict and the
cross-validator comparison. Output is one JSON document on stdout so the caller
never has to parse human prose.
"""

from __future__ import annotations

import importlib
import json
import sys
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ValidationError


def module_name(contract: str) -> str:
    """`job-brief-v1` -> `cutdown_contracts.job_brief_v1`."""
    return "cutdown_contracts." + contract.replace("-", "_")


def load_model(contract: str, schema_path: Path) -> type[BaseModel]:
    """Resolve the generated model class for a contract.

    The class name is the schema's own `title`, which is also what
    `--use-title-as-name` told the generator to use — so the schema stays the
    single source of truth for the binding, and a renamed contract fails loudly
    here instead of silently validating nothing.
    """
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    title = schema.get("title")
    if not title:
        raise SystemExit(f"{schema_path.name} has no `title`; cannot locate its generated model.")

    module = importlib.import_module(module_name(contract))
    model = getattr(module, title, None)
    if model is None:
        raise SystemExit(
            f"Generated module {module_name(contract)} has no class {title!r}. "
            "Regenerate with `cutdown build:contracts`."
        )
    return model


def check(model: type[BaseModel], instance: dict[str, Any]) -> tuple[bool, str | None]:
    try:
        model.model_validate(instance)
        return True, None
    except ValidationError as exc:
        errors = exc.errors()
        first = errors[0] if errors else {}
        location = ".".join(str(part) for part in first.get("loc", ())) or "/"
        return False, f"{location}: {first.get('msg', 'invalid')} ({len(errors)} error(s))"


def main() -> int:
    if len(sys.argv) != 3:
        # This module is a standalone CLI script, not a sub-stage — its streams are
        # its user interface, and usage goes to stderr so a caller piping stdout
        # gets the report and nothing else. Hence the suppression below.
        print(  # noqa: T201
            "usage: validate_fixtures.py <contracts-root> <fixtures-root>", file=sys.stderr
        )
        return 2

    contracts_root = Path(sys.argv[1])
    fixtures_root = Path(sys.argv[2])
    schemas_dir = contracts_root / "schemas"

    sys.path.insert(0, str(contracts_root / "generated" / "python"))

    results: list[dict[str, Any]] = []

    for contract_dir in sorted(p for p in fixtures_root.iterdir() if p.is_dir()):
        contract = contract_dir.name

        # A contract fixture directory is one holding a `valid/` or `invalid/`
        # bucket — the same rule the TypeScript half applies when it discovers
        # `fixtures/<contract>/{valid,invalid}/<case>.json`. Anything else under
        # `fixtures/` is a corpus consumed by its own suite (e.g.
        # `range-check/cases.json`, driven from both languages) and is not an
        # instance of any contract.
        #
        # The two validators MUST agree on what a fixture is. When they did not,
        # Ajv silently skipped such a directory while Pydantic reported it as a
        # missing schema — a disagreement about discovery rather than about
        # validity, which is exactly the class of divergence this dual-validator
        # gate exists to prevent.
        buckets = [contract_dir / expectation for expectation in ("valid", "invalid")]
        if not any(bucket.is_dir() for bucket in buckets):
            continue

        schema_path = schemas_dir / f"{contract}.json"
        if not schema_path.exists():
            results.append(
                {
                    "contract": contract,
                    "case": "(directory)",
                    "expected": "valid",
                    "accepted": False,
                    "error": f"No schema at schemas/{contract}.json for fixture directory.",
                }
            )
            continue

        model = load_model(contract, schema_path)

        for expectation in ("valid", "invalid"):
            bucket = contract_dir / expectation
            if not bucket.is_dir():
                continue
            for fixture in sorted(bucket.glob("*.json")):
                instance = json.loads(fixture.read_text(encoding="utf-8"))
                accepted, error = check(model, instance)
                results.append(
                    {
                        "contract": contract,
                        "case": f"{expectation}/{fixture.name}",
                        "expected": expectation,
                        "accepted": accepted,
                        "error": error,
                    }
                )

    json.dump({"results": results}, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
