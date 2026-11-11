import REPORT from '../data/report.json';

export const report = REPORT;
export const { headline, cpuFigures, constructs, docsPages, features, supported, failsLoud, checks, auditedRepo, playbook, packages, ports, surfaces } = REPORT;

export const pct = (part, whole) => (whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10);

export const VERDICT_LABEL = {
  compiles: 'compiles',
  'fails-loud': 'fails loud',
  documented: 'documented',
};

export const CLASS_LABEL = {
  fits: 'fits',
  soft: 'documented trade',
  hard: 'platform wall',
  'not-applicable': 'not applicable',
};

export const CLASS_RUNS = {
  fits: 'runs on the edge',
  soft: 'runs with declared gaps',
  hard: 'needs a port',
  'not-applicable': 'local only',
};

export const constructGroups = Object.values(
  constructs.reduce((acc, item) => {
    const key = item.batch ?? 'unbatched';
    acc[key] ??= { batch: key, items: [] };
    acc[key].items.push(item);
    return acc;
  }, {}),
).sort((a, b) => b.items.length - a.items.length || a.batch.localeCompare(b.batch));

export const docGroups = Object.values(
  docsPages.reduce((acc, page) => {
    acc[page.klass] ??= { klass: page.klass, pages: [] };
    acc[page.klass].pages.push(page);
    return acc;
  }, {}),
);

export const featureAreas = Object.values(
  features.reduce((acc, row) => {
    acc[row.area] ??= { area: row.area, rows: [] };
    acc[row.area].rows.push(row);
    return acc;
  }, {}),
);

export const shortSha = (sha) => (sha ? sha.slice(0, 9) : 'unknown');

export const fetchedOn = new Date(report.generatedAt).toISOString().slice(0, 10);

export const number = (value) => new Intl.NumberFormat('en-US').format(value);
