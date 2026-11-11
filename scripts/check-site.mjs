#!/usr/bin/env node
// scripts/check-site.mjs — the check that runs after `astro build` and before a deploy.
//
// The audit's checks (scripts/extract-lw.mjs) keep the *figures* tied to the audited
// repository. This one keeps the *site* internally honest: every documentation page is
// reachable from the navigation, every internal link points at a file that exists, and
// no page ships the failure modes this rewrite was for — a literal backtick, a
// double-escaped ampersand, a missing <h1>, an image without alt text.
//
// It reads dist/ and src/ only. No network, no browser, no dependencies.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const src = (path) => readFileSync(join(ROOT, path), 'utf8');

if (!existsSync(DIST)) {
  console.error('dist/ is missing — run `npm run build` first.');
  process.exit(1);
}

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );

const pages = walk(DIST).filter((file) => file.endsWith('.html'));
const html = new Map(pages.map((file) => [relative(ROOT, file).replace(/\\/g, '/'), readFileSync(file, 'utf8')]));
const routeOf = (file) => {
  const rel = relative(DIST, file).replace(/\\/g, '/');
  return rel === 'index.html' ? '/' : rel === '404.html' ? '/404.html' : `/${rel.replace(/index\.html$/, '')}`;
};
const exists = (href) => {
  const clean = href.split('#')[0].split('?')[0];
  if (!clean || clean === '/') return existsSync(join(DIST, 'index.html'));
  const target = join(DIST, clean);
  return existsSync(target) || existsSync(`${target}.html`) || existsSync(join(target, 'index.html'));
};

const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

// ---------------------------------------------------------------- doc nav closure
// Both directions: a page in src/pages/docs must appear in the navigation data, and
// every navigation entry must have a page. Either half alone can drift silently.
const docsSource = src('src/data/docs.js');
const navSlugs = [...docsSource.matchAll(/slug: '([^']*)'/g)].map((match) => match[1]);
const navHrefs = new Set(navSlugs.map((slug) => (slug ? `/docs/${slug}/` : '/docs/')));
const builtDocFiles = walk(join(ROOT, 'src/pages/docs')).filter((file) => file.endsWith('.astro'));
const docRoutes = builtDocFiles.map((file) => {
  const name = file.replace(/\\/g, '/').split('/').pop().replace(/\.astro$/, '');
  return name === 'index' ? '/docs/' : `/docs/${name}/`;
});
const unlisted = docRoutes.filter((route) => !navHrefs.has(route));
const unbuilt = [...navHrefs].filter((href) => !exists(href));
add(
  'every documentation page is in the navigation, and every navigation entry is built',
  unlisted.length === 0 && unbuilt.length === 0,
  `${docRoutes.length} pages, ${navHrefs.size} entries${unlisted.length ? `, unlisted: ${unlisted.join(', ')}` : ''}${unbuilt.length ? `, unbuilt: ${unbuilt.join(', ')}` : ''}`,
);

// ------------------------------------------------------------------- body inbound
// The sidebar links every page from every page, so "reachable" is never the
// question; a page nothing in the prose links to is an orphan all the same. The
// chrome is rendered by the layouts, so a page's own .astro file holds the prose
// links and nothing else: scanning the source is what keeps this honest (stripping
// the rendered HTML does not, because the sidebar is not inside one element).
const pageFiles = walk(join(ROOT, 'src/pages')).filter((file) => file.endsWith('.astro'));
const pageRouteOf = (file) => {
  const rel = relative(join(ROOT, 'src/pages'), file).replace(/\\/g, '/').replace(/\.astro$/, '');
  if (rel === 'index') return '/';
  return rel.endsWith('/index') ? `/${rel.slice(0, -'index'.length)}` : `/${rel}/`;
};
const pageHrefs = new Map(
  pageFiles.map((file) => [
    pageRouteOf(file),
    [...readFileSync(file, 'utf8').matchAll(/href=["']([^"']+)["']/g)].map((m) => m[1]),
  ]),
);
const inbound = (route) => [...pageHrefs].filter(([from, hrefs]) => from !== route && hrefs.includes(route)).map(([from]) => from);
const orphans =
  unlisted.length || unbuilt.length
    ? []
    : docRoutes.filter((route) => route !== '/docs/' && inbound(route).length === 0);
add(
  'every documentation page is linked from the prose of another page',
  orphans.length === 0,
  orphans.length ? `unlinked: ${orphans.join(', ')}` : `${docRoutes.length} pages, all with a body link`,
);

// ------------------------------------------------------------------ internal links
const brokenLinks = [];
let linkCount = 0;
for (const [file, text] of html) {
  for (const match of text.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const href = match[1];
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    linkCount += 1;
    if (!exists(href)) brokenLinks.push(`${routeOf(join(ROOT, file))} → ${href}`);
  }
}
add('every internal link resolves to a built file', brokenLinks.length === 0, `${linkCount} links checked${brokenLinks.length ? `, broken: ${brokenLinks.slice(0, 8).join('; ')}` : ''}`);

