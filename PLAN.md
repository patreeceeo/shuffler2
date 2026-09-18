# Shuffler2 — Development Plan

A frontend-only WYSIWYG tool for building and sharing rotations (chores, on-call,
dish duty, standup facilitator). All state lives in the URL; no backend, no database,
no accounts.

Successor to <https://zzt64.com/shuffler/> ("v1").

---

## 1. What v1 does, and what carries forward

v1 is ~150 lines of vanilla JS + Pico CSS: a textarea of items, an integer
"randomizer", a start date, and an output list grouped into pairs under
"Week of <date>" headings. State is in the query string:

```
?items=Ada&items=Grace&items=Linus&randomizer=3&rotationStart=2026-09-17
```

**Carry forward:**

- **Pico CSS.** Classless, tiny, already the house look. Keep it.
- **Group size.** v1 has `group-size` (names per slot) wired up but `disabled`, hardcoded
  to 2. v2 should finish it — "two people on dishes each week" is a real rotation shape.
- **Calendar-safe date math.** v1's `addWeeks` uses `setDate(getDate() + n*7)`, which is
  the correct DST-safe approach. Keep that habit (see §3.4).
- **Paste-a-list-and-go.** The textarea is the fastest possible name entry. Whatever the
  new UI looks like, multi-line paste must still work.

**Drop or change:**

- **The permutation index.** v1's cleverest idea: the shuffle is stored as a single
  integer `n ∈ [0, len!)` and decoded to a permutation via a Lehmer-style algorithm.
  Elegant, and it makes the URL tiny — but it breaks down at 19 items (19! exceeds
  `Number.MAX_SAFE_INTEGER`, and the float division in `integerToPermutation` loses
  precision before that), and it cannot represent a _manual_ reorder without
  round-tripping through a search for the matching index. v2 stores the name array in
  its displayed order instead: one source of truth, arbitrary length, manual reorder and
  shuffle are the same operation. See §2.
- **Query string → fragment.** See §2.
- **No shuffle button.** In v1 you shuffle by typing a different number. v2 gets a button.

**Bugs in v1 worth fixing on the way in:**

- `formatISODateString` uses `toISOString()`, which converts to **UTC** — west of
  Greenwich the date input renders a day early. Format from local Y/M/D fields instead.
- `updateDOMOutput` writes item text into `innerHTML`. Since state arrives from a link
  someone else sent you, `?items=<img src=x onerror=…>` is stored XSS. React escapes by
  default, which closes this — but note it, because any future `dangerouslySetInnerHTML`
  reopens it.
- `setTimeout(…, 100)` as the init hook. Replace with normal mount.
- `randomizer` silently clamps to `len!-1` when the name list shrinks, so editing names
  changes the shuffle. Not an issue once the order is stored directly.

---

## 2. Decisions

| Decision            | Choice                                                                         |
| ------------------- | ------------------------------------------------------------------------------ |
| Stack               | Vite + React + TypeScript + React Compiler 1.0                                 |
| Styling             | Pico CSS v2 (as v1) + a little local CSS                                       |
| State transport     | Compressed blob in the URL fragment (`#s=…`), native `CompressionStream`       |
| Date helpers        | Recurrence generator + manual add/edit/remove                                  |
| Name ↔ date pairing | Positional round-robin, `groupSize` names per slot                             |
| Name order          | Stored explicitly; manual drag-reorder and shuffle both just rewrite it        |
| Hosting             | Static, GitHub Pages, deployed by Actions; `base: './'` so it runs at any path |

**Why the fragment and not the query string.** The fragment is never sent to the server,
so no one's chore chart lands in an access log, and the page behaves identically on
`file://`, on GitHub Pages, and behind any static host. It also means state changes never
touch the network.

It also removes the usual GitHub Pages headache. Pages serves static files with no
rewrite rules, so a normal SPA needs the `404.html`-redirect hack to make deep links
work. Because every shareable link here is `index.html#…`, there are no deep paths to
rewrite — Pages serves the one file and the app reads the fragment. No `404.html`, no
router, no redirect dance. See §9.

