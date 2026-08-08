# Cutdown end-to-end golden set

The standing end-to-end fixture corpus for the Phase 6 proving run (phase plan task 4).
Everything here is synthetic — ffmpeg `lavfi` sources and `flite` synthesised speech, same
provenance rules as `../ingest/` (see `../ingest/LICENSE-FIXTURES.md`). No real footage,
no human voice, no performer rights.

## Layout

- `source/promo-take.mp4` — the speech-rich e2e source clip (27 s, CFR 30/1, 640x360,
  H.264 + AAC 48 kHz mono). Five flite utterances separated by 1.6 s silence gaps, so
  speaker-turn × shot-boundary segmentation yields multiple retrievable Moments — the
  ingest golden set's 5 s clips yield exactly one Moment each, which is below the
  REQ-036 footage-sufficiency floor (`max(3, variantCount × 2)` rankable Moments).
- `source/promo-take.mp4.rights.yaml` — cleared synthetic-fixture rights record.
- `job/` — the promoted proving-run job (`e2e-mixed-1`): committed artefacts of the full
  brief → ingest → index → propose → plan → validate → draft render → approve →
  final render → package chain, minus the bulk media (`source/`, `proxy/` and render
  masters are reproducible from the corpus; the run-log, requests, recorded-model files
  and committed JSON artefacts are the fixture).

## Generation

```bash
ffmpeg -f lavfi -i "testsrc2=size=640x360:rate=30:duration=27" \
  -f lavfi -i "flite=text='Here is the plan for the cafe shoot we are filming today.':voice=slt" \
  -f lavfi -i "flite=text='First we set the scene so you can see exactly what the camera sees.':voice=slt" \
  -f lavfi -i "flite=text='Then we cut the whole take down to one short vertical clip for the feed.':voice=slt" \
  -f lavfi -i "flite=text='After that the captions are burned in and checked against the audio.':voice=slt" \
  -f lavfi -i "flite=text='At the end you get the finished cut delivered with captions and all.':voice=slt" \
  -f lavfi -i "anullsrc=r=48000:cl=mono:d=1.6" \
  -filter_complex "[1:a]aresample=48000[a1];[2:a]aresample=48000[a2];[3:a]aresample=48000[a3];[4:a]aresample=48000[a4];[5:a]aresample=48000[a5];[6:a]asplit=4[s1][s2][s3][s4];[a1][s1][a2][s2][a3][s3][a4][s4][a5]concat=n=9:v=0:a=1,apad[aout]" \
  -map 0:v -map "[aout]" -t 27 \
  -c:v libx264 -preset veryfast -crf 30 -pix_fmt yuv420p -r 30 -fps_mode cfr \
  -c:a aac -b:a 96k -ar 48000 -movflags +faststart -y promo-take.mp4
```
