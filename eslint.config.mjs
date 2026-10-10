import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['node_modules/', 'coverage/', 'backups/', '.vercel/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: globals.node },
  },
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  prettier,
];
