# Respin visual v2 audit

2026-09-19. New visual-redesign goal requested in this session. This is a presentation audit, not a production-readiness verdict.

- Reviewed the v5 handoff and all four PNG concepts in `docs/design/v2/mockups/`. Opened the actual HTML with installed Playwright Chromium at 1440×1000; captured `.tmp/respin-v2-prototype-light.png`. The prototype renders local fixture content and embedded SVG assets.
- Existing `respin/DESIGN.md` and `app/respin-tokens.css` specify the earlier Signal system: dark by default, cobalt, compact corners. Root layout has no theme controller. The approved replacement is Colour Pop by default and After Hours as a persisted local preference.
- `app/globals.css` combines controls, shell, marketing and demo styles in 1,336 lines. Separate these by responsibility while retaining cascade order.
- Studio currently places its entire form above the output. `studio-panel.tsx` owns action/feedback/revision state; `generation-outcome.tsx` combines document, checks and refusal rendering. Retain the state owner and split presentation components.
- Studio's modes and prices are server projections. `tests/studio-ui.test.tsx` bans literal mode IDs throughout that directory. Add presentation grouping to the existing server offer; never infer access from visual group or label.
- Stored shots link by `beatIndex`. Timed text has no stored scene link. The prototype's Say/Show/Text fixture cannot be zipped onto production arrays.
- Production Brain already includes per-field evidence, confirmation, activation, version history and proposals. Its large view must not gain another large block of JSX; extract existing sections before adding overview navigation.
- Prototype sample balance, costs, history/search, four-step setup and reference thumbnails do not establish those production capabilities. Preserve real data and complete onboarding, and omit fixture-only controls from production.
- Existing edits include root policy/config, design-directory moves, product pages, tests, packages and journey files. Preserve all unrelated work; compare this task against its start state, not only HEAD.

No application source was changed by this audit. No generation, billing operation, migration or external write was invoked.
