# audio_events fixtures

## `impact-bursts.wav`

Two 150 ms 440 Hz bursts at t=1.0 s and t=2.5 s against digital silence.
16 kHz mono PCM, 4 s, 128 KB.

Generated deterministically with FFmpeg 8.0.1 — regenerate with:

```bash
ffmpeg -v error -y -f lavfi \
  -i "aevalsrc='0.75*sin(2*PI*440*t)*(between(t,1.0,1.15)+between(t,2.5,2.65))':s=16000:d=4:c=mono" \
  -c:a pcm_s16le skills/index/fixtures/audio_events/impact-bursts.wav
```

**Why it exists.** The golden set carries `clean.mp4` (speech) and
`broll-silent.mp4` (no audio stream at all), neither of which contains a sharp
level transition against a quiet floor. This fixture is the positive control for
the RMS-delta energy track and the negative control for the VAD:

* four unambiguous level transitions (a rise and a fall per burst), so
  `detect_energy_candidates` has something real to find;
* quiet stretches deep enough to clear the silence floor;
* a tone, not speech — silero-vad must report nothing on it.

It is **uncompressed PCM on purpose**: an AAC round-trip would add codec noise to
the "silent" stretches and make the dBFS assertions approximate rather than exact.

**Why it is not an applause/laughter fixture.** A synthetic tone burst is not
applause, and asserting that PANNs classifies it as applause would be a test that
passes for the wrong reason. Classifier behaviour is exercised in the fast suite
against hand-written probability matrices (`TestDetectionsFromProbabilities`),
and end-to-end against `clean.mp4` under `@pytest.mark.slow`.

## Vendored model data (not here — see `workers/indexer-python/data/`)

`class_labels_indices.csv` — the AudioSet 527-class index, vendored from
`http://storage.googleapis.com/us_audioset/youtube_corpus/v1/csv/class_labels_indices.csv`.
CC-BY 4.0, Google Inc. It is vendored because `panns_inference` reads this path
at **import time** and shells out to `wget` when it is missing, which fails on
Windows. See the module docstring in `src/audio_events.py`.
