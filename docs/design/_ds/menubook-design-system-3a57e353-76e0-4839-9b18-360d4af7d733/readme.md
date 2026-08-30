# Menubook Design System

> **More local. More rewarding.**
> The brand & UI system for **Menubook** — a self-hosted, open-source hospitality
> marketplace where diners discover, book, and order (dine-in QR, pickup, delivery)
> across many restaurants and earn **Bites** rewards, while operators run menus,
> orders, tables, kitchen, and loyalty.

This project is the **design system**: tokens, fonts, brand assets, reusable React
components, foundation specimen cards, and a full interactive UI kit. Consuming
projects link one file — [`styles.css`](styles.css) — and pull components from the
compiled bundle.

---

## Sources

This system was derived from:

- **Codebase** — `menubook/` (read-only mount). A Yarn-4 monorepo on **Medusa v2**:
  `apps/api` (Medusa modules: marketplace, menu, payment-stripe, table-session,
  realtime), `apps/storefront` (Next.js 14 diner app), `apps/vendor-dashboard`,
  `packages/shared`. Product canon lives in `menubook/docs/initial/` (north-star,
  PRD, UX principles, **loyalty design** → the Bites currency).
- **Brand concept board** — `uploads/concept_images-1781254902711.png`. A single
  comprehensive concept covering logo, palette, type, components, and six product
  surfaces (Discover, Restaurant, QR ordering, Rewards, Dashboard, Kitchen). This
  was the **primary visual source** — the codebase ships deliberately neutral
  grayscale placeholder tokens (`apps/storefront/app/globals.css`), awaiting exactly
  this brand import.

> ⚠️ **Naming:** the concept wordmark reads "**mesa**"; you asked for the brand to
> be **Menubook**. This system ships as *Menubook* (the clay "M" mark is retained,
> the wordmark is set in Satoshi). If the product is actually *Mesa*, say so and
> it's a one-line swap.

---

## Brand at a glance

- **Name / mark:** Menubook. The mark is a single clay→orange gradient **"M"** that
  hooks into a bowl/pin tail (`assets/logo-mark.png`, transparent — works on dark &
  light). The wordmark is **Satoshi Black**, lowercase.
- **Palette:** Mesa Green `#1E4D3A`, Warm Clay `#E76F51`, Golden `#F2B84B`,
  Sand `#F6F2EB`, Stone `#2B2B2B`.
- **Type:** **Satoshi** — one family, display + body.
- **Theme:** **dark-first** (warm, candlelit). A full warm-light theme ships as
  `.theme-light` / `[data-theme="light"]`.

---

## CONTENT FUNDAMENTALS

How Menubook writes.

- **Voice:** warm, plain-spoken, confident. Hospitality, not tech. Short sentences.
- **Person:** speak to the diner as **"you"** ("Your balance", "Use 100 Bites for
  $5 off", "You saved $5"). Operators are addressed by name ("Good morning, Alex").
- **Casing:** **Sentence case** everywhere — buttons, headings, nav. Tiny
  **UPPERCASE** overlines for section eyebrows only ("SERVICE OPTIONS", "DISCOVER").
- **Verbs over labels.** Actions are verbs: *Order now*, *Book a table*, *Order at
  table*, *Mark ready*, *Pay your share*. Order states are verbs/adjectives from the
  kitchen pipeline: *New · Preparing · Ready · Handed off*.
- **Numbers are the hero.** The big moments are quantified and bold: "**1,250** pts",
  "$**3,246**", "**$482** vs marketplace fees". Always pair points with cash value
  ("1,250 pts · **$12.50 value**").
- **Status is never colour-only.** Every state carries a text label (a hard product
  rule — `menubook/DESIGN.md`). Allergens use literal copy: *contains / may contain
  / ask venue* — never a green tick.
- **Loyalty copy creates a "joy moment"** without gamifying: a reward pill appears
  *only when usable* ("Use 100 Bites for $5 off"), confirms with a saved-amount line
  ("You saved $5 with 100 Bites"), then shows the next goal ("66 until your next $5").
- **Emoji:** essentially none in product UI. The concept shows a single waving 👋 in
  the dashboard greeting; otherwise iconography does the work. Don't sprinkle emoji.
- **Tone examples:** "Tap an item to add it to your round." · "Split between 2
  people." · "10% back in points · On all orders · Today." · "3 no-shows risk for
  today."

---

## VISUAL FOUNDATIONS

- **Colour vibe:** warm and earthy. Green is the trust/primary anchor; clay is the
  energy/accent and the link colour on dark; golden is reserved almost exclusively
  for **rewards / Bites**. Sand and Stone are the neutral poles. Nothing cold — no
  blue-grey, no purple gradients.
- **Theme:** dark-first. Dark surfaces are *warm* charcoals (`#14120F → #2F2A20`),
  not neutral black — a candlelit-dining feel. Text is Sand `#F6F2EB`. The light
  theme uses off-white sand backgrounds with white cards.
- **Backgrounds:** mostly solid warm surfaces. Food **photography** is the imagery
  system (warm, ambient, shot-on-wood interiors and overhead dishes) — full-bleed
  hero on the restaurant screen, 2-up collage on discovery cards, 64px rounded
  thumbnails in menu rows. The only gradients used are the **logo/reward golden
  gradient** and subtle top-of-screen protection scrims over hero photos.
- **Type:** Satoshi throughout. Display/headlines are **900 (Black)** with tight
  tracking (`-0.02 to -0.03em`); body is 400/500; section eyebrows are 11px **700
  uppercase** with `0.12em` tracking. Big numbers are Black.
- **Spacing:** 8px base grid (4px half-steps). Generous breathing room; screens
  use 20px side gutters.
- **Radii:** soft but not bubbly — buttons/inputs **12px**, cards **16px**, hero
  blocks **20–24px**, chips/pills/avatars **full**. Food thumbnails **12px**.
- **Borders:** hairline `1px` in a low-contrast warm tone (`#38322A` dark /
  `#E4DCCE` light). Cards = surface + hairline border; elevated cards add a soft
  shadow.
- **Shadows:** restrained. Light theme uses soft warm-grey shadows; dark theme
  leans on surface lift + borders, with deep black shadows reserved for floating
  things (sheets, the phone frame, the success modal).
- **Buttons:** primary = solid green, cream text, 12px radius, 44px tall, bold
  label. Secondary = transparent + hairline border. Reward = solid golden. The
  round green **"＋"** add control (full circle) is a signature.
- **Hover / press:** hover lifts cards `translateY(-2px)` + shadow; buttons darken
  one step. **Press shrinks** (`scale 0.92–0.97`); the add button uses a springy
  ease (`--ease-spring`) for a little "pop".
- **Transparency / blur:** used sparingly — overlay scrims, the back/heart buttons
  floating on hero photos (`rgba` + `backdrop-filter: blur(8px)`), and the success
  modal scrim.
- **Motion:** quick and calm. `--duration-fast 120ms` / `--base 200ms`; standard
  easing `cubic-bezier(0.2,0,0,1)`; the reward/add interactions get a gentle spring.
  No infinite decorative loops.
- **Status system:** new = clay/red, preparing = golden, ready = green, handed off =
  neutral — always a dot **plus** a text label.

---

## ICONOGRAPHY

- **Style:** clean **line icons**, ~1.5–2px stroke, rounded joints, friendly but not
  cartoonish — matching the concept board's nav and action icons (cloche/fork,
  shopping bag, scooter, star-badge, calendar, bell, heart, share, phone, compass,
  receipt, "＋").
