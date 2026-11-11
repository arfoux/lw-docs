// The documentation tree. One entry per page, in reading order; the sidebar, the
// docs index and the prev/next footer are all built from this, so a page cannot
// exist without appearing in the navigation (and a test at the bottom checks the
// reverse: nothing in the sidebar may point at a page this site does not build).
export const docs = [
  {
    group: 'Start',
    pages: [
      {
        slug: '',
        title: 'Getting started',
        summary: 'Requirements, the first build, and the first deploy. One command each.',
      },
      {
        slug: 'cli',
        title: 'CLI reference',
        summary: 'Every command and flag the binary answers to, and the exit codes CI can branch on.',
      },
    ],
  },
  {
    group: 'Guide',
    pages: [
      {
        slug: 'deploy',
        title: 'Deploy',
        summary: 'The guided path from --plan to a Worker: modes, D1, the schema guard, the account guard.',
      },
      {
        slug: 'routes',
        title: 'Routes & ports',
        summary: 'What --strict enforces, what registry.json declares, and how a port replaces a route.',
      },
      {
        slug: 'blade',
        title: 'Blade & parity',
        summary: 'Which Blade compiles, how the layouts travel, and what byte-parity against PHP 8.3 means.',
      },
      {
        slug: 'data',
        title: 'Data & D1',
        summary: 'Schema at build time, the query builder, Eloquent, cache, storage and uploads on the edge.',
      },
      {
        slug: 'auth',
        title: 'Auth & sessions',
        summary: 'Session guard, remember-me, CSRF, policies, throttling — and the guard port.',
      },
      {
        slug: 'frontend',
        title: 'Frontend & assets',
        summary: 'Vite runs at build time; static assets and the worker share one origin.',
      },
    ],
  },
  {
    group: 'Reference',
    pages: [
      {
        slug: 'packages',
        title: 'Packages & ports',
        summary: 'The famous packages with a verdict, the port modules that ship, and the Laravel APIs they replace.',
      },
      {
        slug: 'compatibility',
        title: 'Compatibility',
        summary: 'All 105 Laravel documentation pages, and every construct the audit covers, with a verdict.',
      },
      {
        slug: 'ci',
        title: 'CI & verdict',
        summary: 'The three layers, the copy-paste workflow, and the two traps that silently break it.',
      },
      {
        slug: 'limits',
        title: 'Limits',
        summary: 'What does not run at the edge, why, and the honest edge of the "runs on the edge" claim.',
      },
      {
        slug: 'architecture',
        title: 'Architecture',
        summary: 'S0 to S6, one Laravel boot per phase, and the build cache that skips them all.',
      },
      {
        slug: 'faq',
        title: 'FAQ',
        summary: 'The questions this toolchain gets before anyone reads the docs.',
      },
    ],
  },
];

export const flatDocs = docs.flatMap((group) => group.pages.map((page) => ({ ...page, group: group.group })));

export const docPath = (slug) => (slug ? `/docs/${slug}/` : '/docs/');

export const neighbours = (slug) => {
  const index = flatDocs.findIndex((page) => page.slug === slug);
  return {
    previous: index > 0 ? flatDocs[index - 1] : null,
    next: index >= 0 && index < flatDocs.length - 1 ? flatDocs[index + 1] : null,
  };
};
