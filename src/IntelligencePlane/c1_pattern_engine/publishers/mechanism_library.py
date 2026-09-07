"""P8-T8 — the mechanism library publisher: immutable, content-addressed, no tenant axis.

A published ``MechanismLibraryVersion`` is an immutable content-addressed artefact
(mechanisms-v1.json, Contract E). Its key — ``beauty.tiktok.m3`` — carries ``(vertical, platform)``
and a revision, and **no tenant axis**: there is no tenant_id column, and no nullable one waiting to
be filled (REQ-060; A5). Rollback is repointing ``active_version``, never editing an artefact.

Only ``recurrent`` and ``contrasted`` mechanisms are served as active, and only a **human-ratified**
mechanism is serialised into the artefact at all — the unservable-without-ratification rule made
structural. A **ratified** ``falsified`` mechanism (one normally demoted after being ratified and
served) is retained in the artefact for auditability and is never served as active. An
**unratified** mechanism — at any rung, ``falsified`` included — is **excluded** from the artefact
rather than serialised (fail-closed: it never crashes the cohort's publish); its audit trail is the
:class:`MechanismWarrantTransition` recorded at demotion, not this artefact. ``conjectured``
mechanisms are not published at all.

Every emitted mechanism is validated against ``mechanisms-v1.json`` before it is written:
``additionalProperties: false`` turns a stray ``effect_size``/``arm`` into a validation failure
rather than a laundered number (A1). This module carries a focused validator for the subset of JSON
Schema the contract uses, so the barrier holds without a new dependency.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any
from uuid import UUID

from c1_pattern_engine.corpora.exemplar import Cohort
from c1_pattern_engine.publishers.artefact_store_writer import (
    MECHANISMS_PREFIX,
    ContentAddressedArtefactWriter,
)
from c1_pattern_engine.synthesiser.mechanism import Mechanism
from c1_pattern_engine.synthesiser.warrant import Warrant

__all__ = [
    "LibraryManifest",
    "SchemaValidationError",
    "load_mechanism_schema",
    "publish_library",
    "validate_manifest",
    "validate_mechanism",
    "write_mechanism_library_artefact",
]

_PUBLISHABLE = frozenset({Warrant.RECURRENT, Warrant.CONTRASTED, Warrant.FALSIFIED})

_SCHEMA_PATH = (
    Path(__file__).resolve().parents[4] / "docs" / "initial.past" / "schemas" / "mechanisms-v1.json"
)


class SchemaValidationError(ValueError):
    """A mechanism or manifest did not validate against ``mechanisms-v1.json``."""


@lru_cache(maxsize=1)
def load_mechanism_schema() -> dict[str, Any]:
    """Load and cache the ``mechanisms-v1.json`` contract."""
    return json.loads(_SCHEMA_PATH.read_text(encoding="utf-8"))


# --- A focused JSON-Schema validator (the subset mechanisms-v1.json uses) -------------------


def _type_ok(instance: Any, expected: Any) -> bool:
    if isinstance(expected, list):
        return any(_type_ok(instance, e) for e in expected)
    if expected == "null":
        return instance is None
    if expected == "object":
        return isinstance(instance, dict)
    if expected == "array":
        return isinstance(instance, list)
    if expected == "string":
        return isinstance(instance, str)
    if expected == "integer":
        return isinstance(instance, int) and not isinstance(instance, bool)
    if expected == "number":
        return isinstance(instance, int | float) and not isinstance(instance, bool)
    if expected == "boolean":
        return isinstance(instance, bool)
    return True


def _format_error(instance: str, fmt: str, path: str) -> str | None:
    try:
        if fmt == "uuid":
            UUID(instance)
        elif fmt == "date":
            date.fromisoformat(instance)
        elif fmt == "date-time":
            datetime.fromisoformat(instance.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return f"{path}: {instance!r} is not a valid {fmt}"
    return None


def _resolve_ref(ref: str, root: dict[str, Any]) -> dict[str, Any]:
    if not ref.startswith("#/"):
        raise SchemaValidationError(f"Unsupported $ref {ref!r}")
    node: Any = root
    for part in ref[2:].split("/"):
        node = node[part]
    return node


def _matches(instance: Any, schema: dict[str, Any], root: dict[str, Any]) -> bool:
    return not _errors(instance, schema, root, "$")


def _errors(instance: Any, schema: dict[str, Any], root: dict[str, Any], path: str) -> list[str]:
    errs: list[str] = []

    if "$ref" in schema:
        errs += _errors(instance, _resolve_ref(schema["$ref"], root), root, path)

    if "type" in schema and not _type_ok(instance, schema["type"]):
        errs.append(f"{path}: expected type {schema['type']}, got {type(instance).__name__}")
        return errs

    if "const" in schema and instance != schema["const"]:
        errs.append(f"{path}: expected const {schema['const']!r}, got {instance!r}")

    if "enum" in schema and instance not in schema["enum"]:
        errs.append(f"{path}: {instance!r} not in enum {schema['enum']}")

    if isinstance(instance, dict):
        props: dict[str, Any] = schema.get("properties", {})
        for req in schema.get("required", []):
            if req not in instance:
                errs.append(f"{path}: missing required property {req!r}")
        if schema.get("additionalProperties") is False:
            for key in instance:
                if key not in props:
                    errs.append(f"{path}: additional property {key!r} is not allowed")
        for key, subschema in props.items():
            if key in instance:
                errs += _errors(instance[key], subschema, root, f"{path}.{key}")

    if isinstance(instance, list):
        if "minItems" in schema and len(instance) < schema["minItems"]:
            errs.append(f"{path}: expected >= {schema['minItems']} items, got {len(instance)}")
        if "items" in schema:
            for i, element in enumerate(instance):
                errs += _errors(element, schema["items"], root, f"{path}[{i}]")

    if isinstance(instance, str):
        if "minLength" in schema and len(instance) < schema["minLength"]:
            errs.append(f"{path}: shorter than minLength {schema['minLength']}")
        if "format" in schema:
            fmt_err = _format_error(instance, schema["format"], path)
            if fmt_err:
                errs.append(fmt_err)

    if isinstance(instance, int | float) and not isinstance(instance, bool):
        if "minimum" in schema and instance < schema["minimum"]:
            errs.append(f"{path}: {instance} < minimum {schema['minimum']}")
        if "maximum" in schema and instance > schema["maximum"]:
            errs.append(f"{path}: {instance} > maximum {schema['maximum']}")

    for sub in schema.get("allOf", []):
        errs += _errors(instance, sub, root, path)

    if "if" in schema:
        if _matches(instance, schema["if"], root):
            if "then" in schema:
                errs += _errors(instance, schema["then"], root, path)
        elif "else" in schema:
            errs += _errors(instance, schema["else"], root, path)

    return errs


def validate_mechanism(mechanism: dict[str, Any]) -> list[str]:
    """Validate one mechanism dict against ``mechanisms-v1.json`` ``$defs.mechanism``.

    Returns the list of errors (empty when valid). Adding ``effect_size``/``arm``/``lift``/etc.
    produces an ``additional property ... not allowed`` error — the schema is the barrier (A1).
    """
    root = load_mechanism_schema()
    return _errors(mechanism, root["$defs"]["mechanism"], root, "$")


def validate_manifest(manifest: dict[str, Any]) -> list[str]:
    """Validate a library manifest dict against ``mechanisms-v1.json`` ``library_manifest``."""
    root = load_mechanism_schema()
    return _errors(manifest, root["library_manifest"], root, "$")


# --- The publisher --------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class LibraryManifest:
    """An immutable, content-addressed mechanism library version. **No tenant axis on the key.**"""

    mechanism_library_version: str
    cohort: Cohort
    sha256: str
    body: dict[str, Any]


def _canonical(body: dict[str, Any]) -> bytes:
    return json.dumps(body, sort_keys=True, separators=(",", ":")).encode("utf-8")


def publish_library(
    cohort: Cohort,
    mechanisms: list[Mechanism],
    *,
    corpus_snapshot_sha256: str,
    compatible_extractor_versions: list[str],
    cut_at: datetime,
    published_at: datetime,
    revision: int,
    exemplar_index_uri: str | None = None,
    supersedes: str | None = None,
) -> LibraryManifest:
    """Publish an immutable mechanism library for one cohort.

    Includes **ratified** ``recurrent``/``contrasted`` (served) and **ratified** ``falsified``
    (retained for audit); excludes ``conjectured`` and, fail-closed, **any unratified mechanism at
    any rung**. An unratified mechanism — including one auto-demoted to ``falsified`` before it was
    ever ratified — is skipped, never serialised: its :meth:`Mechanism.to_dict` would raise
    ``UnratifiedSerialisationError`` and crash the whole cohort's publish, so it is excluded here
    instead, and its audit trail is the demotion transition, not this artefact. The key is
    ``{vertical}.{platform}.m{revision}`` — no tenant axis. The artefact is content-addressed by a
    sha256 over its canonical body, so a byte-level mutation is detectable and rollback is a
    repoint of ``active_version``, never an edit.
    """
    publishable = [m for m in mechanisms if m.warrant in _PUBLISHABLE]

    mech_dicts: list[dict[str, Any]] = []
    for m in publishable:
        if not m.is_ratified:
            # Fail-closed exclusion: gate on ratification, not on warrant. An unratified mechanism
            # (a served rung never ratified, or one auto-demoted to `falsified` before ratification)
            # is unservable (REQ-065) and its to_dict() would raise; exclude it so a bad record can
            # never crash the batch. A *ratified* `falsified` still serialises and stays retained.
            continue
        as_dict = m.to_dict()
        errors = validate_mechanism(as_dict)
        if errors:
            raise SchemaValidationError(
                f"Mechanism {m.id} does not validate against mechanisms-v1.json: {errors}"
            )
        mech_dicts.append(as_dict)

    version = f"{cohort.vertical}.{cohort.platform}.m{revision}"  # NO tenant axis
    body: dict[str, Any] = {
        "mechanism_library_version": version,
        "vertical": cohort.vertical,
        "platform": cohort.platform,
        "cut_at": cut_at.isoformat(),
        "published_at": published_at.isoformat(),
        "compatible_extractor_versions": list(compatible_extractor_versions),
        "corpus_snapshot_sha256": corpus_snapshot_sha256,
        "mechanisms": mech_dicts,
    }
    if supersedes is not None:
        body["supersedes"] = supersedes
    if exemplar_index_uri is not None:
        body["exemplar_index_uri"] = exemplar_index_uri

    digest = hashlib.sha256(_canonical(body)).hexdigest()
    body["sha256"] = digest

    errors = validate_manifest(body)
    if errors:
        raise SchemaValidationError(f"Library manifest does not validate: {errors}")

    return LibraryManifest(
        mechanism_library_version=version,
        cohort=cohort,
        sha256=digest,
        body=body,
    )


def write_mechanism_library_artefact(
    manifest: LibraryManifest,
    store_writer: ContentAddressedArtefactWriter,
) -> str:
    """Write a published mechanism library to the shared store, content-addressed.

    Under the ``mechanisms`` prefix — a keyspace **distinct** from ``patterns`` so C2's VPS/pattern
    resolver can never load a mechanism artefact (a mechanism carries ``Proxy``-selected provenance
    and is a hypothesis; it never enters VPS). The written bytes are the manifest's canonical body
    (``_canonical``), including its self-declared ``sha256`` field; the store content-address is the
    sha over exactly those bytes, which ``ArtefactStore`` re-verifies on read.

    Writing the immutable artefact is not promotion — repointing ``active_version`` is, and that
    stays C3's authority. This writer has no pointer path.
    """
    content = _canonical(manifest.body).decode("utf-8")
    return store_writer.write(MECHANISMS_PREFIX, content)
