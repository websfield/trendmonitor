# `visual_descriptions` fixtures

Two cases, matching the tech-spec §6.6 split for a sub-stage that calls a model.

| case | kind | what it proves |
|---|---|---|
| `no-vlm` | exact | The REQUIRED `--no-vlm` skip semantics: **descriptions absent, reason present**. Deterministic — no model involved. |
| `recorded-shot-descriptions` | constrained | Byte-stable regression against a **recorded** model response (`recorded-model.json`), replayed through the injected transport, plus property assertions (every description references a real `shotId`; `keyframeCount` equals the number of frames actually sent). |

An exact-compare fixture against a live VLM would be permanently red or
permanently mocked without saying so. This split says so.

`recorded-model.json` holds one Anthropic Messages API response per shot, in
shot order. The fake transport in `tests/test_visual.py` replays them in
sequence; nothing here reaches the network, and no test constructs
`HttpTransport`.

Timestamps in `expected-output.json` come from an injected fixed clock
(`2026-07-21T00:00:00Z`). Wall-clock time is the one field a model sub-stage
cannot make deterministic, so it is injected rather than pretended away.
