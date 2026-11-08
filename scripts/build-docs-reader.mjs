#!/usr/bin/env node
// build-docs-reader.mjs
//
// Post-build step: reads the built HTML of each docs page from dist,
// extracts the .prose content from each, and generates a combined
// single-page docs reader at dist/docs/index.html.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

const ORDER = [
  { slug: '',              title: 'Getting started',  group: 'Start' },
  { slug: 'cli',           title: 'CLI reference',    group: 'Start' },
  { slug: 'deploy',        title: 'Deploy',           group: 'Guide' },
  { slug: 'routes',        title: 'Routes & ports',   group: 'Guide' },
  { slug: 'blade',         title: 'Blade & parity',   group: 'Guide' },
  { slug: 'data',          title: 'Data & D1',        group: 'Guide' },
  { slug: 'auth',          title: 'Auth & sessions',  group: 'Guide' },
  { slug: 'frontend',      title: 'Frontend & assets', group: 'Guide' },
  { slug: 'compatibility', title: 'Compatibility',    group: 'Reference' },
  { slug: 'ci',            title: 'CI & verdict',     group: 'Reference' },
  { slug: 'limits',        title: 'Limits',           group: 'Reference' },
  { slug: 'architecture',  title: 'Architecture',     group: 'Reference' },
  { slug: 'faq',           title: 'FAQ',              group: 'Reference' },
];