Cost: v1's URLs were human-readable and v2's will not be. §3.6 keeps a readable escape
hatch.

**What positional round-robin implies.** The schedule is a _derived value_, never stored.
With `g = groupSize`, slot `i` gets `names[(i*g + j) % names.length]` for `j ∈ [0, g)`.
The name list _is_ the rotation order, which makes the mental model obvious and keeps the
URL small.

**Manual reorder vs. shuffle.** Both are a write to `names`: drag-reorder is an array
move, shuffle is a permutation. Shuffling therefore discards a manual arrangement, which
is the agreed behavior — a manual reorder is a _correction_, not a pin. (If pinning is
ever wanted, it needs a separate `locked: number[]` field and a shuffle that permutes only
the unlocked positions. Out of scope for v1 of v2.)

---

## 3. Data model and URL format

### 3.1 In-memory state

```ts
type Slot = string // floating local wall-clock, "YYYY-MM-DDTHH:mm"

interface RotationState {
  v: 2
  title: string // "" when unset
  names: string[] // display order == rotation order
  slots: Slot[] // kept sorted ascending
  groupSize: number // names per slot, >= 1, default 1
}
```

That is the whole state. The schedule table, the per-person counts, and the share URL are
all computed during render.

### 3.2 Wire format

Serialize to a positional tuple (keys cost bytes), delta-encode the slots, deflate,
base64url:

```
tuple  = [2, title, names, groupSize, anchor, deltas]
anchor = minutes since 1970-01-01T00:00 of slots[0], read as naive local time
deltas = [slots[1]-slots[0], slots[2]-slots[1], …] in minutes
```

`JSON.stringify` → deflate → base64url → `location.hash = "s=" + blob`.

Delta encoding earns its keep: a weekly rotation becomes `[10080, 10080, 10080, …]`, which
deflate crushes to nothing. A 20-name, 52-week rotation should land around 200–300
characters.

**Compression.** Native `CompressionStream('deflate-raw')` / `DecompressionStream`.
Supported in every engine since Safari 16.4 / Firefox 113 / Chrome 80 (all-browser since
2023), so this costs **zero bytes of dependency**. The price is an async API, which is
affordable here: encoding is already debounced behind a 300 ms timer, and decoding happens
once on mount, so the hook seeds from `null` and fills in a tick later.

`fflate` (~8 kB, `deflateSync`/`inflateSync`) stays the fallback if the async seed turns
out to complicate the hook more than expected — but try native first. See §10.

**Versioning.** `v` is the first tuple element so a decoder can branch before it knows the
shape. Never renumber; only append.

### 3.3 Reading v1 links

v2 should open any URL v1 could produce. On mount, if there is no `#s=` but there _is_ a
`?items=` query string:

1. `items = params.getAll('items')`, `r = Number(params.get('randomizer') ?? 0)`.
2. Reproduce v1's `integerToPermutation(r, items)` — port the function verbatim into
   `lib/legacy.ts`, guard `items.length <= 18` — and use the result as `names`.
