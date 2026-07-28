# Cutdown ingest golden set

Synthetic fixture media for the Cutdown Phase 0/1 ingest pipeline. Every file here is generated
by **ffmpeg 8.0.1** (gyan.dev full build) from built-in `lavfi` sources, or hand-authored plain
text. Nothing was downloaded; no real footage is present. See `LICENSE-FIXTURES.md`.

**Total corpus size: 1.25 MB** (per D-14: small trimmed clips, committed in-repo).

All commands below are run **from this directory** (`cutdown/data/golden-sets/ingest/`) in a
POSIX shell (Git Bash on Windows). `$F` is the drawtext font path:

```bash
F="C\:/Windows/Fonts/arial.ttf"    # note the escaped drive colon — drawtext requires it
```

---

## 1. Standalone clips (jobs test-1 / test-2 / test-3)

| File | Class | Fixture FOR | Size |
|---|---|---|---|
| `clean.mp4` | video | **The control.** CFR exactly 30/1, H.264+AAC, 640x360, 5.000 s, **no** rotation side data, SDR (no colour tags), one 48 kHz audio track with audible synthesised speech. | 289,290 B |
| `ugly.mp4` | video | **The edge case.** VFR + `rotation=90` display matrix + HDR (bt2020 / smpte2084 / bt2020nc) colour tags, all at once. 3.800 s, no audio. | 150,206 B |
| `broll-silent.mp4` | video | **Zero audio streams** (`-an`) + a visually static frame, to exercise the "static take" path. CFR 30/1, 4.000 s. | 6,407 B |

### `clean.mp4`

```bash
ffmpeg -f lavfi -i "testsrc2=size=640x360:rate=30:duration=5" \
  -f lavfi -i "flite=text='This is a synthetic fixture clip generated entirely by ffmpeg for the cutdown ingest golden set. No real footage was used.':voice=slt" \
  -filter_complex "[1:a]aresample=48000,apad[a]" \
  -map 0:v -map "[a]" -t 5 \
  -c:v libx264 -preset veryfast -crf 30 -pix_fmt yuv420p -r 30 -vsync cfr \
  -c:a aac -b:a 96k -ar 48000 -movflags +faststart -y clean.mp4
```

The audio is **real synthesised speech** from ffmpeg's built-in `flite` filter (this build has
`--enable-libflite`; confirmed with `ffmpeg -filters | grep flite`). No sine/noise substitution
was needed. `flite` emits mono, so the track is 1-channel at 48 kHz. `apad` pads the tail so the
audio spans the full 5 s.

### `ugly.mp4` — two steps

`-display_rotation` is an **input-only** option in ffmpeg 8, so rotation cannot be applied in the
encode pass. Encode first, then remux to stamp the display matrix:

```bash
# Step 1 — encode with genuinely variable packet timestamps + HDR tags in the SPS VUI.
# select() keeps every frame for t<2s (1/30 s deltas) then every 3rd frame (1/10 s deltas);
# -fps_mode passthrough preserves the resulting gaps instead of re-timing to CFR.
ffmpeg -f lavfi -i "testsrc2=size=640x360:rate=30:duration=4" \
  -vf "select='if(lt(t,2),1,not(mod(n,3)))'" -fps_mode passthrough \
  -c:v libx264 -preset veryfast -crf 30 -pix_fmt yuv420p \
  -bsf:v "h264_metadata=colour_primaries=9:transfer_characteristics=16:matrix_coefficients=9" \
  -an -y ugly-tmp.mp4

# Step 2 — stamp a 90-degree display matrix and write the container colr atom.
ffmpeg -display_rotation:v:0 90 -i ugly-tmp.mp4 -c copy -fps_mode passthrough \
  -movflags +write_colr -y ugly.mp4

rm ugly-tmp.mp4
```

Notes for whoever writes the ingest probe:

- **Rotation appears as a `Display Matrix` side-data entry with `rotation=90`, NOT as a
  `TAG:rotate` stream tag.** `-metadata:s:v rotate=90` was tried first and ffmpeg 8 silently
  ignores it — the legacy tag is gone. Probe `stream_side_data=rotation`, not `stream_tags=rotate`.
- The HDR tags had to go in via the `h264_metadata` bitstream filter. Passing
  `-color_primaries/-color_trc/-colorspace` to the encoder set only `color_space`; primaries and
  transfer came back `unknown`. The bsf writes all three into the SPS VUI, and
  `-movflags +write_colr` mirrors them into the MP4 `colr` atom.
- These are **colour tags only** — the pixels are ordinary SDR `testsrc2` content. This fixture
  proves the probe reads metadata, not that tone mapping is correct.

### `broll-silent.mp4`

