# Shuffler2

A frontend-only tool for building and sharing rotations — chores, on-call, dish duty,
standup facilitator. **All state lives in the URL fragment.** No backend, no database,
no accounts. Successor to [v1](https://zzt64.com/shuffler/).

See [`PLAN.md`](./PLAN.md) for the full design, decision log and rationale.

## Develop

```sh
npm install
npm run dev        # vite dev server
npm run test       # vitest, watch mode
npm run test -- --run
npm run lint
npm run build      # tsc --noEmit && vite build -> dist/
npm run preview
npm run e2e        # playwright smoke test (needs `npx playwright install chromium`)
```

## Deploying to GitHub Pages

The build is static files and `vite.config.ts` sets `base: './'`, so the same `dist/`
works at `user.github.io/shuffler2/`, at a domain root, or opened from a local folder.
Every shareable link is `index.html#…`, so there are no deep paths and no `404.html`
redirect hack is needed.

`.github/workflows/deploy.yml` builds and publishes on every push to `main`.

> ### One repo setting is required, and it is easy to miss
>
> **Settings → Pages → Source must be set to "GitHub Actions"** — _not_ "Deploy from a
> branch". The workflow will otherwise run green and deploy nothing.

If this is served from a custom domain, add a `CNAME` file to `public/` so the domain
survives each deploy.

## Notes for maintainers

- **Never use `toISOString()` for a user-facing date.** It converts to UTC and renders
  dates a day early west of Greenwich — the exact bug v1 shipped. ESLint blocks it; format
  from local fields via `src/lib/dates.ts`.
- **Never use `dangerouslySetInnerHTML` for name or title text.** State arrives from a link
  a stranger may have sent; v1 had stored XSS through exactly this. ESLint blocks it.
- **Recurrence uses calendar arithmetic** (`Temporal.PlainDateTime.prototype.add`), never
  millisecond addition, or it drifts an hour twice a year.
- `decode()` must never throw. It is `safeParse` over untrusted input with an empty-state
  fallback.
