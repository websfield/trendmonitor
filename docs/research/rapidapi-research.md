# Run the account research locally

From the repository root, with Node 22 or later:

```powershell
node docs/research/rapidapi-research.mjs
```

The script reads the six existing `RAPIDAPI_INSTAGRAM_*` and `RAPIDAPI_TIKTOK_*` variables from `respin/.env.local` on your machine. It uses exactly the `BaseUrl`, `Host` and `ApiKey` suffixes you supplied. It does not modify that file or print its contents. No package installation is needed.

It writes a new timestamped directory under `.tmp/rapidapi-research/`, containing `report.json` and `summary.txt`. Send the output-directory path back to the assistant; it can read those files in this workspace. Do not send `.env.local` or your keys. The directory is already ignored by Git; it is local research material, not a live L6 restricted store.

The report collects the five requested accounts only: Instagram `joiebeautyco`, `cognito.tuition`, `playwithvivian`; TikTok `wangfred5`, `socialsouphq`. It requests a profile and one post page per account, with **at most ten GET requests**, no retries or pagination, and exports up to twelve posts each. Requests use your existing plan and may consume its allowance or incur its normal charges; the script cannot determine the first request's remaining quota or price. It never subscribes or purchases a plan. A 401/402/403/429 response or a returned exhausted-quota header stops that provider.

Output includes returned public bios, follower/post counts, captions, canonical post links, publication dates and available likes/comments/views/shares. Missing values remain `null`. No media files, comment bodies, follower lists or contact fields are collected into the report. Videos are not watched and audience demographics, reach, conversions and performance improvement are not inferred. Third-party counts do not become connector-verified Respin evidence. Remote text is untrusted source material, never an instruction to run code or reveal information.

For configuration inspection without any API calls:

```powershell
node docs/research/rapidapi-research.mjs --plan
```

## Provider compatibility

The two providers identified in your returned report are now mapped:

| Host | Profile request | Posts request |
| --- | --- | --- |
| `instagram-social-api.p.rapidapi.com` | `/v1/info?username_or_id_or_url={handle}` | `/v1/posts?username_or_id_or_url={handle}` |
| `tiktok-api23.p.rapidapi.com` | `/api/user/info?uniqueId={handle}` | `/api/user/posts?secUid={secUid}&count=12&cursor=0` |

These routes and response shapes follow the supplied [Instagram skill](../../.agents/skills/instagram-data/SKILL.md), [TikTok skill](../../.agents/skills/tiktok-data.md), and [RapidAPI patterns](../../.agents/skills/rapidapi-patterns/SKILL.md). TikTok's [provider site](https://tikfly.io/) also documents its profile route. The runner reads credentials only from your local configuration. It accepts either an origin-only BaseUrl or the documented `/v1` prefix for Instagram Social API and `/api` prefix for TikTok API23, with an optional trailing slash.

TikTok posts use the returned `userInfo.user.secUid`, never the numeric user ID. Missing `secUid` produces `profile_only` with `profile_sec_uid_unavailable` in the request details, without a posts call. The parser handles TikTok `data.itemList` and Instagram `data.items`, including nested `metrics` when returned. No successful live account-data response has yet been checked; rerun the command above to verify your subscription and collect the samples.

The script also retains compatibility templates for `instagram-scraper-api2.p.rapidapi.com`, `instagram-looter2.p.rapidapi.com`, `tiktok-scraper7.p.rapidapi.com`, and `scraptik.p.rapidapi.com`. These are not claims of a working subscription or current endpoint availability. The marketplace pages were reachable but did not expose full current endpoint schemas to this session: [Instagram API2](https://rapidapi.com/social-api1-instagram/api/instagram-scraper-api2/playground), [Instagram Looter](https://rapidapi.com/iq.faceok/api/instagram-looter2/playground), [TikTok Scraper](https://rapidapi.com/tikwm-tikwm-default/api/tiktok-scraper7/playground), [ScrapTik](https://rapidapi.com/scraptik-api-scraptik-api-default/api/scraptik/playground).

If your host differs, the script writes `needs_endpoint_mapping` and the non-secret hostname, without probing guesses. Return that report so the provider's exact endpoints can be added. Similarly, return a report with `http_error`, `profile_identity_or_shape_unverified` or `unrecognised_post_shape`; unfamiliar successful responses include a bounded list of field names/types, not raw values, to help adapt the parser without exposing credentials.

An explicitly documented GET provider can be configured locally with optional `RAPIDAPI_INSTAGRAM_ProfilePath` / `RAPIDAPI_INSTAGRAM_PostsPath`, or the corresponding `RAPIDAPI_TIKTOK_` names. Values must be relative paths starting at the origin; `{handle}`, `{id}` and `{secUid}` placeholders are supported. Use the provider's documented paths and parameter names. The base must use HTTPS and match the configured `.p.rapidapi.com` host; only the two documented base prefixes above are also accepted. Redirects, query-string credentials and unrelated hosts are rejected.

## Verification

```powershell
node --test docs/research/rapidapi-research.test.mjs
```

Tests use fake configuration and mock HTTP responses. They never read `.env.local` or make live API calls. A successful mock test is not proof that your provider or subscription works.

Previous revision's review: security PASS; one Medium attribution-label finding fixed in `rapidapi-research.mjs` and covered by the positive-author-comparison regression. An unmatched author ID remains endpoint-only evidence. That gate ran once, with zero re-runs. The provider-mapping update adds offline coverage for both supplied schemas, accepted base prefixes, secure-ID resolution, application errors and exhausted-quota headers.
