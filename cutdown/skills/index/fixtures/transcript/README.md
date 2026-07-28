# Transcript sub-stage fixtures

Speaker-map YAML fixtures for `workers/indexer-python/src/speaker_map.py`
(REQ-011, decisions.md D-17). One positive fixture and four negative controls —
the negatives are the point: every one of them is a case where accepting the file
would attach a name to the wrong speech.

| File | Expected | Error code |
|---|---|---|
| `speaker-map-valid.yaml` | applied, `inferredLabel` untouched | — |
| `speaker-map-unknown-turn.yaml` | rejected, exit 2 | `SPEAKER_MAP_UNKNOWN_TURN` |
| `speaker-map-duplicate-turn.yaml` | rejected, exit 2 | `SPEAKER_MAP_DUPLICATE_TURN` |
| `speaker-map-missing-author.yaml` | rejected, exit 2 | `SPEAKER_MAP_INVALID` |
| `speaker-map-bad-timestamp.yaml` | rejected, exit 2 | `SPEAKER_MAP_INVALID` |

No new media fixtures were added: `data/golden-sets/ingest/clean.mp4` (speech)
and `broll-silent.mp4` (the required empty-but-valid case) already carry both
signals this sub-stage needs.
