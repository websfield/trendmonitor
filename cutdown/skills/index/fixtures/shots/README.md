# Shot/scene transition fixtures

Synthetic media for the `index` skill's **shots** and **scenes** sub-stages
(PRD REQ-012, decisions.md D-18). Generated entirely by **ffmpeg** from built-in
`lavfi` sources — nothing was downloaded and no real footage is present, matching
the provenance rule in `cutdown/data/golden-sets/ingest/LICENSE-FIXTURES.md`.

## Why these exist

None of the ingest golden-set clips contains a detectable transition. Verified
against the installed PySceneDetect 0.7 — `ContentDetector` at thresholds 27 and
10, and `ThresholdDetector` at 12, all return an **empty** cut list on
`clean.mp4`, `ugly.mp4` and `broll-silent.mp4`. The ingest set is a *preflight*
corpus (VFR, rotation, HDR tags, silence); its video content is smooth
`testsrc2` and flat colour, which is exactly the absence of a signal.

So the ingest set gives the **negative** cases (a static take that must fall back
to time slices) and these three clips give the **positive** ones — one per
`shot-transition-kind.json` enum value that a detector can actually produce.

All clips are 30 fps CFR, H.264, no audio, container timebase `1/15360`.
Total: ~70 KB.

## Commands

Run from this directory (`cutdown/skills/index/fixtures/shots/`) in a POSIX
shell. ffmpeg 8.0.1, gyan.dev full build.

### `hard-cut.mp4` — 4.5 s, two hard cuts at 1.5 s and 3.0 s

Three flat colours chosen for large hue *and* luma separation (red → near-white
→ dark blue). An earlier version used red/green/blue; the green→blue delta fell
under `ContentDetector`'s default threshold of 27 and only the low-threshold pass
saw it, which would have mislabelled a genuine cut as a camera change.

```bash
ffmpeg -v error \
  -f lavfi -i "color=c=0xE74C3C:s=320x180:r=30:d=1.5" \
  -f lavfi -i "color=c=0xF7F9F9:s=320x180:r=30:d=1.5" \
  -f lavfi -i "color=c=0x154360:s=320x180:r=30:d=1.5" \
  -filter_complex "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]" -map "[v]" \
  -c:v libx264 -preset veryfast -crf 30 -pix_fmt yuv420p -r 30 -fps_mode cfr \
  -an -movflags +faststart -y hard-cut.mp4
```

### `fade.mp4` — 4.0 s, one fade through black at ~1.8 s

Holds ~0.3 s of true black between the two ramps, well under `ThresholdDetector`'s
average-luma floor of 12.

```bash
ffmpeg -v error \
  -f lavfi -i "color=c=0xB03A2E:s=320x180:r=30:d=2" \
  -f lavfi -i "color=c=0x2874A6:s=320x180:r=30:d=2" \
  -filter_complex "[0:v]fade=t=out:st=1.2:d=0.5[a];[1:v]fade=t=in:st=0:d=0.5[b];[a][b]concat=n=2:v=1:a=0[v]" \
  -map "[v]" \
  -c:v libx264 -preset veryfast -crf 30 -pix_fmt yuv420p -r 30 -fps_mode cfr \
  -an -movflags +faststart -y fade.mp4
```

### `camera-change.mp4` — 4.0 s, one camera move at ~1.5 s

A **continuous take**: a 320x180 window cropped out of a 640x360 `testsrc2`
field, held still for 1.5 s and then panned rapidly across. There is no cut — the
framing simply moves far enough to read as a new shot, which is precisely what
the `camera_change` enum value is defined as.

The content delta of this pan lands *between* the two `ContentDetector`
thresholds: 27.0 sees nothing, 10.0 sees the pan. That gap is the camera-change
band the sub-stage classifies on, so this clip is also the fixture that justifies
`camera_change_threshold = 10.0`.

```bash
ffmpeg -v error \
  -f lavfi -i "testsrc2=size=640x360:rate=30:duration=4" \
  -vf "crop=320:180:x='min(320,max(0,(t-1.5)*640))':y=90" \
  -c:v libx264 -preset veryfast -crf 30 -pix_fmt yuv420p -r 30 -fps_mode cfr \
  -an -movflags +faststart -y camera-change.mp4
```

## Observed detector behaviour

Boundaries in seconds, PySceneDetect 0.7, `pyav` backend, `min_scene_len=15`:

| Clip | `ContentDetector(27)` | `ContentDetector(10)` | `ThresholdDetector(12)` | Classified as |
|---|---|---|---|---|
| `hard-cut.mp4` | 1.5, 3.0 | 1.5, 3.0 | — | `hard_cut`, `hard_cut` |
| `fade.mp4` | 1.7 | 1.667 | 1.833 | `fade` (precedence) |
| `camera-change.mp4` | — | 1.533 | — | `camera_change` |
| `clean.mp4` | — | — | — | static take → time slices |
| `ugly.mp4` | — | 3.5 | — | `camera_change` |
| `broll-silent.mp4` | — | — | — | static take → time slices |