```bash
ffmpeg -f lavfi -i "color=c=0x2E4053:s=640x360:r=30:d=4" \
  -vf "drawtext=fontfile='$F':text='B-ROLL / STATIC TAKE':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=(h-text_h)/2" \
  -c:v libx264 -preset veryfast -crf 30 -pix_fmt yuv420p -r 30 -fps_mode cfr \
  -an -movflags +faststart -y broll-silent.mp4
```

Every frame is byte-identical (flat colour + fixed text), so any static-take / scene-change
detector should see one take across the whole 4 s.

---

## 2. `mixed-job-valid/` — one file per supported asset class

Non-recursive directory holding **exactly one** file of each of the six PRD REQ-001 classes.

| File | Class | Fixture FOR | Sidecar? | Size |
|---|---|---|---|---|
| `café shot.mp4` | `video` | **Unicode + space in filename** (Phase 1 edge-case list). CFR 30/1, 5 s, H.264+AAC 48 kHz flite speech. | yes | 284,595 B |
| `voiceover-bed.m4a` | `audio` | Audio-only container — **no video stream at all**, so class must come from stream inspection not extension guessing. | yes | 62,252 B |
| `hero-still.jpg` | `image` | Photographic-style still, no alpha (`yuvj420p`). **Deliberately has NO sidecar** — see below. | **NO** | 40,615 B |
| `brand-logo.png` | `logo` | **Genuine alpha channel** (`pix_fmt=rgba`, alpha min 0 / max 255 / mean 14.9) — this is what separates `logo` from `image`. | yes | 9,801 B |
| `captions.srt` | `subtitle` | 3 cues at 0.2–1.8 s, 2.0–3.4 s, 3.6–4.9 s — all inside `café shot.mp4`'s 5 s duration. | yes | 216 B |
| `brand-style-sheet.md` | `brand_reference` | Style-reference document. **Chosen as `.md`, not `.pdf` or `.png`** — see substitution note. | yes | 1,112 B |

### The asset with no sidecar

**`hero-still.jpg` deliberately ships with no `.rights.yaml`.** Phase 1 must prove that an asset
lacking a rights record lands as `rights: unknown` and is **not** assumed cleared. If ingest ever
reports this file as cleared, that is the bug the fixture exists to catch.

### Sidecar naming

Every other asset has a sibling named `<full-filename-including-extension>.rights.yaml` — i.e.
`café shot.mp4.rights.yaml`, not `café shot.rights.yaml`. This keeps the mapping unambiguous when
two assets share a stem with different extensions.

Sidecars use the PRD REQ-003 key set: `state`, `owner`, `supplier`, `permittedPlatforms`,
`territories`, `campaignStart`, `campaignEnd`, `expiryDate`, `talentReleaseStatus`,
`locationReleaseStatus`, `musicStatus`, `editingPermitted`, `paidAmplificationPermitted`,
`evidenceUri`, `notes`. All are `state: cleared` with `musicStatus: none` (nothing here contains
licensed music — the `.m4a` is a generated tone bed, not a track), and
`talentReleaseStatus: not_required` / `locationReleaseStatus: not_required` because no person or
place appears in synthetic footage.

### Generation commands

```bash
cd mixed-job-valid

# video — Unicode + space in the filename
ffmpeg -f lavfi -i "testsrc2=size=640x360:rate=30:duration=5" \
  -f lavfi -i "flite=text='Cafe shot, take one. Synthetic fixture audio for the mixed job golden set.':voice=slt" \
  -filter_complex "[1:a]aresample=48000,apad[a]" -map 0:v -map "[a]" -t 5 \
  -c:v libx264 -preset veryfast -crf 30 -pix_fmt yuv420p -r 30 -fps_mode cfr \
  -c:a aac -b:a 96k -ar 48000 -movflags +faststart -y "café shot.mp4"

# audio — 220 Hz tone under a pink-noise bed
ffmpeg -f lavfi -i "sine=frequency=220:sample_rate=48000:duration=5" \
  -f lavfi -i "anoisesrc=color=pink:sample_rate=48000:duration=5:amplitude=0.15" \
  -filter_complex "[0:a][1:a]amix=inputs=2:duration=shortest,volume=0.8[a]" \
  -map "[a]" -c:a aac -b:a 96k -ar 48000 -y voiceover-bed.m4a

# image — photographic-style still, no alpha
ffmpeg -f lavfi -i "testsrc2=size=1280x720" -frames:v 1 -q:v 6 -y hero-still.jpg

# logo — transparent RGBA base, opaque glyph
ffmpeg -f lavfi -i "color=c=black@0.0:s=512x512:r=1:d=1,format=rgba" \
  -vf "drawtext=fontfile='$F':text='CH':fontcolor=0xE8501Cff:fontsize=220:x=(w-text_w)/2:y=(h-text_h)/2,format=rgba" \
  -frames:v 1 -y brand-logo.png
```

`captions.srt`, `brand-style-sheet.md` and all `*.rights.yaml` files are hand-authored plain text.

---

## 3. `mixed-job-unsupported/` — atomic rollback fixture

