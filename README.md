# laravel-workers site

The site for [`laravel-workers`](https://github.com/arfoux/laravel-workers): a landing page, the
documentation, and the audit behind the claims.

Deployed to Cloudflare Workers (static assets). `npm run deploy` prints the URL; this repository
does not record it (the owner publishes it).

## The three surfaces

| surface | prefix | where its content comes from |
|---|---|---|
| landing | `/` | prose written here, every figure quoted from the repository |
| documentation | `/docs/` | the repository's own `README.md`, `MAP.md`, `COMPILED.md`, `docs/CI.md`, `docs/BRAND.md` at a named commit |
| audit | `/audit/` | `src/data/report.json`, extracted from the repository by `scripts/extract-lw.mjs` |

The landing and the docs are written once and read at the commit they cite; the audit is
generated, so every figure on it carries the file and commit it came from. The footer says which
is which.

## What is extracted, and what is written

`scripts/extract-lw.mjs` reads the audited repository, cross-checks its own figures against each
other (15 checks), and writes `src/data/report.json`. `scripts/verify-lw.mjs` re-extracts into a
temp file and fails on drift.

The prose — the landing, the documentation pages — is written by hand, and `scripts/check-site.mjs`
keeps it structurally honest after `astro build` (16 checks): every documentation page is in the
navigation and every navigation entry is built, every internal link resolves, no page ships a
literal backtick, a double-escaped ampersand or an unescaped template placeholder, every page has
exactly one `h1`, a title and a description, every image has alt text, and the audit pages all
carry the provenance footer.

## Layout

```text
scripts/
  extract-lw.mjs        reads the audited repo, cross-checks it, writes src/data/report.json
  verify-lw.mjs         re-extracts and diffs; fails on drift
  check-site.mjs        the site checks above; runs against dist/ after a build
src/
  data/report.json      every extracted figure (the audit surface)
  data/site.js          the package facts: version, repo, license, engines
  data/docs.js          the documentation tree; the sidebar and prev/next come from it
  lib/report.js         typed accessors over report.json
  layouts/Base.astro    the shell: head, theme boot, navigation, footer
  layouts/Docs.astro    the documentation shell: sidebar, prose column, page footer
  components/           Pipeline, Budget, Code, Term, DocsNav, Census, CensusGrid, Stat
  pages/index.astro     the landing page
  pages/docs/*          the documentation (13 pages)
  pages/audit/*         the audit (7 pages, generated from report.json)
  styles/site.css       the audit surface's stylesheet
  styles/product.css    the product surface's stylesheet (landing + docs)
  worker.js             Worker entry: static assets plus a real 404 page
public/                 logo.svg, favicon.svg, og.png, robots.txt
```

## Commands

```sh
npm run extract     # re-read the audited repo, rewrite src/data/report.json
npm run verify      # extract into a temp file and diff against the committed data
npm run build       # static build into dist/
npm run verify:site # the site checks, against dist/
npm run dev         # local dev server
npm run preview     # build, then wrangler dev (Worker + assets, real 404 path)
npm run deploy      # extract, verify, build, verify:site, then wrangler deploy
```

`LW_REPO` overrides the audited repo path (default `../laravel-workers`).

## Hosting and deploying

Cloudflare Workers with static assets: `wrangler.jsonc` points `main` at `src/worker.js` and binds
the build output as `ASSETS`. The worker serves the assets, and for anything the build did not emit
it returns `/404.html` with a real 404 status, so a bad deep link still lands on the styled page.

```sh
npm run build && npx wrangler deploy
```

## Freshness

The audit's footer prints the audited commit, version and extraction date, taken from
`report.json`; the documentation footer prints the commit the prose was read from. Re-run
`npm run extract && npm run build` after the audited repository moves — `npm run verify` is what
catches a stale figure.
