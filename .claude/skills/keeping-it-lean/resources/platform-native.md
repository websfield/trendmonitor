# Platform-native cheatsheet

Rung 4 of the ladder: *does the platform already do this?* Before reaching for a package,
scan here. Native features ship with the runtime, don't break on updates, and are
maintained by people whose whole job is that problem. Mark a deliberate native choice with
a `// SHORTCUT:` only if it has a real ceiling; most of these are simply the right answer.

This is a starting set, not exhaustive. Verify support for your target runtime/browser
baseline before relying on a newer entry.

## HTML — form controls & widgets

| You think you need | The platform has |
|---|---|
| Date / time / color / range picker library | `<input type="date|time|color|range">` |
| Modal / dialog library | `<dialog>` + `dialog.showModal()` (backdrop, focus trap, Esc free) |
| Accordion / FAQ component | `<details><summary>…</summary>…</details>` |
| Progress bar / gauge | `<progress value max>` / `<meter value>` |
| Searchable dropdown / autocomplete | `<input list>` + `<datalist>` |
| Tooltip library (simple) | `title` attribute, or CSS `::after` + `content` |
| Auto-growing textarea | CSS `field-sizing: content` |
| Client-side form validation | `required`, `pattern`, `min`/`max`, `type=email|url`, `:invalid` |
| Lazy-loaded images | `<img loading="lazy">` |

## CSS — things people reach for JS to do

| You think you need JS for | CSS has |
|---|---|
| Responsive font / spacing | `clamp(min, vw, max)` |
| Dark mode / reduced motion | `@media (prefers-color-scheme: dark)` / `(prefers-reduced-motion)` |
| Responsive grid without breakpoints | `grid-template-columns: repeat(auto-fill, minmax(250px, 1fr))` |
| Component-level responsiveness | `@container` queries |
| Theming / design tokens | custom properties (`--color: …`) |
| Smooth scroll / scroll-snap carousel | `scroll-behavior: smooth` / `scroll-snap-type` |
| Aspect ratio box | `aspect-ratio: 16 / 9` |
| Truncate / multi-line clamp | `text-overflow: ellipsis` / `-webkit-line-clamp` |
| Sticky header | `position: sticky; top: 0` |
| Parent / sibling state styling | `:has()` |
| Style isolation / nesting | `@layer`, native CSS nesting |

## JavaScript / browser APIs

| You think you need a library for | The runtime ships |
|---|---|
| `query-string` / `qs` | `new URLSearchParams(location.search)` |
| `moment` / `date-fns` (formatting) | `Intl.DateTimeFormat`, `Intl.RelativeTimeFormat` |
| `numeral` / currency formatting | `Intl.NumberFormat(locale, { style: 'currency', currency })` |
| `lodash.debounce` (often) | a 4-line `setTimeout` closure |
| `lodash.get` / `.cloneDeep` | optional chaining `?.`, `structuredClone()` |
| `uuid` | `crypto.randomUUID()` |
| `axios` (simple cases) | `fetch()` + `AbortController` |
| `classnames` | template literal / array `.filter(Boolean).join(' ')` |
| Event bus / pub-sub lib | `EventTarget` + `CustomEvent` |
| Deep equality (shallow cases) | `JSON.stringify` compare for plain data, or a 5-line walk |
| Polling / intervals with backoff | `setTimeout` recursion |

## Node / backend stdlib

| You think you need | Node / stdlib has |
|---|---|
| `dotenv` (Node ≥ 20.6) | `node --env-file=.env` |
| `node-fetch` | global `fetch` (Node ≥ 18) |
| `rimraf` | `fs.rm(path, { recursive: true, force: true })` |
| `mkdirp` | `fs.mkdir(path, { recursive: true })` |
| `uuid` | `crypto.randomUUID()` |
| small CLI arg parser | `util.parseArgs()` |
| `glob` (simple) | `fs.glob` (Node ≥ 22) / `fs.readdir` + filter |
| test framework (small) | `node:test` + `node:assert` |

## The rule

A native answer is the lean answer **only when it actually covers the requirement**. If the
native feature misses an edge case the spec needs, the requirement wins — cover it (with a
small dependency or your own code), don't ship a gap to save the dependency. Economy never
beats coverage.
