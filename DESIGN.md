# DESIGN.md

Direction for the site at `laravel-workers-report`. Written by the agent on the owner's
instruction, not invented as an example. The site has two surfaces — the product (landing
and documentation) and the audit — and the design differs between them on purpose.

Reading this as: a product site for a build-time compiler that a Laravel developer lands on
from npm, plus a generated audit behind its claims.

## Identity

The site borrows the product's own identity instead of inventing a second one.
`laravel-workers/docs/BRAND.md` is the single source for the mark and the palette; this site
links to it and does not fork it.

- **Mark**: `docs/logo.svg` from the product repo, the Laravel "L" whose foot ends in an edge
  arrow. Copied byte for byte into `public/`. Reason: the site is about that project, and a
  second mark would compete with it.
- **The colour story**: the mark's gradient — Laravel red `#FF2D20` to Workers orange
  `#F38020` — is the one place brand colour is spent. On the landing it also carries the word
  *compiled* in the headline, because the compile step is literally the red-to-orange handoff.
  Everywhere else colour is status or nothing.
- **Motif**: the census cell. One small square, repeated, is the unit of measurement on the
  audit surface (the coverage grid, the legend, the inline status keys). On the product
  surface the motif is the **pipeline**: source on the left, a build in the middle, one
  artifact on the right.
- **Personality**: product surface — direct, technical, unhurried; it shows the mechanism
  rather than a promise. Audit surface — an instrument readout: verdict, then the number,
  then the file the number came from. Neither congratulates the reader.

## Two surfaces, two voices

| | product (`/`, `/docs/…`) | audit (`/audit/…`) |
|---|---|---|
| job | explain the toolchain and get a developer to `build --strict` | keep every published figure tied to its commit |
| unit | a section with a claim and a code sample | a table of rows and a count |
| colour | brand gradient once; status colours for verdicts | status colours only, as data |
| density | generous, with one figure per idea | dense, table-first, print-friendly |
| source line | "read from the repository at `<sha>`" | "extracted from `<sha>` by `scripts/extract-lw.mjs`" |

## Palette

Status colours come from the product's brand file and keep their meaning there: `shore`
`#1FA37C` is a clean run, `signal` `#E0A126` a declared gap that ships, `block` `#D14343` a
refusal. Both surfaces read them the same way, and an inline swatch never appears without a
word beside it.

## Typography

- **One sans stack, one mono stack, no webfont.** The brand file requires it (nothing to
  download, no FOUT), and the site is read by developers who already have a good system UI.
- **Mono is for data and machine text**: numbers, identifiers, paths, tables cells that hold
  values, code, terminal output. Never for prose, never for headings.
- **Scale**: fluid `clamp()` steps, five of them, plus one hero step on the landing. A
  documentation page's `h1` and the landing's `h1` are deliberately not the same size.
- **Source text keeps its own case**: the lowercase treatment on table headings applies to
  column labels only — `th[scope='row']` is exempt. Reason: a row header carries the source's
  own text (`README.md`, `Gate::allows()`, a ledger status like `OPEN`), and a CSS transform
  that lowercased it would print something the audited repository does not say.

## Motion

`Dial: ENERGY 3 / RHYTHM 3 / MOTION 2` for the landing, `ENERGY 2 / RHYTHM 3 / MOTION 1` for
the audit.

- The landing's hero figure runs a short loop — about three seconds — showing the pipeline:
  source units enter the build, the scan sweeps the phases, packets cross to the Worker, the
  edge ring pulses. It is compositor-only (`opacity`, `transform`), never a layout property.
- **The static frame is the whole figure.** Every element is visible with animations off, so a
  screenshot, a print, a reduced-motion visitor and a slow device all read the same picture;
  the loop only shows traffic moving through it. `prefers-reduced-motion: reduce` switches
  every animation off explicitly, and the phone layout replaces the diagram with a stacked
  three-stage list instead of a horizontal scroll.
- No parallax, no scroll reveal, no entrance animation on text, no animated counters. If an
  animation does not explain the product, it does not ship.

## Composition rules

1. **A claim carries its number, and the number carries its source.** On the audit that is a
   build check; on the product surface every figure quoted is one the audit already verifies,
   and the page says which. Reason: the audited project's own rule is that a hand-typed count
   is a bug.
2. **Show the mechanism before the promise.** The landing leads with the pipeline and the CPU
   budget, not with adjectives. Reason: the reader's question is "how can this possibly work",
   and the honest answer is a diagram plus measured numbers.
3. **State the refusals as prominently as the support.** The landing has a section for what
   fails loud and a section for what the verdict does not claim. Reason: a toolchain that
   fails the build is only trustworthy if it says where it stops.
4. **Tables are the primary medium for lists of facts**, not cards. Cards are used where each
   item is a *concept* (the four serving tiers, the six documentation areas); tables where the
   items are comparable rows.
5. **Interactive elements earn their place.** The landing has two: copy-the-install-command and
   the theme toggle. The audit has the census filter and grid. Everything else is a link.
6. **One figure per idea.** The landing has exactly two visuals — the pipeline and the budget —
   and no section repeats another's layout.

## Open questions for the owner

- The landing's headline reads *"Your Laravel app, compiled to a Worker."* If you prefer the
  project's own phrasing (*"compile the boot away"*), it is one line in `src/pages/index.astro`.
- The audit's third bucket (`documented`, 7 of 118) is described by the audited repo as
  "build-level decisions the compiler cannot judge". If you have a word you prefer in your own
  docs, say so and this file changes with it.
