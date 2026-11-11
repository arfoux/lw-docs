import REPORT from '../data/report.json';

const head = REPORT.auditedRepo.head.slice(0, 7);

// Facts about the package this site is for. version/head/source come from the fresh
// extraction (scripts/extract-lw.mjs) so a repo bump cannot leave the footer, the
// docs and the audit pinned to three different commits.
export const site = {
  name: 'laravel-workers',
  version: REPORT.auditedRepo.version,
  tagline: 'Compile a Laravel app to a JS Worker.',
  npm: 'https://www.npmjs.com/package/laravel-workers',
  repo: 'https://github.com/arfoux/laravel-workers',
  issues: 'https://github.com/arfoux/laravel-workers/issues',
  changelog: 'https://github.com/arfoux/laravel-workers/blob/main/CHANGELOG.md',
  license: 'MIT',
  licenseUrl: 'https://github.com/arfoux/laravel-workers/blob/main/LICENSE',
  // The docs in this site are read from the repository at this commit.
  source: head,
  engines: { node: '>=22', bun: '>=1.0' },
  install: 'npm i -D laravel-workers',
  runtimeDeps: ['bcryptjs', 'blade2php', 'php-parser'],
  // The audited repository figure the report pages are pinned to.
  audited: { repo: 'arfoux/laravel-workers', head, version: REPORT.auditedRepo.version },
};

export const paths = {
  docs: '/docs/',
  compatibility: '/docs/compatibility/',
  routes: '/docs/routes/',
  packages: '/docs/packages/',
  audit: '/audit/',
};
