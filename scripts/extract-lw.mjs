// Reads the audited repository and writes src/data/report.json.
//
// Every number this site shows is produced here, from files that the audited
// project itself generates, so no count on the site is typed by hand. Quoted
// strings keep the source punctuation byte for byte and are marked verbatim.
//
// Usage: node scripts/extract-lw.mjs [--repo <path>] [--out <file>]
//   default repo: LW_REPO, else ../laravel-workers

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};

const REPO = resolve(argOf('--repo', process.env.LW_REPO || '../laravel-workers'));
const OUT = resolve(argOf('--out', 'src/data/report.json'));

const read = (rel) => readFileSync(resolve(REPO, rel), 'utf8');
// Two of the files this report reads (`notes/PLAYBOOK.local.md` and
// `.opencode/context.md`) are working-tree notes that git does not track, so the
// published inventory must not imply that every file is in the repository.
const isTracked = (rel) => {
  try {
    execFileSync('git', ['-C', REPO, 'ls-files', '--error-unmatch', rel], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
const provenance = (rel) => {
  const abs = resolve(REPO, rel);
  return {
    path: rel,
    sha256: createHash('sha256').update(readFileSync(abs)).digest('hex').slice(0, 16),
    bytes: statSync(abs).size,
    tracked: isTracked(rel),
  };
};

// A markdown table block: rows of cells, header line excluded.
function tableAfter(lines, headerPattern, { maxRows = Infinity } = {}) {
  const start = lines.findIndex((l) => headerPattern.test(l));
  if (start === -1) return [];
  const rows = [];
  for (let i = start + 1; i < lines.length && rows.length < maxRows; i++) {
    const line = lines[i];
    if (!line.startsWith('|')) {
      // Prose ends the block; a blank line does not. `notes/PLAYBOOK.local.md`
      // breaks its ledger table with one blank line, and stopping there would
      // silently drop every row below it (S16-S19 were published as absent).
      if (!line.trim()) continue;
      if (rows.length) break;
      continue;
    }
    const cells = line.slice(1, line.endsWith('|') ? -1 : undefined).split('|').map((c) => c.trim());
    if (cells.every((c) => /^:?-{2,}:?$/.test(c) || c === '')) continue;
    rows.push(cells);
  }
  return rows;
}

// Every row of every `| Laravel | Edge equivalent | ... |` block, tagged with the
// `### X. Name` heading above it (the feature map in MAP.md §5).
function featureMapRows(lines, stopPattern) {
  const rows = [];
  const header = /^\|\s*Laravel\s*\|\s*Edge equivalent\s*\|/;
  for (let i = 0; i < lines.length; i++) {
    if (stopPattern && stopPattern.test(lines[i])) break;
    if (!header.test(lines[i])) continue;
    let area = null;
    for (let j = i - 1; j >= 0; j--) {
      if (/^### /.test(lines[j])) { area = lines[j].slice(4).trim(); break; }
      if (/^## /.test(lines[j])) break;
    }
    for (let k = i + 2; k < lines.length && lines[k].startsWith('|'); k++) {
      const cells = lines[k].slice(1, lines[k].endsWith('|') ? -1 : undefined).split('|').map((c) => c.trim());
      if (cells.length !== 5) continue;
      const emoji = firstEmoji(cells[2]);
      if (!CLASS[emoji]) continue;
      rows.push({
        area: plain(area),
        laravel: plain(cells[0]),
        edge: plain(cells[1]),
        klass: CLASS[emoji],
        notes: plain(cells[3]),
        plan: plain(cells[4]),
      });
    }
  }
  return rows;
}

const stripBackticks = (s) => s.replace(/`/g, '');
// Markdown emphasis is noise in an HTML table cell: the audited files use it to
// highlight identifiers, and the report keeps the identifiers, not the markers.
const plain = (s) =>
  s == null
    ? s
    : String(s)
        .replace(/`/g, '')
        .replace(/\*\*/g, '')
        .replace(/\*([^*]+)\*/g, '$1')
        // The report's own copy keeps to no em dash (anti-slop R-02). Quoted rows
        // from the audited repo are reproduced with their punctuation normalised,
        // which the method page states.
        .replace(/^\s*—\s*/gm, '')
        .replace(/^\s*–\s*/gm, '')
        .replace(/\s*—\s*/g, ', ')
        .replace(/\s*–\s*/g, ' to ')
        .trim();
const firstEmoji = (s) => (s.match(/[\u2705\u{1F7E1}\u{1F534}\u26D4]/u) || [''])[0];

const CLASS = { '\u2705': 'fits', '\u{1F7E1}': 'soft', '\u{1F534}': 'hard', '\u26D4': 'not-applicable' };
const VERDICT = { ok: 'compiles', fail: 'fails-loud', null: 'documented' };

// ---------------------------------------------------------------- constructs

const constructsFile = JSON.parse(read('tools/constructs.json'));
const compiledText = read('COMPILED.md');
const auditTable = tableAfter(
  compiledText.split('\n'),
  /^\|\s*Construct\s*\|\s*The build\s*\|/,
);
const auditByLabel = new Map(
  auditTable.map((cells) => [plain(cells[0]), { build: plain(cells[1]), note: plain(cells[2]), batch: cells[3] }]),
);

// The audit table is checked row by row further down, against tools/constructs.json
// (verdict and batch), and nothing on the site renders it: the construct's own
// `verdict` and `batch` are the published fields. So it stays out of the payload.
const constructs = constructsFile.constructs.map((row) => ({
  id: row.id,
  label: plain(row.label),
  use: row.php,
  verdict: VERDICT[String(row.expect ?? 'null')] ?? 'documented',
  code: row.code ?? null,
  reason: row.reason ?? null,
  batch: row.batch ?? null,
  status: row.status ?? null,
  note: plain(row.note),
}));

const count = (list, key, value) => list.filter((c) => c[key] === value).length;
const constructTotals = {
  audited: constructs.length,
  compiles: count(constructs, 'verdict', 'compiles'),
  failsLoud: count(constructs, 'verdict', 'fails-loud'),
  documented: count(constructs, 'verdict', 'documented'),
};

// Row-by-row agreement between the two files that both claim to describe the
// same 118 constructs. Tallies can agree while two rows are swapped, so this
// compares the verdict and the batch per construct instead of counting.
const auditVerdict = (build) => {
  if (!build) return null;
  if (/fails loud/i.test(build)) return 'fails-loud';
  if (/compiles/i.test(build)) return 'compiles';
  if (/documented/i.test(build)) return 'documented';
  return null;
};
const missingAudit = constructs.filter((c) => !auditByLabel.has(c.label));
const verdictMismatch = constructs.filter((c) => {
  const audited = auditByLabel.get(c.label);
  const said = audited ? auditVerdict(audited.build) : null;
  return said !== null && said !== c.verdict;
});
const batchMismatch = constructs.filter((c) => {
  const audited = auditByLabel.get(c.label);
  return audited ? audited.batch !== c.batch : false;
});

// ------------------------------------------------------------------- facades

const facadeTotal = constructsFile.meta?.facade_total ?? null;
const facades = constructs.filter((c) => c.id.startsWith('facade_'));
const facadeTotals = {
  total: facadeTotal,
  classified: facades.length,
  compiles: count(facades, 'verdict', 'compiles'),
  failsLoud: count(facades, 'verdict', 'fails-loud'),
  documented: count(facades, 'verdict', 'documented'),
  source: constructsFile.meta?.facade_source ?? null,
};

// -------------------------------------------------- README generated counters

const readmeLines = read('README.md').split('\n');
const readmeBlock = readmeLines.slice(
  readmeLines.indexOf('<!-- readme-counts:start -->') + 1,
  readmeLines.indexOf('<!-- readme-counts:end -->'),
).join('\n');

const declared = {
  constructs: (readmeBlock.match(/constructs\s+(\d+) compile[^\d]+(\d+) fail loud[^\d]+(\d+) documented\s+\((\d+) audited\)/) || []).slice(1).map(Number),
  facades: (readmeBlock.match(/facades\s+(\d+)\/(\d+) classified/) || []).slice(1).map(Number),
  corpus: (readmeBlock.match(/blade corpus\s+(\d+)\/(\d+) byte-identical/) || []).slice(1).map(Number),
  docs: (readmeBlock.match(/docs\s+(\d+)\/(\d+) pages with a verdict/) || []).slice(1).map(Number),
};
const declaredCounts = {
  constructs: declared.constructs.length === 4
    ? { compiles: declared.constructs[0], failsLoud: declared.constructs[1], documented: declared.constructs[2], audited: declared.constructs[3] }
    : null,
  facades: declared.facades.length === 2 ? { classified: declared.facades[0], total: declared.facades[1] } : null,
  corpus: declared.corpus.length === 2 ? { identical: declared.corpus[0], cases: declared.corpus[1] } : null,
  docs: declared.docs.length === 2 ? { withVerdict: declared.docs[0], pages: declared.docs[1] } : null,
};

// ------------------------------------------------------- docs pages (MAP §C)

const mapLines = read('MAP.md').split('\n');
const docsPages = tableAfter(mapLines, /^\|\s*Docs page\s*\|\s*Class\s*\|\s*Note\s*\|/).map((cells) => {
  const emoji = firstEmoji(cells[1]);
  return {
    page: plain(cells[0]),
    klass: CLASS[emoji] ?? 'unknown',
    planned: /ph[23]/.test(cells[1]) ? cells[1].match(/ph[23]/)[0] : null,
    note: plain(cells[2]),
  };
});
const docsTotals = {
  pages: docsPages.length,
  ...Object.fromEntries(Object.entries(CLASS).map(([, name]) => [name, docsPages.filter((p) => p.klass === name).length])),
  planned: docsPages.filter((p) => p.planned).length,
};
docsTotals.blank = docsPages.filter((p) => p.klass === 'unknown').length;
// The table states its own tally next to itself, which is a second surface for the
// same distribution: the class counts above are checked against this line too. The
// line puts prose between some emoji and the next count, so each count is read as
// the digits standing immediately before its own emoji.
const tallyLine = mapLines.find((line) => line.startsWith('**Tally:'));
const tallyCount = (emoji) => {
  const match = tallyLine?.match(new RegExp(`(\\d+)\\s*${emoji}`));
  return match ? Number(match[1]) : null;
};
const docsTally = tallyLine ? [tallyCount('✅'), tallyCount('🟡'), tallyCount('🔴'), tallyCount('⛔')] : [];

// ------------------------------------------------- feature map rows (MAP §5)

const featureRows = featureMapRows(mapLines, /^## 6\./);

// Independent of `featureMapRows`: MAP §5 holds seven area tables, so its rows can
// be counted straight off the lines (five cells, a class emoji in the third one).
// That scan does not stop at a blank line, so an area table interrupted by one
// shows up here as a mismatch instead of as silently missing rows.
const featureSectionRows = (() => {
  const from = mapLines.findIndex((line) => /^##\s*5\./.test(line));
  if (from === -1) return [];
  const rest = mapLines.slice(from + 1);
  const to = rest.findIndex((line) => /^##\s/.test(line));
  return (to === -1 ? rest : rest.slice(0, to)).filter((line) => {
    if (!line.startsWith('|')) return false;
    const cells = line.slice(1, line.endsWith('|') ? -1 : undefined).split('|').map((c) => c.trim());
    return cells.length === 5 && Boolean(CLASS[firstEmoji(cells[2])]);
  });
})();

// --------------------------------------------- README "Compiles today" tables

const supported = tableAfter(readmeLines, /^\|\s*Area\s*\|\s*What's supported\s*\|\s*Proof\s*\|/).map((cells) => ({
  area: plain(cells[0]),
  what: plain(cells[1]),
  proof: plain(cells[2]),
}));

const failsLoud = tableAfter(readmeLines, /^\|\s*Construct\s*\|\s*Why\s*\|\s*Escape hatch\s*\|/).map((cells) => ({
  construct: plain(cells[0]),
  why: plain(cells[1]),
  escape: plain(cells[2]),
}));

// ------------------------------------------------------------ cross-checks

// The project's own audit ledger (`notes/PLAYBOOK.local.md`) is a working-tree
// note, not a published file, so this report republishes only its shape: counts,
// statuses and severity spread. The item text stays where it is.
const playbookLines = read('notes/PLAYBOOK.local.md').split('\n');
const cleanCell = (s) => s.replace(/\*\*/g, '').replace(/`/g, '').trim();
const firstToken = (s) => (cleanCell(s).match(/^[A-Za-z]+/) || ['UNKNOWN'])[0].toUpperCase();
const tally = (values) => values.reduce((acc, value) => ((acc[value] = (acc[value] ?? 0) + 1), acc), {});

// The ledger's `saran` cell sometimes contains a literal `|`, which shifts every
// cell after it, so the status is found by its own shape and the evidence is
// always the last cell. `cells[4]`/`cells[5]` would misread those rows.
// The ledger's own legend (its G.3 heading) names three statuses: OPEN / DONE / TOLAK.
// Its author has since used others in the table itself — S20 carries "FIX DI PR
// (2026-11-07)". The parser therefore accepts a documented union, and the check below
// asserts the *shape* of the cell rather than a fixed list, so a genuinely new status
// shows up in the tally on /audit/ledger/ instead of failing a build that is fine.
const LEDGER_STATUS = /^(OPEN|DONE|TOLAK|FIX|FIXED|SUPERSEDED|CLEAN|INFO|WIP)\b/;
const ledgerRows = tableAfter(playbookLines, /^\|\s*#\s*\|\s*area\s*\|\s*saran\s*\|/).map((cells) => {
  const statusCell = cells.slice(2).map((cell) => cleanCell(cell).toUpperCase()).find((cell) => LEDGER_STATUS.test(cell));
  const token = statusCell ? statusCell.match(LEDGER_STATUS)[1] : firstToken(cells[4]);
  return {
    id: cleanCell(cells[0]),
    area: cleanCell(cells[1]) || 'other',
    status: token,
    // The qualifier is a real distinction in the ledger ("OPEN (koreksi)"), so
    // it is kept next to the token instead of being thrown away.
    qualifier: statusCell && statusCell !== token ? statusCell.slice(token.length).trim() : null,
    // The evidence cell is the last non-empty one: rows whose `saran` text holds
    // a literal `|` gain cells, and the file is CRLF so the trailing pipe is not
    // trimmed. Both make a fixed index unreliable.
    cites: /[A-Za-z0-9_./-]+:\d+/.test([...cells].reverse().find((cell) => cell.trim() !== '') ?? ''),
  };
});
const corrections = tableAfter(playbookLines, /^\|\s*hal\s*\|\s*putusan\s*\|\s*tanggal\s*\|/).map((cells) => ({
  ruling: firstToken(cells[1]),
  date: cleanCell(cells[2]),
}));
const severity = (playbookLines.find((l) => l.includes('sebaran severity'))?.match(/P1≈(\d+)\s*·\s*P2≈(\d+)\s*·\s*P3≈(\d+)\s*·\s*INFO≈(\d+)/) || [])
  .slice(1)
  .map(Number);
// The audit scratchpad the severity spread comes from, quoted with the source's
// own approximate marker: it is a row count for the scratchpad, not a headline
// number of defects, so the site must not sum the bands and call that "findings".
const scratchpad = (playbookLines.find((l) => l.includes('Ledger scratchpad'))?.match(/±(\d+)\s*baris/) || [])[1];

// The bands' own definitions live in a second working-tree note (also not in the
// repository). They are quoted verbatim so this report never has to paraphrase
// what P1/P2/P3 mean - a paraphrase of "P2" is a claim of its own.
const contextLines = read('.opencode/context.md').split('\n');
const severityLegend = (() => {
  const line = contextLines.find((l) => l.startsWith('Klasifikasi:'));
  if (!line) return null;
  const bands = {};
  for (const part of line.replace(/^Klasifikasi:\s*/, '').replace(/\.\s*$/, '').split('·')) {
    const match = part.match(/\*\*P(\d)\*\*\s*=\s*(.+)/);
    if (match) bands[`P${match[1]}`] = match[2].trim();
  }
  return Object.keys(bands).length ? bands : null;
})();

// Independent of `tableAfter`: every `| S<n> |` line between the G.3 heading and
// the next `##` heading is a ledger row. The ledger table is interrupted by a
// blank line, so a parser that stops at the first blank publishes a short list.
const ledgerSectionRows = (() => {
  const from = playbookLines.findIndex((line) => /^##\s*G\.3\b/.test(line));
  if (from === -1) return [];
  const rest = playbookLines.slice(from + 1);
  const to = rest.findIndex((line) => /^##\s/.test(line));
  return (to === -1 ? rest : rest.slice(0, to)).filter((line) => /^\|\s*S\d+\s*\|/.test(line));
})();

const playbook = {
  published: false,
  source: 'notes/PLAYBOOK.local.md',
  note: 'working-tree note, not in the repository: only its shape is republished here',
  counts: {
    justified: tableAfter(playbookLines, /^\|\s*hal\s*\|\s*bukti\s*\|/).length,
    ledger: ledgerRows.length,
    corrections: corrections.length,
    fixes: tableAfter(playbookLines, /^\|\s*#\s*\|\s*sev\s*\|\s*fix\s*\|/).length,
  },
  statuses: tally(ledgerRows.map((row) => row.status)),
  qualified: tally(ledgerRows.filter((row) => row.qualifier).map((row) => `${row.status} ${row.qualifier}`)),
  areas: tally(ledgerRows.map((row) => row.area)),
  citing: ledgerRows.filter((row) => row.cites).length,
  rows: ledgerRows.map(({ id, area, status }) => ({ id, area, status })),
  corrections: corrections.length ? { total: corrections.length, rulings: tally(corrections.map((row) => row.ruling)) } : null,
  severity: severity.length === 4 ? { P1: severity[0], P2: severity[1], P3: severity[2], INFO: severity[3] } : null,
  scratchpadRows: scratchpad ? Number(scratchpad) : null,
  severityLegend,
};

// README publishes the project's verdict twice, and the two strings are not the same
// one: the shields badge under the title, and the heading its CI reporter posts on a
// pull request. Both are read from the file rather than restated here.
const verdictBadge = decodeURIComponent(readmeLines.join('\n').match(/badge\/verdict-([A-Za-z0-9%._~-]+?)-[0-9A-Fa-f]{6}/)?.[1] ?? '');
const verdictHeading = readmeLines.join('\n').match(/`### Verdict: ([^`]+)`/)?.[1] ?? '';

// ------------------------------------------------- published CPU figures (COMPILED.md)
// The measurement table on /coverage/ is the one table on the site whose cells are the
// project's prose trimmed for width, so it is not parsed into fields. Instead each figure
// the page prints is listed with the phrase it was transcribed from, and every phrase is
// asserted to still appear in COMPILED.md, the file the table's caption names. A source
// that changes its numbers fails this build rather than leaving the table behind. Both the
// rows and the phrases live here, so the page renders the asserted set and nothing else.
const cpuFigures = [
  {
    load: 'page-like kernel load',
    p50: '5 ms',
    p95: '41 ms',
    max: '62 ms',
    note: '5 hot paths × 50 iterations, 200 requests / 4 connections',
    source: [
      'cpu p50 5 ms / p95 41 ms / max 62 ms',
      '5 kernel hot paths',
      '50 iterations each per request',
      '200 requests over 4 concurrent connections',
    ],
  },
  {
    load: 'bcryptjs cost 10 (login path)',
    p50: '93 to 104 ms',
    p95: 'not measured',
    max: 'not measured',
    note: 'kept off every per-page path; native PBKDF2 of at most 100k iterations = 22 ms fallback',
    source: ['cost10=93–104', 'login-only path', 'PBKDF2 (≤100k iters, measured 22 ms)'],
  },
  {
    load: 'burn control (must be caught)',
    p50: 'about 2020 ms',
    p95: 'n/a',
    max: 'killed',
    note: 'Free plan kills a single over-budget request at cpu=2020 ms, 1102 exceededCpu',
    source: ['cpu=2020 ms', '1102 `exceededCpu`'],
  },
];
const cpuPublished = [
  ...cpuFigures.flatMap((row) => row.source.map((needle) => [row.load, needle])),
  ['the Free-plan budget, as the caption states it', '10 ms CPU per'],
  ['the budget as documented', 'invocation** as documented'],
  ['the enforcement finding', 'softer than the docs'],
  ['the rollover bank', 'rollover bank'],
  ['the tail ratio in the notice', 'p95 tail is 4× over it'],
];
const cpuMissing = cpuPublished.filter(([, needle]) => !compiledText.includes(needle));

// ----------------------------------------- package fleet (docs/PACKAGES-RESEARCH.md)

// The fleet note classifies every famous Laravel package the project looked at
// into one of five verdicts: compile / port / substitute / special / refuse. The
// site republishes the note's own cluster table and its per-package verdict
// lines; no package is re-judged here.
const packagesText = read('docs/PACKAGES-RESEARCH.md');
const packageLines = packagesText.split('\n');

const PACKAGE_VERDICTS = ['compile', 'port', 'substitute', 'special', 'refuse'];
const verdictOf = (text) => {
  const bold = PACKAGE_VERDICTS.filter((v) => new RegExp(`\\*\\*${v}\\*\\*`, 'i').test(text));
  // A few rows name the verdicts without emphasis ("database=compile, sync=port");
  // fall back to the bare token when nothing is bolded.
  return bold.length ? bold : PACKAGE_VERDICTS.filter((v) => new RegExp(`\\b${v}\\b`, 'i').test(text));
};

// The cluster summary under "## Ringkasan verdict": one row per cluster, five
// verdict columns, each cell a comma list (or the empty placeholder).
const packageClusters = tableAfter(packageLines, /^\|\s*Kluster\s*\|\s*compile\s*\|/).map((cells) => ({
  name: plain(cells[0]),
  cells: Object.fromEntries(PACKAGE_VERDICTS.map((v, i) => [v, plain(cells[i + 1] ?? '')])),
}));

// Every "### <name>" entry inside a "## <cluster>" section. Some entries carry
// the verdict inline on the heading (the observability batch), so the heading
// text is read the same way as a "- verdict:" line.
const packageEntries = [];
let packageCluster = null;
for (let i = 0; i < packageLines.length; i++) {
  const line = packageLines[i];
  const h2 = line.match(/^##\s+(.+)$/);
  if (h2) {
    packageCluster = /^(Ringkasan|Catatan|Sumber)/.test(h2[1].trim()) ? null : plain(h2[1]);
    continue;
  }
  const h3 = line.match(/^###\s+(.+)$/);
  if (!h3 || !packageCluster) continue;
  // "### Lintas-kluster: ..." rows are cross-cutting notes about a cluster, not a
  // package entry, so they carry no verdict and are not republished as one.
  if (/^Lintas-kluster/i.test(h3[1].trim())) continue;
  let verdictText = h3[1];
  for (let j = i + 1; j < Math.min(i + 6, packageLines.length); j++) {
    const vm = packageLines[j].match(/^\s*-\s*verdict:\s*(.+)$/);
    if (vm) { verdictText = vm[1]; break; }
    if (/^#{2,3}\s/.test(packageLines[j])) break;
  }
  const verdicts = verdictOf(verdictText);
  const title = plain(h3[1]);
  const vm = title.match(/^(.*?)\s+v([\d][\d.\w]*)\s*$/);
  packageEntries.push({
    cluster: packageCluster,
    name: (vm ? vm[1] : title.split(/[,(]/)[0]).trim(),
    version: vm ? vm[2] : null,
    verdicts,
    note: plain(verdictText).split(/(?<=[a-z0-9)`])\.\s/)[0].slice(0, 220),
  });
}

const packageTotals = Object.fromEntries(
  PACKAGE_VERDICTS.map((v) => [v, packageEntries.filter((e) => e.verdicts.includes(v)).length]),
);

// ------------------------------------------------ port fleet (ports/packages/*.mjs)

// Each port module opens with a comment that states what it replaces and what
// runs at the edge. The first line is the module's own statement of the port
// ("Port of laravel/sanctum v4.3.3", "spatie/laravel-glide port"); the part after
// the em dash is its summary. `upstream`/`version` are parsed from that line.
const portsDir = 'ports/packages';
// The route seam: `registry.example.json` maps a route path to a port slug. One
// slug may answer several paths, so the reverse map is slug -> [paths].
const registryPorts = JSON.parse(read('registry.example.json')).ports ?? {};
const portRoutes = {};
for (const [route, slug] of Object.entries(registryPorts)) (portRoutes[slug] ??= []).push(route);
const ports = readdirSync(resolve(REPO, portsDir))
  .filter((f) => f.endsWith('.mjs'))
  .sort()
  .map((file) => {
    const slug = file.slice(0, -4);
    const src = read(`${portsDir}/${file}`);
    const comments = src
      .split('\n')
      .slice(0, 60)
      .filter((l) => l.trim().startsWith('//'))
      .map((l) => l.replace(/^\s*\/\/\s?/, '').trim())
      .filter((l) => l.length > 1);
    let line1 = (comments[0] ?? '').replace(/^ports\/packages\/[\w.-]+\.mjs\s*[—–-]\s*/, '');
    let subject = line1;
    let summary = '';
    const dash = line1.match(/^(.*?)\s+[—–]\s+(.*)$/);
    if (dash) { subject = dash[1].trim(); summary = dash[2].trim(); }
    else summary = (comments[1] ?? '').trim();
    subject = subject
      .replace(/^Port of\s+/i, '')
      .replace(/^Port:\s*/i, '')
      .replace(/\.$/, '')
      .replace(/\s+(seam|port|auth-half|half)$/i, '')
      .trim();
    let version = null;
    const paren = subject.match(/\((?:v)([\d][\d.\w]*)\)/i);
    if (paren) { version = paren[1]; subject = subject.replace(paren[0], '').trim(); }
    else {
      const tail = subject.match(/\s+v([\d][\d.\w]*)$/i);
      if (tail) { version = tail[1]; subject = subject.slice(0, subject.length - tail[0].length).trim(); }
    }
    let note = null;
    const qual = subject.match(/\s*\(([^)]*)\)\s*$/);
    if (qual) { note = plain(qual[1]); subject = subject.slice(0, subject.length - qual[0].length).trim(); }
    return {
      slug,
      upstream: plain(subject),
      version,
      qualifier: note,
      summary: plain(summary.replace(/\s+/g, ' ').split(/(?<=[a-z0-9)`])\.\s/)[0]),
      routes: portRoutes[slug] ?? [],
    };
  });

// ------------------------------------------- Laravel API surfaces (kernel/*.mjs)

// The kernel modules that stand in for a Laravel class or facade. The mapping is
// the one each module's own header names; every module is asserted to exist.
const SURFACES = [
  ['Illuminate\\Support\\Str', 'str.mjs', 'methods'],
  ['Illuminate\\Support\\Arr', 'arr.mjs', 'methods'],
  ['Illuminate\\Support\\Collection', 'collections.mjs', 'class'],
  ['Illuminate\\Database\\Eloquent\\Model', 'model.mjs', 'class'],
  ['Illuminate\\Database\\Query\\Builder', 'db.mjs', 'class'],
  ['Illuminate\\Session\\Store', 'session.mjs', 'class'],
  ['Illuminate\\Validation\\Validator', 'validator.mjs', 'class'],
  ['Illuminate\\Foundation\\Http\\FormRequest', 'form-request.mjs', 'class'],
  ['Illuminate\\Http\\Resources\\Json\\JsonResource', 'resources.mjs', 'class'],
  ['Illuminate\\Mail\\Mailable', 'mailable.mjs', 'class'],
  ['Illuminate\\Cache\\DatabaseStore', 'cache.mjs', 'class'],
  ['Illuminate\\Cache\\RateLimiter', 'ratelimit.mjs', 'class'],
  ['Illuminate\\Routing\\Router', 'router.mjs', 'class'],
  ['Illuminate\\Cookie', 'cookies.mjs', 'class'],
  ['Illuminate\\Foundation\\Http\\Middleware\\PreventRequestForgery', 'csrf.mjs', 'class'],
  ['Illuminate\\Auth\\SessionGuard', 'auth.mjs', 'class'],
  ['Illuminate\\Pagination\\LengthAwarePaginator', 'paginator.mjs', 'class'],
  ['Illuminate\\Encryption\\Encrypter', 'encrypter.mjs', 'class'],
  ['Illuminate\\Hashing\\BcryptHasher', 'hash.mjs', 'class'],
  ['Illuminate\\Console\\Scheduling\\Schedule', 'scheduler.mjs', 'class'],
  ['Illuminate\\Queue', 'queue.mjs', 'class'],
  ['Illuminate\\Filesystem', 'storage.mjs', 'class'],
  ['Illuminate\\Redis', 'redis.mjs', 'class'],
  ['Illuminate\\View\\ViewErrorBag', 'view-error-bag.mjs', 'class'],
  ['Illuminate\\Http\\Response', 'response.mjs', 'class'],
  ['Intervention\\Image', 'image.mjs', 'class'],
  ['Illuminate\\Mail', 'mail.mjs', 'class'],
  ['Illuminate\\Http\\Request', 'http.mjs', 'class'],
];

const surfaces = SURFACES.map(([laravel, module, kind]) => {
  const src = read(`kernel/${module}`);
  let items = [];
  if (kind === 'methods') {
    const sets = [...src.matchAll(/export const \w*METHODS\w* = new Set\(\[([\s\S]*?)\]\)/g)];
    items = sets.flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
  } else {
    items = [...src.matchAll(/^export class (\w+)/gm)].map((m) => m[1]);
    // A module without an exported class still answers a Laravel API: fall back to
    // the functions and constants it does export (the module is the surface).
    if (!items.length) items = [...src.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]);
  }
  return { laravel: laravel.replace(/\\\\/g, '\\'), module, kind, items: [...new Set(items)].sort((a, b) => a.localeCompare(b)) };
});

const checks = [
  {
    name: 'tools/constructs.json tallies with the README counter block',
    ok:
      !!declaredCounts.constructs &&
      declaredCounts.constructs.compiles === constructTotals.compiles &&
      declaredCounts.constructs.failsLoud === constructTotals.failsLoud &&
      declaredCounts.constructs.documented === constructTotals.documented &&
      declaredCounts.constructs.audited === constructTotals.audited,
    detail: `constructs.json ${constructTotals.compiles}/${constructTotals.failsLoud}/${constructTotals.documented} of ${constructTotals.audited}, README ${JSON.stringify(declaredCounts.constructs)}`,
  },
  {
    name: 'the audit table carries every construct, with the same verdict',
    ok: missingAudit.length === 0 && verdictMismatch.length === 0,
    detail: `${auditTable.length} audit rows, ${constructs.length} constructs, ${missingAudit.length} missing, ${verdictMismatch.length} verdict disagreements${verdictMismatch.length ? ` (${verdictMismatch.slice(0, 3).map((m) => m.label).join('; ')})` : ''}`,
  },
  {
    name: 'the audit table and tools/constructs.json agree on every batch',
    ok: batchMismatch.length === 0,
    detail: `${batchMismatch.length} of ${constructs.length} rows disagree`,
  },
  {
    name: 'the facade census is complete (classified === declared total)',
    ok: facadeTotals.classified === facadeTotals.total,
    detail: `${facadeTotals.classified} of ${facadeTotals.total}`,
  },
  {
    name: 'the MAP coverage index has no blank verdict',
    ok: docsTotals.blank === 0,
    detail: `${docsTotals.pages} rows, ${docsTotals.blank} blank`,
  },
  {
    name: 'the MAP tally line matches the classes parsed from its own table',
    ok:
      docsTally.length === 4 &&
      docsTally[0] === docsTotals.fits &&
      docsTally[1] === docsTotals.soft &&
      docsTally[2] === docsTotals.hard &&
      docsTally[3] === docsTotals['not-applicable'],
    detail: `MAP tally ${JSON.stringify(docsTally)}, parsed ${['fits', 'soft', 'hard', 'not-applicable'].map((klass) => docsTotals[klass]).join('/')}`,
  },
 {
  name: 'the README docs counter matches the MAP coverage index row count',
  ok: declaredCounts.docs?.withVerdict === docsTotals.pages && declaredCounts.docs?.pages === docsTotals.pages,
    detail: `README ${JSON.stringify(declaredCounts.docs)}, MAP rows ${docsTotals.pages}`,
  },
  {
    name: 'the verdict strings README publishes are read, not restated',
    ok: verdictBadge.length > 0 && verdictHeading.length > 0,
    detail: `badge "${verdictBadge}", CI heading "${verdictHeading}"`,
  },
  {
    name: 'every CPU figure the coverage page prints is still in COMPILED.md',
    ok: cpuMissing.length === 0 && cpuPublished.length >= 12,
    detail: `${cpuPublished.length - cpuMissing.length} of ${cpuPublished.length} phrases present${
      cpuMissing.length ? `, missing: ${cpuMissing.map(([label, needle]) => `${label} (${needle})`).join('; ')}` : ''
    }`,
  },
  {
    name: 'the ledger table is read whole (a blank line inside it does not truncate)',
    ok: ledgerSectionRows.length === playbook.counts.ledger && playbook.counts.ledger > 0,
    detail: `${playbook.counts.ledger} rows parsed, ${ledgerSectionRows.length} in the G.3 section`,
  },
  {
    name: 'every ledger status cell carries a status token, not a shifted column',
    ok: Object.keys(playbook.statuses).every((key) => LEDGER_STATUS.test(key)),
    detail: `${JSON.stringify(playbook.statuses)} (the ledger legend names OPEN / DONE / TOLAK; newer rows use others)`,
  },
  {
    name: 'the feature map yields at least one row per area',
    ok: new Set(featureRows.map((row) => row.area)).size >= 5,
    detail: `${featureRows.length} rows across ${new Set(featureRows.map((row) => row.area)).size} areas`,
  },
  {
    name: 'the feature map is read whole (section 5, counted line by line)',
    ok: featureSectionRows.length === featureRows.length && featureRows.length > 0,
    detail: `${featureRows.length} rows parsed, ${featureSectionRows.length} in MAP §5`,
  },
  {
    name: 'the severity bands are defined in the source, not paraphrased here',
    ok: !!playbook.severityLegend && ['P1', 'P2', 'P3'].every((band) => !!playbook.severityLegend[band]),
    detail: JSON.stringify(playbook.severityLegend),
  },
  {
    name: 'the audit scratchpad row count is quoted from the source',
    ok: playbook.scratchpadRows !== null && playbook.scratchpadRows > 0,
    detail: `scratchpad ${playbook.scratchpadRows} rows, spread ${JSON.stringify(playbook.severity)}`,
  },
  {
    name: 'every registry port slug has a module file, and every module is reachable from the registry',
    ok:
      ports.length > 0 &&
      ports.every((p) => Object.values(registryPorts).includes(p.slug) || p.routes.length === 0) &&
      Object.values(registryPorts).every((slug) => ports.some((p) => p.slug === slug)),
    detail: `${ports.length} modules, ${new Set(Object.values(registryPorts)).size} slugs in registry.example.json`,
  },
  {
    name: 'every port module states what it replaces (an upstream and a summary)',
    ok: ports.every((p) => p.upstream.length > 0 && p.summary.length > 0),
    detail: `${ports.filter((p) => p.upstream && p.summary).length}/${ports.length} with both`,
  },
  {
    name: 'every Laravel surface row points at a kernel module that exists',
    ok: surfaces.every((s) => s.items.length > 0),
    detail: `${surfaces.length} surfaces, ${surfaces.reduce((n, s) => n + s.items.length, 0)} named members`,
  },
  {
    name: 'the package fleet reads whole: every cluster row is in the source table',
    ok: packageClusters.length > 0 && packageEntries.length > packageClusters.length,
    detail: `${packageEntries.length} package entries across ${packageClusters.length} clusters`,
  },
  {
    name: 'every package entry carries at least one verdict token',
    ok: packageEntries.every((e) => e.verdicts.length > 0),
    detail: `${packageEntries.filter((e) => !e.verdicts.length).length} without a verdict`,
  },
];

// --------------------------------------------------------------------- meta

let head = null;
let dirty = null;
try {
  head = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  dirty = execFileSync('git', ['-C', REPO, 'status', '--porcelain'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).length;
} catch {
  head = null;
}

const files = ['README.md', 'MAP.md', 'COMPILED.md', 'tools/constructs.json', 'package.json', 'notes/PLAYBOOK.local.md', '.opencode/context.md'];

const report = {
  generatedAt: new Date().toISOString(),
  generator: 'scripts/extract-lw.mjs',
  auditedRepo: {
    name: 'arfoux/laravel-workers',
    // Relative to this project so the published JSON carries no machine-local path.
    path: relative(process.cwd(), REPO).replace(/\\/g, '/'),
    head,
    dirtyFiles: dirty,
    version: JSON.parse(read('package.json')).version,
    files: files.map(provenance),
  },
  headline: {
    constructs: constructTotals,
    facades: facadeTotals,
    corpus: declaredCounts.corpus,
    docs: docsTotals,
    declared: declaredCounts,
    verdict: { badge: verdictBadge, heading: verdictHeading },
  },
  // The renderable cells only: the phrases each was transcribed from stay in this script.
  cpuFigures: cpuFigures.map(({ load, p50, p95, max, note }) => ({ load, p50, p95, max, note })),
  constructs,
  docsPages,
  features: featureRows,
  supported,
  failsLoud,
  packages: { clusters: packageClusters, entries: packageEntries, totals: packageTotals },
  ports,
  surfaces,
  playbook,
  checks,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 1) + '\n');

if (checks.some((check) => !check.ok)) {
  console.error(`FAIL  ${checks.filter((check) => !check.ok).length} cross-check(s) failed`);
  process.exitCode = 1;
}

console.log(`wrote ${OUT}`);
console.log(`  constructs ${constructTotals.audited}: ${constructTotals.compiles} compile, ${constructTotals.failsLoud} fail loud, ${constructTotals.documented} documented`);
console.log(`  facades ${facadeTotals.classified}/${facadeTotals.total}, docs pages ${docsTotals.pages}, feature rows ${featureRows.length}`);
for (const c of checks) console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name} (${c.detail})`);
if (checks.some((c) => !c.ok)) process.exitCode = 1;
