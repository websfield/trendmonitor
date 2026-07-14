# DESIGN.md template

Copy this to `DESIGN.md` at the repo root and fill every section from the product's real subject — not
from defaults. Keep it short and load-bearing: tokens here are the single source every screen and every
tool (Stitch, Claude Design, etc.) must read. Delete the guidance comments as you fill it.

---

```markdown
# Design System — <Product>

> The look and feel of <product>. Pairs with NORTH_STAR.md (what it's for).
> Every UI reads its tokens from here. Add a token here before using it in a component.

## Thesis
<One or two sentences: what this product is, who it's for, and the feeling the UI should create.
This drives every choice below.>

## Dials
- Density: <1–10>   · Motion: <1–10>   · Variance: <1–10>
- Accent colors: <max 1>   · Max accent saturation: <<80%>

## Color
| Token | Hex | Use |
|---|---|---|
| bg | #...... | page background |
| surface | #...... | cards / raised |
| text | #...... | primary text (≥4.5:1 on bg) |
| muted | #...... | secondary text (≥4.5:1) |
| accent | #...... | the single accent — primary actions, emphasis |
| border | #...... | hairlines / dividers |
<Add states (success/warn/danger) only if the product needs them. No "AI purple".>

## Typography
- Display / heading: <typeface> — <why it fits the subject> (avoid defaulting to Inter for premium)
- Body / UI: <typeface>
- Scale: <e.g. 12 / 14 / 16 / 20 / 28 / 40> · Line-height: <body / heading>

## Spacing & layout
- Spacing scale: <e.g. 4 / 8 / 12 / 16 / 24 / 32 / 48>
- Radius: <e.g. 6px> · Max content width: <e.g. 1120px>
- Grid / signature layout move: <the asymmetric/editorial idea that makes this recognizable —
  not "3 equal cards", not "centered hero" if variance > 4>

## Motion
- Allowed: transform, opacity only · Duration: 150–300ms · Respects prefers-reduced-motion
- Where motion is used: <list the few intentional places>

## Components
- Icon family: <one family> · Button styles: <primary / secondary / ghost>
- Elevation: <how depth is shown — shadow sparingly, or borders>
- Card nesting: max 2 levels

## Signature element
<The one thing someone remembers about this UI. If blank, the design isn't done.>

## Voice (microcopy)
- Tone: <e.g. plain, warm, expert> · Buttons: active verbs · Labels consistent with their toasts
- Empty/error states always say what to do next. Never fabricate data.

## Anti-patterns for THIS project
<Any default to explicitly reject here, plus deliberate exceptions to the global bans and why.>
```