function extractProse(html) {
  const match = html.match(/<div class="prose">([\s\S]*?)<\/div>\s*<\/article>/);
  if (match) return match[1];
  const fallback = html.match(/<div class="prose">([\s\S]*?)(?:<p class="docs__source|<\/article>)/);
  if (fallback) return fallback[1];
  return '';
}

function extractH2s(html) {
  const headings = [];
  const re = /<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    headings.push({ id: m[1], text: m[2].replace(/<[^>]+>/g, '').trim() });
  }
  return headings;
}

function extractLead(html) {
  const m = html.match(/<p class="docs__lead">([\s\S]*?)<\/p>/);
  return m ? m[1] : '';
}

async function buildReader() {
  const sections = [];
  const outline = [];

  for (const entry of ORDER) {
    const htmlPath = entry.slug
      ? join(DIST, 'docs', entry.slug, 'index.html')
      : join(DIST, 'docs', 'index.html');

    let html;
    try {
      html = await readFile(htmlPath, 'utf-8');
    } catch {
      console.warn('  skip:', htmlPath);
      continue;
    }

    const prose = extractProse(html);
    const lead = extractLead(html);
    const sectionId = entry.slug || 'getting-started';

    // Namespace all h2 IDs to slug--h2Id so combined page has no duplicate IDs
    const h2s = extractH2s(html);
    const namespacedProse = prose.replace(/<h2 id="([^"]+)">/g, (match, id) => `<h2 id="${sectionId}--${id}">`);

    sections.push(
      '<section class="reader__section" id="' + sectionId + '" data-page="' + sectionId + '">' +
      '<div class="reader__header">' +
      '<p class="reader__group mono">' + entry.group + '</p>' +
      '<h1 class="reader__title">' + entry.title + '</h1>' +
      (lead ? '<p class="reader__lead">' + lead + '</p>' : '') +
      '</div>' +
      '<div class="reader__content">' + namespacedProse + '</div>' +
      '</section>'
    );

    outline.push({
      id: sectionId,
      title: entry.title,
      group: entry.group,
      sections: h2s.map(h => ({ id: sectionId + '--' + h.id, text: h.text })),
    });
  }

  // Group pages under a single group label (Start / Guide / Reference)
  const groups = {};
  for (const page of outline) {
    (groups[page.group] ??= []).push(page);
  }
  const sidebarHtml = Object.entries(groups).map(([group, pages]) =>
    '<div class="reader__nav-group">' +
    '<p class="reader__nav-group-label mono">' + group + '</p>' +
    pages.map(page =>
      '<a class="reader__nav-page" href="#' + page.id + '" data-toc-id="' + page.id + '">' + page.title + '</a>' +
      '<ul class="reader__nav-sections">' +
      page.sections.map(s =>
        '<li><a href="#' + s.id + '" data-toc-id="' + s.id + '" data-parent="' + page.id + '">' + s.text + '</a></li>'
      ).join('') +
      '</ul>'
    ).join('') +
    '</div>'
  ).join('');

  const CSS = `
    .reader { display:grid; grid-template-columns:17rem minmax(0,1fr); gap:clamp(2rem,1rem+3vw,5rem); max-width:1400px; margin:0 auto; padding:clamp(1.5rem,1rem+2vw,3rem) clamp(1rem,0.6rem+2vw,3rem) 6rem; }
    @media (max-width:60rem) { .reader{grid-template-columns:1fr} .reader__sidebar{display:none} }
    .reader__sidebar { position:sticky; top:4.5rem; max-height:calc(100vh-6rem); overflow-y:auto; padding-inline-end:0.5rem; font-size:var(--step--1); }
    .reader__nav-group { margin-bottom:1.2rem; }
    .reader__nav-group-label { font-size:0.72rem; color:var(--fg-muted); margin:0 0 0.3rem; text-transform:uppercase; letter-spacing:0.06em; }
    .reader__nav-page { display:block; padding:0.3rem 0.5rem; font-weight:620; color:var(--fg-muted); text-decoration:none; border-inline-start:2px solid transparent; transition:color 0.15s,border-color 0.15s; }
    .reader__nav-page:hover { color:var(--fg); }
    .reader__nav-page[data-active="true"] { color:var(--fg); border-inline-start-color:var(--workers); }
    .reader__nav-sections { list-style:none; margin:0; padding:0; }
    .reader__nav-sections a { display:block; padding:0.18rem 0.5rem 0.18rem 1.2rem; color:var(--fg-muted); text-decoration:none; font-size:0.82rem; line-height:1.4; border-inline-start:2px solid transparent; transition:color 0.15s,border-color 0.15s; }
    .reader__nav-sections a:hover { color:var(--fg); }
    .reader__nav-sections a[data-active="true"] { color:var(--fg); font-weight:600; border-inline-start-color:var(--workers); position:relative; }
    .reader__nav-sections a[data-active="true"]::before { content:''; position:absolute; left:-5px; top:50%; transform:translateY(-50%); width:7px; height:7px; border-radius:50%; background:var(--workers); }
    .reader__section { padding-bottom:4rem; margin-bottom:4rem; border-bottom:var(--hair) solid var(--line); scroll-margin-top:5rem; }
    .reader__section:last-child { border-bottom:none; margin-bottom:0; }
    .reader__group { font-size:0.72rem; color:var(--workers); text-transform:uppercase; letter-spacing:0.06em; margin:0 0 0.4rem; }
    .reader__title { font-size:clamp(1.9rem,1.5rem+2vw,3rem); line-height:1.05; letter-spacing:-0.02em; margin:0; max-width:24ch; text-wrap:balance; color:var(--fg); }
    .reader__lead { font-size:var(--step-1); color:var(--fg-muted); margin:0.9rem 0 0; max-width:44rem; line-height:1.6; }
    .reader__content { max-width:46rem; margin-top:2rem; font-size:var(--step-0); line-height:1.7; }
    .reader__content > * + * { margin-top:1rem; }
    .reader__content h2 { font-size:var(--step-2); line-height:1.15; letter-spacing:-0.01em; margin-top:2.4rem; padding-top:1.2rem; border-top:var(--hair) solid var(--line); scroll-margin-top:5rem; }
    .reader__content h3 { font-size:var(--step-1); margin-top:1.8rem; }
    .reader__content p { margin:0; }
    .reader__content ul, .reader__content ol { margin:0; padding-inline-start:1.2rem; display:grid; gap:0.35rem; }
    .reader__content code { font-family:var(--mono); font-size:0.9em; background:var(--ground-2); border:var(--hair) solid var(--line); padding:0.05rem 0.3rem; border-radius:3px; overflow-wrap:anywhere; }
    .reader__content pre { margin:1rem 0; padding:1rem; background:var(--ground-2); border:var(--hair) solid var(--line); border-radius:var(--radius); overflow-x:auto; font-family:var(--mono); font-size:var(--step--1); line-height:1.6; }
    .reader__content pre code { background:none; border:none; padding:0; }
    .reader__content table { width:100%; min-width:30rem; font-size:var(--step--1); border-collapse:collapse; }
    .reader__content th, .reader__content td { padding:0.5rem 0.75rem; border-bottom:var(--hair) solid var(--line); text-align:left; }
    .reader__content th { font-weight:620; color:var(--fg-muted); font-size:0.82rem; }
    .reader__content img { max-width:100%; height:auto; }
    .reader__content a { color:var(--workers); text-decoration:none; }
    .reader__content a:hover { text-decoration:underline; }
    .reader__content .table-wrap { margin-block:1.2rem; overflow-x:auto; }
    .reader-topbar { position:sticky; top:0; z-index:10; background:var(--ground); border-bottom:var(--hair) solid var(--line); padding:0.6rem clamp(1rem,0.6rem+2vw,3rem); display:flex; align-items:center; gap:1rem; }
    .reader-topbar a { font-family:var(--mono); font-size:var(--step--1); color:var(--fg-muted); text-decoration:none; }
    .reader-topbar a:hover { color:var(--fg); }
    .reader-topbar-brand { font-weight:700; color:var(--fg) !important; }
    .reader-topbar-spacer { flex:1; }
    @media (max-width:60rem) { .reader__section{padding-bottom:2rem;margin-bottom:2rem} }
  `;

  // Read the correct CSS href from a built docs page (Astro hashes the filename)
  const deployHtml = await readFile(join(DIST, 'docs', 'deploy', 'index.html'), 'utf-8');
  const cssMatch = deployHtml.match(/href="(\/_astro\/[^"]+\.css)"/);
  const cssHref = cssMatch ? cssMatch[1] : '/_astro/Base.BEzuZXD-.css';

  const html = '<!DOCTYPE html>\n<html lang="en" data-theme="dark">\n<head>\n' +
    '<meta charset="utf-8" />\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1" />\n' +
    '<title>Documentation - laravel-workers</title>\n' +
    '<meta name="description" content="The complete laravel-workers documentation on one page." />\n' +
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml" />\n' +
    '<link rel="stylesheet" href="' + cssHref + '" />\n' +
    '<style>' + CSS + '</style>\n</head>\n<body>\n' +
    '<nav class="reader-topbar">' +
    '<a href="/docs/" class="reader-topbar-brand">&#8592; laravel-workers docs</a>' +
    '<span class="reader-topbar-spacer"></span>' +
    '<a href="#getting-started">deep link</a>' +
    '</nav>\n' +
    '<div class="reader">\n' +
    '<aside class="reader__sidebar" aria-label="Outline">\n' + sidebarHtml + '\n</aside>\n' +
    '<main class="reader__main" id="reader-main">\n' + sections.join('\n') + '\n</main>\n' +
    '</div>\n' +
    '<script>\n' +
    '(function(){' +
    'var allLinks=[].slice.call(document.querySelectorAll("[data-toc-id]"));' +
    'if(!allLinks.length)return;' +
    'function setActive(id){allLinks.forEach(function(a){a.dataset.active=(a.dataset.tocId===id)?"true":""})}' +
    'var targets=[].slice.call(document.querySelectorAll(".reader__section,.reader__content h2[id]"));' +
    'if(!targets.length)return;' +
    'var io=new IntersectionObserver(function(entries){' +
    'entries.forEach(function(e){if(!e.isIntersecting)return;var id=e.target.id;' +
    'if(e.target.classList.contains("reader__section")){setActive(id)}' +
    'else{var s=e.target.closest(".reader__section");if(s)setActive(s.id+"--"+id)}' +
    '})},{rootMargin:"-80px 0px -60% 0px",threshold:0});' +
    'targets.forEach(function(t){io.observe(t)});' +
    'setActive(targets[0].id);' +
    '})();' +
    // Theme toggle: default to dark; persist choice in localStorage
    '(function(){' +
    'var saved=localStorage.getItem("lw-theme");' +
    'if(saved){document.documentElement.dataset.theme=saved}' +
    '})();'
    '</script>\n' +
  '<script>\n' +
  '// Copy buttons for code blocks\n' +
  'document.querySelectorAll("[data-copy]").forEach(function(btn){' +
  'btn.addEventListener("click",function(){' +
  'var text=btn.dataset.copy||btn.previousElementSibling?.textContent;' +
  'if(text)navigator.clipboard.writeText(text);' +
  'btn.textContent="copied";' +
  'setTimeout(function(){btn.textContent="copy"},1500);' +
  '})});' +
  '</script>\n</body>\n</html>';

  const readerDir = join(DIST, 'docs', 'read');
  const outPath = join(readerDir, 'index.html');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, html, 'utf-8');
  console.log('  wrote', outPath, '(' + sections.length, 'sections,', outline.reduce((a, p) => a + p.sections.length, 0), 'subsections)');
}

buildReader().catch(err => { console.error(err); process.exit(1); });
