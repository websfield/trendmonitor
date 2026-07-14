"""Deterministic fakes for every external extraction tool (P2-T8).

No network, no binary, no clock: each fake returns exactly what the test configures. A unit test
that exercises the pipeline never touches ``yt-dlp``, ``ffprobe``, ``ffmpeg``, Whisper, or OCR.
"""
