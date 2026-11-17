import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'android', 'coverage', 'playwright-report', 'test-results', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='parseFloat']",
          message: 'No uses parseFloat para dinero: usá parseDecimalInput/big.js.',
        },
      ],
    },
  },
  {
    files: ['src/privacy/**/*.ts'],
    rules: {
      // La frontera de privacidad nunca importa la base ni servicios con datos internos.
      'no-restricted-imports': ['error', { patterns: ['../data/*', '../sync/*', '../ui/*'] }],
    },
  },
);