- **Source / substitution:** the concept icons are custom. The codebase ships **no
  icon set** of its own (the storefront uses text + a single PWA PNG). This system
  standardises on **[Phosphor Icons](https://phosphoricons.com/)** (regular weight
  for line, fill weight for emphasis) loaded from CDN — its hospitality coverage
  (`fork-knife`, `moped`, `cooking-pot`, `storefront`, `coins`, `medal`, `gift`,
  `qr-code`) is the closest match to the concept's weight and feel. *This is a
  substitution* — if you have the original icon SVGs, drop them into `assets/icons/`
  and I'll wire them in.
- **Usage:** pass a Phosphor `<i className="ph ph-name" />` (or `ph-fill`) into any
  component's icon prop. Load both stylesheets in a page:
  `@phosphor-icons/web@2.1.1/src/regular/style.css` and `.../fill/style.css`.
- **Emoji / unicode:** avoided as iconography. The round add control renders the
  unicode "＋" (fullwidth plus) and rating uses "★" by convention — those two aside,
  use Phosphor.

---

## Index / manifest

**Foundations**
- [`styles.css`](styles.css) — the single entry point (imports only).
- [`tokens/`](tokens/) — `colors.css`, `typography.css`, `spacing.css`,
  `effects.css`, `fonts.css`. `base.css` is the element reset.
- [`guidelines/`](guidelines/) — foundation specimen cards (logo, palette, scales,
  surfaces, status, type scale, Satoshi weights, spacing, radius/elevation).
- [`assets/`](assets/) — `logo-mark.png` + `food/` photography (cropped from the
  concept board).

**Components** (`window.MenubookDesignSystem_3a57e3`) — see each `*.prompt.md`
- Actions: `Button`, `IconButton`
- Forms: `SearchField`, `SegmentedControl`
- Data display: `Card`, `StatCard`, `Avatar`, `RatingStars`
- Feedback: `Chip`, `StatusPill`, `Badge`
- Menubook (domain): `RewardPill`, `PointsBalance`, `MenuItemRow`, `RestaurantCard`
- Navigation: `BottomNav`, `Tabs`

**UI kits**
- [`ui_kits/diner/`](ui_kits/diner/) — interactive diner app: Discover → Restaurant
  → QR session → split bill → rewards (warm dark theme).

**Meta**
- `SKILL.md` — Agent-Skills-compatible entry point.

---

## Using the system

```html
<link rel="stylesheet" href="styles.css" />            <!-- dark by default -->
<div class="theme-light">…</div>                        <!-- opt into light -->
<script src="_ds_bundle.js"></script>                   <!-- compiled, do not hand-edit -->
<script>const { Button, RewardPill } = window.MenubookDesignSystem_3a57e3;</script>
```

`_ds_bundle.js`, `_ds_manifest.json`, and `_adherence.oxlintrc.json` are generated
by the compiler — never edit them by hand.
