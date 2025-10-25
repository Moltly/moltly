// Flat ESLint config for Next.js 16
// Migrated from .eslintrc.json to support ESLint v9 flat config
import next from 'eslint-config-next';

const config = [
  // Next.js recommended + TypeScript rules
  ...next,
  // Project-specific rules migrated from .eslintrc.json
  {
    rules: {
      'react/no-unescaped-entities': 'error',
      '@next/next/no-img-element': 'warn',
    },
  },
  // Ignore build output and dependencies
  {
    ignores: ['.next/**', 'node_modules/**'],
  },
];

export default config;
