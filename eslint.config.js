import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const EXPORT_DEFAULT_RESTRICTION = {
  selector: 'ExportDefaultDeclaration',
  message: 'Use named exports only.',
};
const PROCESS_ENV_RESTRICTION = {
  selector: "MemberExpression[object.name='process'][property.name='env']",
  message: 'Leia o ambiente só pelo schema em environment.ts de cada app ou pacote.',
};
const IMPORT_META_ENV_RESTRICTION = {
  selector: "MemberExpression[object.type='MetaProperty'][property.name='env']",
  message: 'Leia o ambiente só pelo schema em environment.ts de cada app ou pacote.',
};

export default tseslint.config(
  {
    ignores: ['dist', 'coverage', 'node_modules', 'docs', 'specs'],
  },
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended],
  },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
      'no-restricted-exports': ['error', { restrictedNamedExports: ['default'] }],
      'no-restricted-syntax': [
        'error',
        EXPORT_DEFAULT_RESTRICTION,
        PROCESS_ENV_RESTRICTION,
        IMPORT_META_ENV_RESTRICTION,
      ],
    },
  },
  {
    files: [
      'apps/*/src/environment.ts',
      'packages/*/src/**/environment.ts',
      'packages/database/src/read-database-url.ts',
    ],
    rules: {
      'no-restricted-syntax': ['error', EXPORT_DEFAULT_RESTRICTION],
    },
  },
  {
    files: ['packages/database/drizzle.config.ts'],
    rules: {
      'no-restricted-exports': 'off',
      'no-restricted-syntax': 'off',
    },
  },
);