A **byte-identical copy** of `mixed-job-valid/` (all six assets, all five sidecars, same missing
sidecar on `hero-still.jpg`) **plus one unsupported member**:

| File | Fixture FOR | Size |
|---|---|---|
| `notes.xyz` | Unrecognised extension holding arbitrary bytes (including NULs and high bytes, so it is not valid UTF-8 either). | 105 B |

Ingest of this directory **must fail**, must name the offending relative path
(`mixed-job-unsupported/notes.xyz`) in the error, and must leave **no partial job inventory** —
none of the seven valid assets may land. Rebuild with:

```bash
cp -a mixed-job-valid/. mixed-job-unsupported/
printf '\xDE\xAD\xBE\xEF cutdown fixture: deliberately unsupported member.\nArbitrary bytes, no recognised asset class.\n\x00\x01\x02\x03\xFF\xFE' > mixed-job-unsupported/notes.xyz
```

---

## Substitutions and deviations

Three, all forced by ffmpeg 8 behaviour or by fixture-design constraints:

1. **`flite` was available** — no substitution needed. The spec allowed a sine/noise fallback for
   `clean.mp4`'s speech track; `ffmpeg -filters | grep flite` confirmed `--enable-libflite`, so
   real synthesised speech is used. (`flite` is a speech *synthesiser*, not a recording — no
   human voice, no performer rights.)
2. **`brand_reference` is a `.md`, not a `.pdf` or `.png`.** A PNG style sheet would be
   indistinguishable from the `image` class by extension and would collide with `brand-logo.png`
   on alpha-based classification; a synthesised PDF is fragile. The ingest classifier should
   therefore treat `brand_reference` as a **document** class recognised by extension
   (`.md`/`.pdf`/`.docx`) rather than by media probing.
3. **Rotation is a display matrix, not a `rotate` tag** (see the `ugly.mp4` notes above). If the
   ingest probe was written against `TAG:rotate`, it will read 0 degrees on this fixture and the
   fixture is doing its job by exposing that.

---

## Verification

Regenerate the evidence with:

```bash
# clean.mp4 — CFR 30/1, has audio, no rotation
ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate,avg_frame_rate clean.mp4
ffprobe -v error -select_streams a -show_entries stream=index,codec_name,sample_rate -of csv=p=0 clean.mp4
ffprobe -v error -show_entries stream_side_data=rotation -of csv=p=0 clean.mp4   # expect empty

# ugly.mp4 — VFR, rotation, HDR tags
ffprobe -v error -select_streams v:0 \
  -show_entries stream=r_frame_rate,avg_frame_rate,color_primaries,color_transfer,color_space \
  -show_entries stream_side_data=rotation ugly.mp4
# genuinely variable packet deltas (expect two clusters: 60x 0.0333, 19x 0.1000)
ffprobe -v error -select_streams v:0 -show_entries packet=pts_time -of csv=p=0 ugly.mp4 \
  | sort -n | awk 'NR>1{printf "%.4f\n", $1-p} {p=$1}' | sort | uniq -c

# broll-silent.mp4 — zero audio streams (expect 0)
ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 broll-silent.mp4 | wc -l

# brand-logo.png — real alpha (expect rgba, and YMIN=0 / YMAX=255 on the alpha plane)
ffprobe -v error -show_entries stream=pix_fmt -of csv=p=0 mixed-job-valid/brand-logo.png
ffmpeg -hide_banner -i mixed-job-valid/brand-logo.png \
  -vf "alphaextract,signalstats,metadata=print" -f null - 2>&1 | grep -E "YMIN|YMAX|YAVG"
```

Observed results at generation time:

| Claim | ffprobe evidence |
|---|---|
| `clean.mp4` is CFR 30 fps | `r_frame_rate=30/1`, `avg_frame_rate=30/1`, `nb_frames=150`, `duration=5.000000` |
| `clean.mp4` has audio | stream 1: `codec_name=aac`, `sample_rate=48000`, `channels=1`; `mean_volume=-15.5 dB`, `max_volume=-2.9 dB` |
| `clean.mp4` has no rotation | `stream_side_data=rotation` returns empty |
| `ugly.mp4` is VFR | `r_frame_rate=30/1` vs `avg_frame_rate=400/19` (~21.05); packet deltas: 60 x 0.0333 s, 19 x 0.1000 s |
| `ugly.mp4` rotation 90 | `side_data_type=Display Matrix`, `rotation=90` (no `TAG:rotate` — see note 3) |
| `ugly.mp4` HDR tags | `color_primaries=bt2020`, `color_transfer=smpte2084`, `color_space=bt2020nc` |
| `broll-silent.mp4` has no audio | audio stream count = `0` |
| `brand-logo.png` has alpha | `pix_fmt=rgba`; alpha plane `YMIN=0`, `YMAX=255`, `YAVG=14.88` |
