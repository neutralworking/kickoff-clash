import nextConfig from 'eslint-config-next';

const config = [
  ...nextConfig,
  {
    // design/ holds design references + handoff prototypes (bespoke runtimes,
    // not app code) — never lint them.
    ignores: ['.claude/**', '.design-ref/**', 'design/**'],
  },
];

export default config;
