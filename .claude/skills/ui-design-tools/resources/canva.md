# Canva Connect API — marketing & brand-template assets

Use for **marketing/social/brand collateral at scale** that should stay human-editable and on-brand:
ad/social variants, brand-template autofill, letting non-designers edit then exporting PNG/PDF into a
pipeline. **Not** for in-product UI design, dev handoff, pixel-perfect mockups, or anything needing SVG —
that's Figma/code/Stitch territory. Docs: https://www.canva.dev/docs/connect/

> ⏱ **Time-sensitive (captured 2026).** API spec version, scopes, export formats, rate limits, and the
> Enterprise gate change — confirm against the linked docs before building the integration.

Two platforms — pick by where the work runs:
- **Connect APIs** = server-side REST (your backend calls Canva). ← this file.
- **Apps SDK** = a JS/React app running *inside* the Canva editor. Different use case.

## Auth (once)
- **OAuth 2.0 Authorization Code + PKCE (SHA-256)**, mandatory. Token endpoint `POST /v1/oauth/token`;
  access tokens last ~4h, renew via refresh token. https://www.canva.dev/docs/connect/authentication/
- **Scopes are explicit and not implied** (`asset:write` ≠ `asset:read`). For export-only, the minimal
  scope is `design:content:read`. Autofill adds `brandtemplate:*` + `asset:write`. Keep client id/secret
  in env vars. https://www.canva.dev/docs/connect/appendix/scopes/

## Load-bearing sequences
**Export a design → repo** (everything mutating is an async *job* → always poll):
1. `POST /v1/exports` `{ design_id, format:{ type:"png"|"pdf"|"jpg"|... } }` → `job.id`.
2. Poll `GET /v1/exports/{jobId}` until `status === "success"`.
3. `job.urls[]` = one download URL per page. **URLs expire in 24h — download immediately**, write to the
   asset dir, commit.

**Upload an asset** (needed before using media in autofill):
- `POST /v1/asset-uploads` (binary body + Base64 metadata header) → poll `GET /v1/asset-uploads/{jobId}`
  → keep the returned `asset.id`.

**Autofill a brand template** (the killer use case — fan out on-brand variants):
- `GET` the template dataset → `POST /v1/autofills` with the template id + field data (text or uploaded
  `asset.id`s) → poll → export. https://www.canva.dev/docs/connect/autofill-guide/

## Formats & limits
- Export formats: `jpg, png, gif, pdf, pptx, mp4, csv, html_bundle, html_standalone`. **No SVG** from
  Connect export.
- **Rate limits** are per-endpoint (e.g. export ~10 req/10s) → handle `429` with backoff.
- **The big gate: Autofill + Brand Template APIs require the acting user to be in a Canva *Enterprise*
  org** (not Free/Pro/Teams). Verify this *first*; if the user isn't Enterprise, fail fast and pick
  another path. Plain create/export works without Enterprise. https://www.canva.com/help/canva-api/
- Public integrations go through Canva review; beta/preview APIs fail review.

## What to encode in your integration
- **Decision check:** marketing/social/brand batch → yes; in-product UI / SVG / dev handoff → no.
- **Auth once**, request explicit read+write scopes, refresh on ~4h expiry.
- **Always poll** every job; **backoff on 429**; treat download URLs as **expiring (24h)** — pull and
  commit immediately, never store the URL.
- **Autofill?** confirm Enterprise acting user before building the flow.
