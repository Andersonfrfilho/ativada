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
// Fronteira das apps com o banco (ADR 0001 §e): só a superfície pública de @cryptoada/database.
const DATABASE_BOUNDARY_MESSAGE =
  'Apps acessam o banco só pela superfície pública de @cryptoada/database (ADR 0001 §e).';
const BUN_SQL_PROPERTY = '/^(SQL|sql)$/';
const BUN_GLOBAL_SELECTORS = [
  "[object.name='Bun']",
  "[object.object.name='globalThis'][object.property.name='Bun']",
];
const BUN_SQL_RESTRICTIONS = [
  ...BUN_GLOBAL_SELECTORS.flatMap((objectSelector) => [
    {
      selector: `MemberExpression${objectSelector}[property.name=${BUN_SQL_PROPERTY}]`,
      message: DATABASE_BOUNDARY_MESSAGE,
    },
    {
      selector: `MemberExpression${objectSelector}[property.value=${BUN_SQL_PROPERTY}]`,
      message: DATABASE_BOUNDARY_MESSAGE,
    },
  ]),
  {
    selector: "VariableDeclarator[init.name='Bun'], AssignmentExpression[right.name='Bun']",
    message:
      'Não guarde nem desestruture o global Bun: Bun.SQL é fronteira do banco (ADR 0001 §e).',
  },
  {
    selector:
      "VariableDeclarator[init.object.name='globalThis'][init.property.name='Bun'], AssignmentExpression[right.object.name='globalThis'][right.property.name='Bun']",
    message:
      'Não guarde nem desestruture o global Bun: Bun.SQL é fronteira do banco (ADR 0001 §e).',
  },
];
const DYNAMIC_IMPORT_RESTRICTION = {
  selector: 'ImportExpression',
  message: 'Import dinâmico contorna a fronteira do banco; nas apps de backend só import estático.',
};
const OWNERSHIP_RETURN_TYPE_RESTRICTION = {
  selector:
    ':matches(TSDeclareFunction, TSFunctionType, TSEmptyBodyFunctionExpression, TSMethodSignature, TSCallSignatureDeclaration)[returnType.typeAnnotation.typeName.name=/^(UserId|OwnerScope|AccountId)$/]',
  message:
    'Sobrecarga ou tipo de função que devolve UserId, OwnerScope ou AccountId fabrica o valor (ADR 0001 §c).',
};
const OWNERSHIP_TYPE_GUARD_RESTRICTION = {
  selector: 'TSTypePredicate TSTypeReference[typeName.name=/^(UserId|OwnerScope|AccountId)$/]',
  message: 'UserId, OwnerScope e AccountId só nascem dentro de @cryptoada/database (ADR 0001 §c).',
};
const APP_DATABASE_IMPORT_RESTRICTION = {
  paths: [
    {
      name: 'bun',
      importNames: ['default', 'SQL', 'sql'],
      message: DATABASE_BOUNDARY_MESSAGE,
    },
  ],
  patterns: [
    {
      group: ['drizzle-orm', 'drizzle-orm/*', 'drizzle-kit', 'drizzle-kit/*'],
      message: DATABASE_BOUNDARY_MESSAGE,
    },
    { group: ['@cryptoada/database/*'], message: DATABASE_BOUNDARY_MESSAGE },
    { group: ['**/packages/**'], message: 'Importe pacotes pelo nome público, nunca por caminho.' },
  ],
};
const APP_SYNTAX_RESTRICTIONS = [
  ...BUN_SQL_RESTRICTIONS,
  OWNERSHIP_TYPE_GUARD_RESTRICTION,
  OWNERSHIP_RETURN_TYPE_RESTRICTION,
];
// O frontend não depende de @cryptoada/database; só ele usa import dinâmico (React.lazy).
const BACKEND_SYNTAX_RESTRICTIONS = [...APP_SYNTAX_RESTRICTIONS, DYNAMIC_IMPORT_RESTRICTION];
const BACKEND_APP_SOURCES = 'apps/{api,worker,cron}-cryptoada/src';
const TYPESCRIPT_FILES = '**/*.{ts,tsx,mts,cts}';
const APP_SOURCE_FILES = 'apps/*/src/**/*.{ts,tsx,mts,cts,js,mjs}';

export default tseslint.config(
  {
    ignores: ['dist', 'coverage', 'node_modules', 'docs', 'specs'],
  },
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended],
  },
  {
    files: [TYPESCRIPT_FILES],
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
    files: [APP_SOURCE_FILES],
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
    // JavaScript em apps/*/src é reprovado pelo contrato de teste; aqui só evita derrubar o ESLint.
    files: ['apps/*/src/**/*.{js,mjs}'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: [`${BACKEND_APP_SOURCES}/**/*.{ts,tsx,mts,cts,js,mjs}`],
    rules: {
      'no-restricted-syntax': [
        'error',
        EXPORT_DEFAULT_RESTRICTION,
        PROCESS_ENV_RESTRICTION,
        IMPORT_META_ENV_RESTRICTION,
        ...BACKEND_SYNTAX_RESTRICTIONS,
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
    files: [`${BACKEND_APP_SOURCES}/environment.ts`],
    rules: {
      'no-restricted-syntax': ['error', EXPORT_DEFAULT_RESTRICTION, ...BACKEND_SYNTAX_RESTRICTIONS],
    },
  },
  {
    files: ['apps/*/src/**/*.{ts,tsx,mts,cts}', 'packages/*/src/**/*.{ts,tsx,mts,cts}'],
    rules: { 'no-console': 'error' },
  },
  {
    // Limites de tamanho do código de produção; exceção só como override nomeado por arquivo, logo abaixo (hoje nenhuma).
    files: ['apps/*/src/**/*.{ts,tsx,mts,cts}', 'packages/*/src/**/*.{ts,tsx,mts,cts}'],
    linterOptions: { noInlineConfig: true },
    rules: {
      'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
      'max-lines': ['error', { max: 200, skipBlankLines: true, skipComments: true }],
      'max-params': ['error', 3],
    },
  },
  {
    // Scripts de integração imprimem o resultado no terminal; o código de produção não.
    files: ['packages/*/test-support/**/*.ts', 'scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['packages/database/drizzle.config.ts'],
    rules: {
      'no-restricted-exports': 'off',
      'no-restricted-syntax': 'off',
    },
  },
);