3. `groupSize = 2` (v1's hardcoded value).
4. Generate slots with v1's rule: start of the week _after_ `rotationStart` (Sunday-based),
   then weekly, `ceil(items.length / 2)` occurrences, at 00:00.
5. `replaceState` into the new `#s=` form and drop the query string.

This is maybe 40 lines and it means every link already shared keeps working. Write it in
M1 while the v1 source is fresh, not later.

### 3.4 Decoding is untrusted input

A hash can be hand-edited, truncated by a chat client, or come from an older build.
`decode()` returns `RotationState | null` and must never throw: try/catch, validate every
field, and fall back to an empty state with a dismissible "that link looked corrupted"
notice. Validate with a **Valibot** schema (1.4 kB gzipped, §10) rather than hand-rolled
type guards — the schema doubles as the documentation of the wire format, and `safeParse`
gives the never-throw contract for free. Cap at ~200 names and ~500 slots so a
hostile link cannot hang the render. Never render name text as HTML (see §1).

### 3.5 Time is floating, deliberately

Slots are naive local wall-clock strings with **no timezone and no UTC conversion**. "Every
Monday at 9am" should read as 9am to everyone who opens the link — right for a household
chore chart, wrong for a cross-timezone on-call roster. Documented limitation; a `tz` field
can be appended to the tuple later without breaking old links.

**Consequence for the generator:** compute recurrence with _calendar_ arithmetic — increment
the day/month fields, keep `hh:mm` fixed — never by adding `7*24*60*60*1000` to a timestamp.
The naive approach drifts an hour twice a year. v1 got this right; don't regress it. Write
the DST test first. And format dates from local fields, never `toISOString()` (§1).

### 3.6 URL length

Live character count in the share bar. Amber warning above ~1,800 characters — some chat and
mail clients mangle longer links. "Copy as text table" is the escape hatch, and doubles as
the readability that the query string used to provide.

---

## 4. Architecture

```
src/
  main.tsx
  App.tsx                     layout, wires the pieces together
  state/
    schema.ts                 types, EMPTY_STATE, validate()
    codec.ts                  encode() / decode(), pure, heavily tested
    legacy.ts                 v1 ?items=… → RotationState
    useRotationState.ts       the one hook that owns state ↔ hash sync
  lib/
    dates.ts                  calendar arithmetic, recurrence expansion, formatting
    shuffle.ts                Fisher–Yates over crypto.getRandomValues
    schedule.ts               derive(state) -> Assignment[]
  components/
    Toolbar.tsx               title, Shuffle, Reset
    NameList.tsx              add / edit / drag-reorder / delete, multi-line paste
    RecurrenceBuilder.tsx     the date-time generator
    SlotList.tsx              manual add / edit / delete of individual slots
    ScheduleTable.tsx         the WYSIWYG result
    ShareBar.tsx              URL, Copy, length meter
```

### 4.1 The state hook

`useRotationState` is the only code that touches `location`:

- On mount: read the hash, decode, seed. No hash but a v1 query string → §3.3. Neither →
  the demo state (§5).
- On change: encode, write the hash, **debounced ~300 ms** — writing history on every
  keystroke is slow and destroys the back button.
- `history.replaceState` for continuous edits (typing, dragging).
- `history.pushState` for discrete actions: **shuffle**, generate-from-recurrence,
  delete-all. This gives undo via the browser back button for free — the highest
  value-per-line feature in the plan, and something v1 already half-had.
- Listen for `hashchange`/`popstate` and re-seed, comparing the incoming blob against the
  last one written to avoid an echo loop.

### 4.2 Shuffle

Fisher–Yates over `crypto.getRandomValues`. No seed is stored — the shuffled order _is_ the
state, so the link reproduces it exactly. Reject a permutation identical to the current one
when `names.length > 1`; a shuffle that visibly does nothing reads as a broken button.

Animate the reorder with **AutoAnimate** (§10): one `useAutoAnimate()` ref on the names list
and one on the schedule table, no animation code, and it honours `prefers-reduced-motion` by
default.

---

## 5. UI

Three columns on desktop, stacked on mobile. Everything edits in place — no modals, no save
button, output updates as you type, exactly as v1 did.

```
┌────────────────────────────────────────────────────────────┐
│  [ Rotation title …            ]   ⟳ Shuffle    ⤫ Reset    │
├────────────────────────────────────────────────────────────┤
│ SCHEDULE                                                   │
│   Mon Sep 21, 9:00 — Ada          Mon Oct  5, 9:00 — Linus │
│   Mon Sep 28, 9:00 — Grace        Mon Oct 12, 9:00 — Ada   │
│   Ada 4 · Grace 4 · Linus 4                                │
├────────────────────────────────────────────────────────────┤
│  ┌─ NAMES 3 ─┬─ DATES 12 ─┐                                │
│  │ 1 Ada  ⋮⋮ │                                             │
│  │ 2 Grace⋮⋮ │   (the other builder is one click away)     │
│  │ 3 Linus⋮⋮ │                                             │
│  │ + add name│                                             │
│  │ people per slot: [1]                                    │
├────────────────────────────────────────────────────────────┤
│ 🔗 https://…/#s=N4Igb…  [Copy]   412 chars                 │
└────────────────────────────────────────────────────────────┘
```

> **Revised after the first build.** The original three-column layout put the schedule —
> the thing you are actually looking at after hitting Shuffle — in the far right column,
> below the fold on a laptop. The schedule now sits directly under the toolbar, and the
> two builders that feed it share a tab strip beneath it so only one is on screen at a
> time. Tabs come from **Base UI** (`@base-ui/react`, ~2.4 kB for Tabs), which is the
> actively-developed successor to Radix by the same engineers and what `shadcn init`
> now defaults to; Radix is still maintained but slower-moving.
>
> Two details that matter: the tab labels carry a **count badge**, so the hidden list's
> contents stay legible without switching; and the two builder panels are `keepMounted`,
> so a half-filled recurrence form is not discarded when you flip to Names and back. A
> kept-mounted panel is still `hidden`, i.e. out of both the layout and the accessibility
> tree.
>
> A third tab, **Help**, carries the prose that explains the link-as-document model, the
> round-robin rule, shuffle-vs-manual-order, and the floating-time decision — the things a
> first-time visitor cannot infer from an empty page now that there is no demo data. It
> takes no count badge and is not `keepMounted`: it is static prose with no form state to
> lose.

**The empty-URL invariant.** No hash ⇔ empty rotation, in both directions. A bare visit
writes no hash, and an empty rotation writes none either — so `Reset`, or deleting the last
name and date, hands back a clean URL rather than `#s=<blob encoding nothing>`. `flush`
short-circuits on `isEmptyRotation` and sets `lastWritten` to `null` to match what
`blobFromHash` reports for a bare URL, which keeps the echo guard intact.

**Names panel.** One input per row. Enter commits and opens a new row; Backspace on an empty
row deletes it and focuses the previous. **Multi-line paste splits into rows** — v1 users are
used to pasting a block, and handling it is four lines. Drag handles for manual reorder via
**`@dnd-kit/sortable`**, whose `KeyboardSensor` already provides space-to-lift, arrows-to-move,
escape-to-cancel and screen-reader announcements — so there is no separate Alt+↑/↓ path to
build (§10). Duplicate names are allowed,
not an error — someone may genuinely take two slots per cycle. `people per slot` is v1's
group-size control, finally enabled.

**When panel.** The recurrence builder reads as a sentence: _every [N] [day/week/month]
[on Mon] at [09:00] starting [date] for [N] times_. Defaults on first load: weekly, the next
upcoming Monday, 09:00, 12 occurrences. `Generate` **appends** and de-duplicates — it never
silently wipes what is there. Manual slots below it add, edit, delete individually. Slots
stay sorted ascending at all times.

**Schedule panel.** The live result: date, time, assigned name(s), grouped by month with
sticky headers. A per-person count footer, because the first question anyone asks a rotation
tool is "is this actually even?" — round-robin is even only when
`(slots.length * groupSize) % names.length === 0`, so surface the imbalance rather than hide
it.

**Empty state.** Both lists start **empty** — no demo data. A bare visit writes no hash
either, so the address bar stays clean until the first edit. Each panel carries its own
guidance line in place of content ("No names yet. Add one — or paste a whole list at once,
one name per line."), and the schedule panel says what is still missing rather than
rendering an empty table.

> Changed after the first build, which landed on a three-name demo. Demo data has to be
> cleared before real use, and a rotation is personal enough that seeing someone else's
> placeholder names is noise rather than explanation.

---

## 6. Milestones

**M0 — Scaffold and deploy.** Vite + React + TS with `base: './'`, Pico CSS bundled from
npm, ESLint/Prettier, Vitest, `public/.nojekyll`, and the Pages workflow from §9 (plus the
Settings → Pages → Source = "GitHub Actions" switch). Do this first, before any feature
work: a pipeline that already deploys turns every later milestone into a push. _Done when
a blank page is live at its public URL._

**M1 — Codec + legacy.** `schema.ts`, `codec.ts`, `legacy.ts`, tests. No UI. Round-trip
property tests, malformed-input tests, a size benchmark asserting the 20×52 case stays under
500 chars, and fixture tests decoding real v1 URLs. _Done when the codec can be trusted for
the rest of the build._

**M2 — State hook + names.** `useRotationState`, names panel, share bar. No dates yet.
_Done when typing names updates the URL and pasting that URL into a fresh tab restores them._

**M3 — Dates.** `dates.ts` with calendar arithmetic and DST tests, the recurrence builder,
manual slot editing. _Done when "every Monday at 9am ×12" yields twelve 9am slots across a
DST boundary._

**M4 — Schedule + shuffle.** `schedule.ts`, the schedule table with `groupSize`, the shuffle
button with pushState undo and row animation, drag + keyboard reorder. _Done when
back/forward walks shuffle history._

**M5 — Polish.** Responsive layout, keyboard flow, focus management, URL-length meter,
corrupted-link recovery, dark mode (Pico gives most of it), `<title>` from the rotation
title, link-preview meta tags.

**M6 — Nice-to-haves, in priority order.** `.ics` download · copy as markdown/plain-text
table · print stylesheet · per-slot skip (blanks a date, keeps the rotation) · "fair split"
as an alternative when the counts do not divide evenly · pinned names (§2) · QR code.

---

## 7. Risks and edge cases

- **DST drift** in recurrence generation → calendar arithmetic, tested in M3.
- **`toISOString()` creeping back in** for any user-facing date → lint rule or a code
  comment on `dates.ts`; this is the exact bug v1 shipped.
- **History pollution.** Debounce + `replaceState` for continuous edits is what keeps the
  back button meaningful.
- **Hash-write echo loop.** Guard by comparing the encoded blob to the last one written.
- **XSS via a shared link.** React escapes by default; never introduce
  `dangerouslySetInnerHTML` for name or title text.
- **Zero names / zero slots.** `i % 0` must be unreachable; render guidance, not `NaN`.
- **Uneven division.** Surfaced in the count footer.
- **Long links.** Metered, warned, text-table fallback.
- **Old links after a schema change.** Versioned tuple, append-only evolution, and a fixture
  file of real encoded links from every shipped version (plus the v1 query form) asserted to
  still decode. That test is what makes shared links durable.

---

## 8. Testing

- **Vitest unit tests** for `codec`, `legacy`, `dates`, `shuffle`, `schedule` — pure
  functions, and where the actual bugs will live.
- **Property tests** (`fast-check`): `decode(encode(s)) === s` for arbitrary valid states;
  shuffle produces a permutation and, over many runs, a roughly uniform one.
- **Fixture tests** for backward-compatible decoding, including v1 URLs.
- **One Playwright smoke test:** load, paste names, generate, shuffle, copy URL, open it in a
  fresh context, assert the schedule matches.

---

## 9. Deployment — GitHub Pages

The whole build is static files, so deployment should be one push with nothing to
configure. Three things make that true:

### 9.1 `base: './'`

```ts
// vite.config.ts
export default defineConfig({ base: './', plugins: [react()] })
```

Relative asset paths mean the same `dist/` works at `user.github.io/shuffler2/`, at
`zzt64.com/shuffler2/`, at a domain root, or from a local folder — with no rebuild and
no `VITE_BASE` environment variable to remember. The usual reason to avoid `base: './'`
is client-side routing, and this app has none: state is in the fragment (§2). Take the
free win.

### 9.2 The workflow

`.github/workflows/deploy.yml`, using the first-party Pages actions rather than a
`gh-pages` branch:

```yaml
name: Deploy
on:
  push: { branches: [main] }
  workflow_dispatch:
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: true }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run lint && npm run test -- --run
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

One repo setting is required and is easy to miss: **Settings → Pages → Source must be
"GitHub Actions"**, not "Deploy from a branch". Note it in the README.

Tests and lint run before the build, so a red build never reaches Pages.

### 9.3 Things that bite on Pages

- **`public/.nojekyll`.** Vite emits to `assets/`, so Jekyll's underscore rule is unlikely
  to hurt, but the file is free insurance and costs one line.
- **Bundle Pico, don't CDN it.** v1 loads Pico from jsdelivr. `npm i @picocss/pico` and
  import it instead: one less third-party dependency at runtime, works offline, and no
  flash of unstyled content if the CDN is slow.
- **Custom domain.** If this lives on `zzt64.com`, put a `CNAME` file in `public/` so the
  domain survives each deploy — Pages otherwise clears it when the branch content is
  replaced.
- **Deploying over v1's path.** If v2 replaces v1 at `zzt64.com/shuffler/`, every v1 link
  ever shared lands on v2 — which is exactly what the legacy decoder in §3.3 is for. That
  argues for shipping M1's `legacy.ts` _before_ the first public deploy. If v2 goes to a
  new path instead, leave v1 in place and add a link between them.
- **Caching.** Vite content-hashes asset filenames, so `assets/*` can cache forever while
  `index.html` must not. Pages sets its own headers and does not let you override them;
  its default `index.html` TTL is short, so this resolves itself — just don't be surprised
  by a minute of staleness right after a deploy.

### 9.4 Optional: one-file build

`vite-plugin-singlefile` inlines all JS and CSS into a single `index.html`. Not needed for
Pages, but it makes the app something you can email as an attachment or open from a USB
stick, which suits a tool whose entire state is already a URL. Worth adding at M5 if the
inlined size stays reasonable.

### 9.5 Budget

Target under ~150 kB gzipped. The library set in §10 adds roughly 10 kB on top of React and
Pico, so this is comfortable; the only thing that would threaten it is the Temporal polyfill
(~20 kB, Safari only, conditionally loaded). If the build exceeds the budget, the dependency
list has outgrown what this tool needs.

---

## 10. Library choices

Researched September 2026. Sizes are minified + gzipped.

### 10.1 Adopt

| Library                    | Size         | Replaces                           | Why                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | ------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Native `CompressionStream` | 0 kB         | fflate / lz-string                 | Baseline in every engine since 2023 (Safari 16.4, Firefox 113, Chrome 80). Async, which the debounced write path absorbs.                                                                                                                                                                                                                                                                              |
| **Valibot**                | 1.4 kB       | hand-rolled `validate()`           | Decoding a URL someone else sent is untrusted-input parsing. `safeParse` gives the never-throw contract of §3.4 directly, and the schema documents the wire format. Zod v4 is ~5 kB, `zod/mini` 3.9 kB — the ecosystem integrations they buy (tRPC, RHF, Drizzle) are all irrelevant here.                                                                                                             |
| **@dnd-kit/sortable**      | ~6 kB        | hand-rolled drag + Alt+↑/↓         | Actively maintained, ~2.8M weekly downloads. `KeyboardSensor` ships the full keyboard path and screen-reader announcements, which is the part that would otherwise get skipped. Pragmatic drag-and-drop (Atlassian, ~3.5 kB) is smaller but leaves accessibility to you. **Do not use `react-beautiful-dnd`** — Atlassian stopped maintaining it in 2022 and React 19 compatibility is not guaranteed. |
| **@formkit/auto-animate**  | <3 kB        | hand-rolled FLIP                   | One ref per animated list. Respects `prefers-reduced-motion` by default, which Motion and Motion One both leave to you. Motion (ex-Framer Motion) is 30 kB for an effect used on exactly two lists.                                                                                                                                                                                                    |
| **React Compiler 1.0**     | 0 kB runtime | `useMemo`/`useCallback` discipline | Stable since October 2025. Auto-memoization matters here because the schedule re-derives on every keystroke. Two setup traps below.                                                                                                                                                                                                                                                                    |

**React Compiler setup traps.** `@vitejs/plugin-react` v6 dropped internal Babel for oxc, so
the compiler needs `@rolldown/plugin-babel` alongside it, and the babel plugin must be listed
_before_ `react()`:

```ts
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'   // default export, not { babel }

export default defineConfig({
  base: './',
  plugins: [
    babel({ include: /\.[jt]sx?$/, presets: [reactCompilerPreset()] }),
    react(),
  ],
})
```

> **Corrected during M0.** The shape above is what `@rolldown/plugin-babel@0.2` actually
> exports: a *default* export taking `presets: [...]`, not a named `{ babel }` taking
> `babelConfig:` as most current write-ups (and this plan's first draft) claimed. The
> plugin-ordering advice was right.
>
> Likewise `eslint-plugin-react-hooks` v7 moved its flat preset to
> `configs.flat['recommended-latest']`; the bare `configs['recommended-latest']` is the old
> eslintrc shape and ESLint 10 rejects it.

And the lint rules now live in **`eslint-plugin-react-hooks`** (`recommended-latest` preset),
_not_ the older `eslint-plugin-react-compiler` that most blog posts still name. Turn the lint
rule on in CI before enabling the compiler, so Rules-of-React violations surface as lint
errors rather than as compiled-away bugs.

Total added: **~10 kB**.

### 10.2 One real decision: Temporal

`Temporal.PlainDateTime` is _precisely_ the type §3.5 describes — a wall-clock date-time with
no zone — and `.add({ weeks: 1 })` is DST-correct by construction rather than by remembering
to use `setDate`. It would delete most of `lib/dates.ts` and make the floating-time decision
enforced by the type system instead of by a comment.

Status: shipped in Chrome 144 (early 2026) and Firefox 139 (May 2025); **Safari is still
Technology Preview / behind a flag**. So it needs a polyfill, and the polyfills are not small:

| Polyfill                           | Gzipped |
| ---------------------------------- | ------- |
| `temporal-polyfill` (FullCalendar) | 19.7 kB |
| `temporal-polyfill-lite`           | 17.9 kB |
| `@js-temporal/polyfill`            | 45.4 kB |

**Recommendation:** use Temporal, with the polyfill behind a runtime gate so Chrome and
Firefox pay nothing:

```ts
if (!('Temporal' in globalThis)) await import('temporal-polyfill/global')
```

That import sits in the same async boot as the `DecompressionStream` seed, so it costs no
extra complexity. If 20 kB for Safari users feels wrong for a tool this small, the honest
alternative is ~30 lines of hand-rolled calendar arithmetic and zero dependencies — v1 already
proved that works. Either is defensible; the gated polyfill is better for maintainability.

Note: `date-fns`, Luxon and Day.js are _not_ alternatives here. All three are `Date`-based and
none offers a floating wall-clock type, so they solve a problem this app does not have while
reintroducing the one it does.

### 10.3 An architectural option worth a look: RRULE

RFC 5545 already has exact vocabulary for "a recurring series plus manual additions and
removals": `RRULE` + `RDATE` + `EXDATE`. Storing _that_ instead of an expanded slot list would
make the URL dramatically smaller (one rule, not 52 timestamps), give correct month-end
behaviour for free, and make the M6 `.ics` export nearly a no-op.

The catch: `rrule` (the classic library) is `Date`-based and heavy; `rrule-temporal` is
faster and Temporal-native but young (~100 stars) and works in `ZonedDateTime`, which fights
the floating-local decision.

**Recommendation: keep the expanded slot list for v1 of v2.** Delta-encoded and deflated it is
already small (§3.2), and an explicit list is far easier to reason about when someone hand-edits
one slot. Revisit if the recurrence builder grows real complexity (monthly-by-weekday,
exceptions, "every other Tuesday except holidays").

### 10.4 Declined

- **nuqs** — the obvious reach for "URL state in React", and the wrong tool: it is a _search
  params_ manager. As of v2.10 it will _preserve_ a hash but will not store state in one. It
  also assumes one parser per key, where this app has a single opaque blob. No fit.
- **Motion / Framer Motion** — 30 kB (15 kB with `LazyMotion`) for what AutoAnimate does in 3.
- **`ics` / `ical-generator`** — for M6. A handful of `VEVENT`s is ~30 lines of string building;
  the only real traps are 75-octet line folding and escaping commas and semicolons. Reach for a
  library only if export grows beyond a flat list.
- **`react-beautiful-dnd`** — deprecated; listed only because it still ranks first in search.

---

## 11. Build notes (M0–M4 complete)

Implemented as five milestone commits (`f18e7e9` … `84d0add`). Verified independently: lint
clean, 163 tests green, build clean on a second run over an existing `dist/`,
`dist/index.html` references `./assets/…` relatively, and the Temporal polyfill lands in its
own lazily-imported chunk rather than the main bundle.

Measured bundle, gzipped: **125.8 kB** on Chrome/Firefox (native Temporal, polyfill never
fetched), **145.7 kB** on Safari (+19.9 kB polyfill chunk). Budget was 150 kB.

> Base UI's Tabs cost **+11.2 kB gzipped**, not the ~2.4 kB its comparisons quote — the
> quoted figure is the Tabs parts alone, excluding Base UI's shared internals, which a
> first component pulls in wholesale. With the Help tab's prose on top, that leaves about
> **4 kB of Safari headroom**. The next dependency needs a size check before it goes in,
> and if the budget binds, the two obvious levers are hand-rolling the tab strip (~40
> lines with the right ARIA) or dropping the Temporal polyfill for hand-rolled calendar
> math.

Corrections to this plan found during the build:

- §10.1's React Compiler snippet was wrong — fixed in place above.
- §3.2's "200–300 characters" estimate for the 20×52 case was pessimistic: the real figure is
  **219 characters**, and a realistic 4-name × 12-slot rotation is **98**.
- §3.3 did not say what happens when v1's `rotationStart` is itself a Sunday. Resolved from
  v1's source: `getDay()` returns 0, so `d + (7 - 0)` advances a **full week**. The
  implementation matches v1; `src/state/legacy.test.ts` pins it.
- §3.3 was silent above 18 items, where v1's permutation index is already meaningless. The
  importer keeps the given order above `LEGACY_MAX_ITEMS`.
- **The wire format needs a canonical-form rule**, which this plan omitted. `decode(encode(s))`
  is an identity only for slots already sorted and de-duplicated, because the encoder
  normalizes. `normalizeSlots` now runs on every write path.
- **`temporal-polyfill/global` ships empty types.** The real global types are at
  `temporal-polyfill/types/global` → `temporal-spec/global`; see `src/globals.d.ts`.
- **`DecompressionStream` rejects the writer's promise separately from the reader's**, so a
  truncated blob leaks an unhandled `Z_BUF_ERROR` long after `decode()` has correctly returned
  `null`. `codec.ts` uses `pipeThrough` and catches it.
- Fake timers cannot test the write path — `CompressionStream` is zlib on Node's thread pool,
  i.e. real I/O. The hook tests use real timers deliberately.

One library added beyond §10: `@dnd-kit/modifiers` (~1 kB, same family) for
`restrictToVerticalAxis`.

**Still open:** the Playwright specs in `e2e/smoke.spec.ts` are written and typecheck, but no
browser has executed them — `playwright install chromium` is blocked by the egress allowlist in
the build environment. The app has not yet been rendered in a real browser at all.
