import nextConfig from 'eslint-config-next';

const config = [
  ...nextConfig,
  {
    ignores: ['.claude/**', '.design-ref/**'],
  },
];

export default config;
