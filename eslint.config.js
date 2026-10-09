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
// Fronteira das apps com o banco (ADR 0001 §e): só a superfície pública de @crypto/database.
const DATABASE_BOUNDARY_MESSAGE =
  'Apps acessam o banco só pela superfície pública de @crypto/database (ADR 0001 §e).';
const BUN_SQL_GLOBAL_RESTRICTION = {
  selector: "MemberExpression[object.name='Bun'][property.name='SQL']",
  message: DATABASE_BOUNDARY_MESSAGE,
};
const OWNERSHIP_TYPE_GUARD_RESTRICTION = {
  selector: 'TSTypePredicate TSTypeReference[typeName.name=/^(UserId|OwnerScope|AccountId)$/]',
  message: 'UserId, OwnerScope e AccountId só nascem dentro de @crypto/database (ADR 0001 §c).',
};
const APP_DATABASE_IMPORT_RESTRICTION = {
  paths: [{ name: 'bun', importNames: ['SQL', 'sql'], message: DATABASE_BOUNDARY_MESSAGE }],
  patterns: [
    {
      group: ['drizzle-orm', 'drizzle-orm/*', 'drizzle-kit', 'drizzle-kit/*'],
      message: DATABASE_BOUNDARY_MESSAGE,
    },
    { group: ['@crypto/database/*'], message: DATABASE_BOUNDARY_MESSAGE },
    { group: ['**/packages/**'], message: 'Importe pacotes pelo nome público, nunca por caminho.' },
  ],
};
const APP_SYNTAX_RESTRICTIONS = [BUN_SQL_GLOBAL_RESTRICTION, OWNERSHIP_TYPE_GUARD_RESTRICTION];

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
    files: ['apps/*/src/**/*.ts', 'apps/*/src/**/*.tsx'],
    linterOptions: { noInlineConfig: true },
    rules: {
      'no-restricted-imports': ['error', APP_DATABASE_IMPORT_RESTRICTION],
      // Sem exceções nomeadas: `as const` é sempre aceito por esta regra.
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      'no-restricted-syntax': [
        'error',
        EXPORT_DEFAULT_RESTRICTION,
        PROCESS_ENV_RESTRICTION,
        IMPORT_META_ENV_RESTRICTION,
        ...APP_SYNTAX_RESTRICTIONS,
      ],
    },
  },
  {
    files: ['packages/*/src/**/environment.ts', 'packages/database/src/read-database-url.ts'],
    rules: {
      'no-restricted-syntax': ['error', EXPORT_DEFAULT_RESTRICTION],
    },
  },
  {
    files: ['apps/*/src/environment.ts'],
    rules: {
      'no-restricted-syntax': ['error', EXPORT_DEFAULT_RESTRICTION, ...APP_SYNTAX_RESTRICTIONS],
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
