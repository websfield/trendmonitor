# OpenAI gpt-image — generated icons, illustrations, hero images

Use for **raster assets generated from a prompt**: icons, illustrations, hero/marketing images,
textures, mockups. Not for app UI layout (that's code / Stitch / Claude Design) and not for vector/SVG
(raster only — trace downstream if you need scalable). Docs: https://developers.openai.com/api/docs/guides/image-generation

> ⏱ **Time-sensitive (captured 2026).** Model ids, params, and pricing change — `gpt-image-1` is already
> sunsetting. Confirm on the linked docs, and keep the model id in config (see below) so a change is one line.

## Models (2026) — don't hardcode the id
- **`gpt-image-2`** — flagship; strong on clean interfaces/app-screen renders when layout+copy specified.
- **`gpt-image-1.5`** — previous flagship; supports **transparent backgrounds** (PNG/WebP alpha).
- **`gpt-image-1-mini`** — budget, for cheap drafts. · **`gpt-image-1`** — deprecating ~Oct 2026; avoid.
- **Pin the model id in config/env**, not inline, so a deprecation is a one-line change.
- ⚠️ Verify on the live model page whether `gpt-image-2` supports transparency at the time you build; if
  you need transparent PNGs and it doesn't, default that path to **`gpt-image-1.5`**.

## Endpoints & key params
- `POST /v1/images/generations` (`images.generate`) and `POST /v1/images/edits` (`images.edit`); also a
  built-in tool in the Responses API for multi-turn editing.
- `size`: `1024x1024`, `1536x1024`, `1024x1536`, `auto` (gpt-image-2 also custom up to ~4K, edges ×16).
- `quality`: `low` | `medium` | `high` | `auto`. `background`: `opaque` | `transparent` | `auto`.
- `output_format`: `png` | `jpeg` | `webp`. `moderation`: `auto` | `low`. `n`. `partial_images` (0–3 stream previews).

## Minimal shape (Python)
```python
import base64, pathlib
resp = client.images.generate(
    model=IMAGE_MODEL,              # from config, e.g. "gpt-image-2"; fallback "gpt-image-1.5"
    prompt="App icon: minimal blue rocket, flat, transparent background, no text",
    size="1024x1024", quality="high",
    background="transparent",       # transparency: gpt-image-1.5 (verify for gpt-image-2)
    output_format="png", n=1,
)
# Response is base64, NOT a URL — decode and write bytes yourself.
pathlib.Path("src/assets/icons/rocket.png").write_bytes(
    base64.b64decode(resp.data[0].b64_json))
```

## When-to-use / param picks
- **Iterating/drafts** → `mini` or `quality=low`, square. **Final hero** → `gpt-image-2`/`1.5`, `high`, landscape.
- **Icons** → transparent PNG, square; commit to one visual style across the set.
- **Web delivery** → `webp` + compression.
- **A consistent set** (icon family, ad variants) → generate the whole set in **one prompt of ≤8 images**
  with a shared style preamble (the model plans for consistency) rather than N separate calls.
- **Editing an existing asset** → `images.edit` / the Responses tool.

## Gotchas & mitigations
- **Text rendering** is improved but imperfect → quote exact strings, specify font/size/placement, add
  "render verbatim, no extra or duplicate text." For critical text, overlay it in code instead.
- **No vector** → trace raster to SVG downstream (e.g. potrace) if you need scalable icons.
- **Latency** on high/large/portrait → use low/medium square for drafts; `partial_images` for previews.
- **Moderation false positives** → set `moderation=low`.
- **Cost** is per image (roughly: low ≈ $0.01, medium ≈ $0.04, high ≈ $0.17–0.20 at 1024²; mini cheaper;
  Batch API ~50% off). No free tier; respect tier rate limits (RPM + images/min). Verify current pricing.

## Bring it back into the repo
- Always **decode `b64_json` → `write_bytes`** to a versioned asset dir with a deterministic slug name.
- Never store a hosted URL — there isn't one. Commit the asset.
- Keep the API key in an env var (`.env.example` placeholder); never commit it.