// -------------------------------------------------------------- rendered-text hygiene
// Tags are stripped first: these patterns are about what a reader sees, and BEM class
// names (`footer__provenance`) would otherwise read as markdown emphasis.
const textOf = (markup) =>
  markup
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ');

const MOJIBAKE = [
  ['a literal backtick in rendered text', /`/],
  ['a double-escaped ampersand', /&amp;amp;/],
  ['an unescaped template placeholder', /\{\{ ?[a-z]+ ?\}\}/i],
  ['a stray markdown emphasis', /__[^\s_][^_]{0,80}?__/],
];
for (const [label, pattern] of MOJIBAKE) {
  const hits = [...html].filter(([, text]) => pattern.test(textOf(text))).map(([file]) => routeOf(join(ROOT, file)));
  add(`no page ships ${label}`, hits.length === 0, hits.length ? hits.join(', ') : `${html.size} pages`);
}

// ------------------------------------------------------------------ head and structure
const h1Counts = [...html].map(([file, text]) => [routeOf(join(ROOT, file)), (text.match(/<h1[\s>]/g) ?? []).length]);
const h1Wrong = h1Counts.filter(([, count]) => count !== 1);
add('every page has exactly one h1', h1Wrong.length === 0, h1Wrong.length ? h1Wrong.map(([route, count]) => `${route}: ${count}`).join(', ') : `${h1Counts.length} pages`);

const noTitle = [...html].filter(([file, text]) => !/<title>[^<]{10,}<\/title>/.test(text)).map(([file]) => routeOf(join(ROOT, file)));
add('every page has a real title', noTitle.length === 0, noTitle.length ? noTitle.join(', ') : `${html.size} pages`);

const noDescription = [...html].filter(([file, text]) => !/<meta name="description" content="[^"]{20,}"/.test(text)).map(([file]) => routeOf(join(ROOT, file)));
add('every page has a description', noDescription.length === 0, noDescription.length ? noDescription.join(', ') : `${html.size} pages`);

const imgNoAlt = [];
for (const [file, text] of html) {
  for (const match of text.matchAll(/<img\b[^>]*>/g)) if (!/\balt=/.test(match[0])) imgNoAlt.push(routeOf(join(ROOT, file)));
}
add('every image carries alt (empty for decorative)', imgNoAlt.length === 0, imgNoAlt.length ? imgNoAlt.join(', ') : 'ok');

// ------------------------------------------------------------------- the two halves
const miniFigs = [...html.values()].reduce((sum, text) => sum + (text.match(/class="mini-fig__svg"/g) ?? []).length, 0);
const glyphs = [...html.values()].reduce((sum, text) => sum + (text.match(/class="glyph/g) ?? []).length, 0);
add('the small figures are present across the site', miniFigs >= 20, `${miniFigs} mini figures`);
add('the icon set is in use', glyphs >= 8, `${glyphs} glyphs`);

const landing = html.get('dist/index.html') ?? '';
add('the landing ships the pipeline figure', landing.includes('pipeline__svg') && landing.includes('pipeline__mobile'), 'static frame plus the stacked phone version');
add('the landing ships the budget figure', landing.includes('budgetfig'), 'measured CPU against the free-plan budget');
const auditPages = [...html.keys()].filter((file) => file.startsWith('dist/audit/'));
const missingProvenance = auditPages.filter((file) => !html.get(file).includes('footer__provenance'));
add('every audit page carries the provenance footer', missingProvenance.length === 0, missingProvenance.length ? missingProvenance.join(', ') : `${auditPages.length} pages`);
add('the audit pages are under /audit/', auditPages.length >= 7, `${auditPages.length} pages`);

// ---------------------------------------------------------------------- static assets
const assets = ['robots.txt', 'favicon.svg', 'logo.svg', 'og.png'];
const missingAssets = assets.filter((name) => !existsSync(join(DIST, name)));
add('the static assets are in place', missingAssets.length === 0, missingAssets.length ? missingAssets.join(', ') : assets.join(', '));

// also: an og.png that is a real image, not the empty file a failed copy leaves
const og = join(DIST, 'og.png');
if (existsSync(og)) add('og.png is a real image', statSync(og).size > 20_000, `${statSync(og).size} bytes`);

// ------------------------------------------------------------------------------- report
let failed = 0;
for (const check of checks) {
  if (!check.ok) failed += 1;
  console.log(`  ${check.ok ? 'PASS' : 'FAIL'}  ${check.name} (${check.detail})`);
}
console.log(`\n${checks.length - failed} of ${checks.length} checks passed. ${pages.length} pages.`);
process.exit(failed === 0 ? 0 : 1);
