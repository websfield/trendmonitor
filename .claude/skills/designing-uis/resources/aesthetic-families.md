# Aesthetic families — pick a direction deliberately

The anti-slop bans say what *not* to do; this menu is the positive counterpart. Each family is a named,
coherent direction with token starting points — a place to *start* a `DESIGN.md`, not a finished system.
Use it when the person has no references to give: recommend the family that fits the product's subject,
show 2–3 as rendered variants, and let them pick with their eyes.

Rules of use: pick **one** family per product (mixing reads as indecision); the starting tokens below
still get tuned to the product's real subject; every family still passes Tier 1 (contrast, focus,
targets) and the anti-slop bans. Three families deliberately live near clusters the anti-slop list bans
as *defaults* — picking one **here**, recorded in `DESIGN.md`, is exactly the "deliberate reason" that
ban list allows, **but** tune the starting tokens so the result isn't the banned default cluster
verbatim (each such family's slop-risk line names its cluster).

## 1. Editorial / magazine
- **Feels like:** a well-set longread; content is the hero.
- **Fits:** content-first products — blogs, docs, publications, portfolios with writing.
- **Tokens to start:** serif display (e.g. a high-contrast or old-style face) + neutral sans body;
  ink-on-paper palette (near-black on warm white, one deep accent); generous line-length discipline
  (~65ch) and whitespace; big, honest type hierarchy (3+ distinct sizes).
- **Signature moves:** oversized opening type, drop caps or running heads, hairline rules as structure.
- **Slop risk to watch:** don't let "clean" collapse into default-white-page-with-Inter; this family lives near the banned "broadsheet + hairline-rules" cluster — earn it with a real editorial voice and tuned tokens, never the default verbatim.

## 2. Swiss / international
- **Feels like:** a system, not a decoration; everything on a visible logic.
- **Fits:** dashboards, documentation, tools where trust = order.
- **Tokens to start:** one neo-grotesque family at 2–3 weights; strict column grid you can *see* the
  ghost of; black/white/one warm gray + a single red-adjacent accent; spacing on a hard scale (4 or 8px).
- **Signature moves:** exposed grid alignment, flush-left ragged-right everywhere, functional color only.
- **Slop risk:** sterile sameness — the signature element matters more here, not less.

## 3. Brutalist / raw
- **Feels like:** built by someone with conviction; no cushioning.
- **Fits:** dev tools, personal sites, products whose audience distrusts polish.
- **Tokens to start:** system font stack or one mono; hard 1–2px borders, zero border-radius, zero
  shadows; stark contrast (true black/white) + one loud accent; dense but aligned.
- **Signature moves:** visible structure (borders around everything), underlined links, unapologetic
  default-blue focus rings.
- **Slop risk:** raw ≠ careless — alignment and hierarchy still have to be exact or it reads as broken.

## 4. Soft-depth / tactile
- **Feels like:** friendly, physical, safe to touch.
- **Fits:** consumer apps, onboarding-heavy products, anything for non-technical daily use.
- **Tokens to start:** rounded radii on one consistent scale (e.g. 8/12/16); layered surfaces with *soft,
  short* shadows (never the huge blurry default); muted, slightly warm palette, saturation held back;
  humanist sans.
- **Signature moves:** cards that read as physically stacked, gentle press/hover motion on `transform`.
- **Slop risk:** this is the family closest to the AI default — the signature element and restrained
  palette are what keep it from being generic.

## 5. Data-dense / instrument
- **Feels like:** a cockpit; every pixel is information.
- **Fits:** analytics, trading, admin panels, ops tooling — expert daily-driver screens.
- **Tokens to start:** compact spacing scale (2/4/8); tabular numerals mandatory, mono for identifiers;
  muted neutral background so **semantic color is reserved for data** (up/down, ok/warn/crit); thin
  separators over boxes.
- **Signature moves:** aligned numeric columns, sparklines/inline viz, keyboard-first affordances.
- **Slop risk:** density without hierarchy — one glance must still answer "what matters right now?"

## 6. Retro-terminal
- **Feels like:** a serious tool with a wink; the CLI made comfortable.
- **Fits:** developer products, CLI companions, hacker-audience tools.
- **Tokens to start:** one mono family everywhere; near-black background, phosphor green/amber *or* a
  restrained modern accent; blocky selection states; scanline/CRT nostalgia at most one subtle instance.
- **Signature moves:** prompt-style affordances (`>` markers), block cursors, ASCII structure characters.
- **Slop risk:** the wink becomes the whole joke — cap the nostalgia at one element; this family lives near the banned "near-black + acid-green" cluster — shift the phosphor hue or take the modern-accent option, never the default verbatim.

## 7. Warm-organic / handcrafted
- **Feels like:** made by people, for people; hospitality.
- **Fits:** food, wellness, community, education, local commerce.
- **Tokens to start:** humanist serif or rounded sans for display; cream/earth palette (never pure
  white/black) with one botanical or terracotta accent; illustration-friendly spacing; soft but *few*
  curves.
- **Signature moves:** hand-drawn or organic-shaped accents, photography with consistent warm grading.
- **Slop risk:** twee — one organic motif, not five; this family lives near the banned "cream + serif + terracotta" cluster — vary at least one leg of that triad, never ship it verbatim.

## 8. Luxury / minimal
- **Feels like:** confidence through restraint; price is not the objection.
- **Fits:** premium brands, high-end services, portfolio pieces.
- **Tokens to start:** thin-to-regular weights of one refined sans or serif, generous letter-spacing on
  small caps; near-monochrome plus **one** deep or metallic accent; extreme whitespace (double your first
  instinct); slow, subtle motion (200–300ms, opacity/transform only).
- **Signature moves:** vast negative space, small centered wordmarks, full-bleed imagery with quiet type.
- **Slop risk:** empty ≠ luxurious — the few elements present must be flawless (kerning, alignment,
  image quality), or the restraint reads as unfinished.
