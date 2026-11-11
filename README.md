# Shuffler2

A frontend-only tool for building and sharing rotations — chores, on-call, dish duty,
standup facilitator. **All state lives in the URL fragment.** No backend, no database,
no accounts. Successor to [v1](https://zzt64.com/shuffler/).

This README is the quick orientation. [`PLAN.md`](./PLAN.md) holds the full design,
the decision log and the reasoning behind each choice; section numbers like "§3.5" in code
comments refer to it.

## How it works, in one paragraph

The app state is a small object (`title`, `names`, `slots`, `groupSize` — see
`src/state/schema.ts`). Every edit is encoded into a compressed blob and written to the
address bar as `#s=…`, so the link _is_ the saved document and the browser's back button is
undo. The schedule itself is never stored: `derive()` in `src/lib/schedule.ts` assigns
names to dates round-robin, in list order, on every render.

## Develop

Node version is pinned in `.tool-versions` (CI builds with Node 22, which also works).

```sh
npm install
npm run dev            # vite dev server; opens the browser and reloads on save
npm run test           # vitest, watch mode  (add `-- --run` for a single pass)
npm run lint           # eslint, type-aware
npm run typecheck      # tsc --noEmit
npm run format         # prettier --write .
npm run build          # tsc --noEmit && vite build -> dist/
npm run preview        # serve dist/
npm run e2e            # playwright smoke test — run `npx playwright install chromium` first
```

**CI runs lint and build only, not the tests** — run `npm run test -- --run` yourself
before pushing to `main`, because every push to `main` deploys.

The first test run is slow (roughly a minute): jsdom is expensive to start, so the suite
runs in one process with the environment shared across files. See the `test` block in
`vite.config.ts`.

## Project layout

```
src/
  main.tsx                  boot: loads the Temporal polyfill only if needed, mounts <App>
  App.tsx                   layout; wires state to the components
  styles.css                local styles on top of Pico CSS
  globals.d.ts              Temporal global types

  state/                    everything about the URL and its contents
    schema.ts               RotationState type, Valibot schema, size caps, normalizeSlots()
    codec.ts                state <-> `#s=` blob (tuple, delta-encoded slots, deflate, base64url)
    legacy.ts               imports v1 `?items=…&randomizer=…` links
    useRotationState.ts     the only code that touches `location`/history

  lib/                      pure functions, no React
    dates.ts                calendar arithmetic, recurrence expansion, formatting
    schedule.ts             derive(state) -> assignments + tallies; text-table export
    shuffle.ts              unbiased Fisher-Yates over crypto.getRandomValues
    names.ts                multi-line paste splitting, insert, move
    slack.ts                builds Slack `/remind` commands
    gcal.ts                 builds "add to Google Calendar" links for the +gcal column

  components/               one file per panel
    Toolbar.tsx             title, Shuffle, Reset
    ScheduleTable.tsx       the result: dates, who, +gcal link, per-person tally
    NameList.tsx            Names tab: edit, paste, drag-reorder, people per slot
    RecurrenceBuilder.tsx   Dates tab: "every N weeks on Monday [at 09:00]…" + single dates
    SlotList.tsx            Dates tab: edit/delete individual dates
    ShareBar.tsx            Share tab: link, copy, length warning, copy as text
    SlackPanel.tsx          Slack tab: `/remind` commands to paste
    Help.tsx                Help tab: user-facing explanation
    useCopyFeedback.ts      clipboard copy + "Copied" flash, shared by Share and Slack
    NumberField.tsx         whole-number input that stays typeable (clamps on blur)

  test/                     vitest setup (Temporal polyfill, jest-dom matchers)
e2e/smoke.spec.ts           playwright end-to-end smoke test
```

Tests sit next to the code they cover (`*.test.ts[x]`). `src/state/fixtures.test.ts`
holds real encoded links from shipped versions; **never change an existing fixture** — if
one stops decoding, old shared links have broken.

## Rules that are easy to break

- **Never use `toISOString()` for a user-facing date.** It converts to UTC and renders
  dates a day early west of Greenwich — the exact bug v1 shipped. ESLint blocks it; format
  from local fields via `src/lib/dates.ts`.
- **Never use `dangerouslySetInnerHTML` for name or title text.** State arrives from a link
  a stranger may have sent; v1 had stored XSS through exactly this. ESLint blocks it.
- **Recurrence uses calendar arithmetic** (`Temporal.PlainDateTime.prototype.add`), never
  millisecond addition, or it drifts an hour twice a year.
- **Times are floating wall-clock** (`"YYYY-MM-DDTHH:mm"`, no timezone). 9:00 means 9:00
  to everyone who opens the link. Don't introduce `Date` into slot handling. A slot may
  also be a bare `"YYYY-MM-DD"` (no time chosen); check `slotHasTime` before showing a time.
- **`decode()` must never throw.** It is `safeParse` over untrusted input; a bad link
  yields `null` and the app shows a "that link looked corrupted" notice.
- **The wire format is append-only.** Never renumber or reorder tuple fields in
  `codec.ts`; add new fields at the end so old links keep decoding (PLAN §3.2).
- **Every write of `slots` goes through `normalizeSlots()`** (sorted, de-duplicated,
  capped), or `decode(encode(s))` stops being an identity.
- **Bundle budget is ~150 kB gzipped and nearly spent** (PLAN §9.5, §12). Check the size
  before adding a dependency.

## Deploying to GitHub Pages

The build is static files and `vite.config.ts` sets `base: './'`, so the same `dist/`
works at `user.github.io/shuffler2/`, at a domain root, or opened from a local folder.
Every shareable link is `index.html#…`, so there are no deep paths and no `404.html`
redirect hack is needed.

`.github/workflows/deploy.yml` lints, builds and publishes on every push to `main`.

> ### One repo setting is required, and it is easy to miss
>
> **Settings → Pages → Source must be set to "GitHub Actions"** — _not_ "Deploy from a
> branch". The workflow will otherwise run green and deploy nothing.

`.env` sets `VITE_SITE_URL`, the absolute URL used by the link-preview (`og:`) tags in
`index.html`. Override it with `.env.local` or an environment variable for a fork or a
preview deploy; it must end in a slash.

If this is served from a custom domain, add a `CNAME` file to `public/` so the domain
survives each deploy.

## Known loose ends

- A 22 MB GIF (`public/hardstyle.gif`) is still in git history; removing it needs a
  history rewrite (PLAN §11.1).
- The Playwright smoke test is not run in CI.
