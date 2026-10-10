// Copyright (c) 2026 Ada Technology. All rights reserved.
import { rm } from 'node:fs/promises';

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ESLint, type Linter } from 'eslint';

const REPOSITORY_ROOT: string = new URL('../', import.meta.url).pathname;
const COPYRIGHT_LINE = '// Copyright (c) 2026 Ada Technology. All rights reserved.';
const LINT_TIMEOUT_MILLISECONDS = 120_000;
const ERROR_SEVERITY = 2;
const PROBE_PREFIX = 'lint-size-probe-';
const SOURCE_DIRECTORY = 'packages/market-data/src';
const EXEMPT_DIRECTORIES = ['packages/market-data/test-support', 'test'] as const;
const MAX_FUNCTION_LINES = 40;
const MAX_FILE_LINES = 200;
const MAX_PARAMETERS = 3;
const FUNCTION_RULE = 'max-lines-per-function';
const FILE_RULE = 'max-lines';
const PARAMETERS_RULE = 'max-params';
const SIZE_RULES: readonly string[] = [FUNCTION_RULE, FILE_RULE, PARAMETERS_RULE];

type ProbeCase = {
  readonly name: string;
  readonly body: string;
  readonly directory?: string;
  readonly expectedRule: string | undefined;
};

// Cabeçalho + `let` + retorno + chave final somam 4 linhas além das instruções do meio.
function buildFunctionOfLines(totalLines: number): string {
  const middle = Array.from({ length: totalLines - 4 }, () => '  total += 1;').join('\n');
  return `export function probeSize(): number {\n  let total = 0;\n${middle}\n  return total;\n}`;
}

function buildFileOfLines(codeLines: number): string {
  return Array.from(
    { length: codeLines },
    (_unused, index) => `export const PROBE_${index} = 1;`,
  ).join('\n');
}

const FOUR_PARAMETERS =
  'export function probeParameters(a: string, b: string, c: string, d: string): string {\n  return a + b + c + d;\n}';
const THREE_PARAMETERS =
  'export function probeParameters(a: string, b: string, c: string): string {\n  return a + b + c;\n}';

const PROBE_CASES: readonly ProbeCase[] = [
  {
    name: 'function-over-limit',
    body: buildFunctionOfLines(MAX_FUNCTION_LINES + 1),
    expectedRule: FUNCTION_RULE,
  },
  {
    name: 'function-at-limit',
    body: buildFunctionOfLines(MAX_FUNCTION_LINES),
    expectedRule: undefined,
  },
  { name: 'file-over-limit', body: buildFileOfLines(MAX_FILE_LINES + 1), expectedRule: FILE_RULE },
  { name: 'file-at-limit', body: buildFileOfLines(MAX_FILE_LINES), expectedRule: undefined },
  {
    name: 'file-comments-and-blanks-ignored',
    body: `${buildFileOfLines(MAX_FILE_LINES)}\n\n${Array.from({ length: 50 }, () => '// comentário').join('\n')}`,
    expectedRule: undefined,
  },
  { name: 'four-parameters', body: FOUR_PARAMETERS, expectedRule: PARAMETERS_RULE },
  { name: 'three-parameters', body: THREE_PARAMETERS, expectedRule: undefined },
  {
    name: 'inline-disable-ignored',
    body: `/* eslint-disable max-params */\n${FOUR_PARAMETERS}`,
    expectedRule: PARAMETERS_RULE,
  },
  ...EXEMPT_DIRECTORIES.map((directory) => ({
    name: `exempt-${directory.replaceAll('/', '-')}`,
    directory,
    body: `${buildFunctionOfLines(MAX_FUNCTION_LINES + 10)}\n${FOUR_PARAMETERS.replace('probeParameters', 'probeMany')}`,
    expectedRule: undefined,
  })),
];

const LOOSENED_RULES: Linter.RulesRecord = {
  [FUNCTION_RULE]: [
    'error',
    { max: MAX_FUNCTION_LINES + 20, skipBlankLines: true, skipComments: true },
  ],
  [FILE_RULE]: ['error', { max: MAX_FILE_LINES + 20, skipBlankLines: true, skipComments: true }],
  [PARAMETERS_RULE]: ['error', MAX_PARAMETERS + 1],
};

function buildProbePath(probeCase: ProbeCase): string {
  return `${probeCase.directory ?? SOURCE_DIRECTORY}/${PROBE_PREFIX}${probeCase.name}.ts`;
}

async function writeProbes(): Promise<void> {
  await Promise.all(
    PROBE_CASES.map((probeCase) =>
      Bun.write(
        `${REPOSITORY_ROOT}${buildProbePath(probeCase)}`,
        `${COPYRIGHT_LINE}\n${probeCase.body}\n`,
      ),
    ),
  );
}

async function removeProbes(): Promise<void> {
  await Promise.all(
    PROBE_CASES.map((probeCase) =>
      rm(`${REPOSITORY_ROOT}${buildProbePath(probeCase)}`, { force: true }),
    ),
  );
}

async function lintProbes(eslint: ESLint): Promise<Map<string, readonly string[]>> {
  const rulesByProbe = new Map<string, readonly string[]>();
  for (const result of await eslint.lintFiles(PROBE_CASES.map(buildProbePath))) {
    const sizeRules = result.messages
      .filter((message) => message.severity === ERROR_SEVERITY)
      .map((message) => message.ruleId ?? 'fatal')
      .filter((ruleId) => SIZE_RULES.includes(ruleId) || ruleId === 'fatal');
    rulesByProbe.set(result.filePath, [...new Set(sizeRules)].sort());
  }
  return rulesByProbe;
}

let strictRules = new Map<string, readonly string[]>();
let loosenedRules = new Map<string, readonly string[]>();

function readRules(
  rulesByProbe: Map<string, readonly string[]>,
  probeCase: ProbeCase,
): readonly string[] | undefined {
  return rulesByProbe.get(`${REPOSITORY_ROOT}${buildProbePath(probeCase)}`);
}

describe('code size limits (lint)', () => {
  beforeAll(async () => {
    await writeProbes();
    try {
      strictRules = await lintProbes(new ESLint({ cwd: REPOSITORY_ROOT }));
      const loosened = new ESLint({
        cwd: REPOSITORY_ROOT,
        overrideConfig: [{ files: [`${SOURCE_DIRECTORY}/**/*.ts`], rules: LOOSENED_RULES }],
      });
      loosenedRules = await lintProbes(loosened);
    } finally {
      await removeProbes();
    }
  }, LINT_TIMEOUT_MILLISECONDS);

  afterAll(removeProbes);

  test.each(PROBE_CASES.map((probeCase) => [probeCase.name, probeCase] as const))(
    'probe %s',
    (_name, probeCase) => {
      const expected = probeCase.expectedRule === undefined ? [] : [probeCase.expectedRule];
      expect(readRules(strictRules, probeCase)).toStrictEqual(expected);
    },
  );

  // Mutação: com o limite afrouxado a sonda passa, então a sonda mede mesmo aquela regra.
  test.each(
    PROBE_CASES.filter((probeCase) => probeCase.expectedRule !== undefined).map(
      (probeCase) => [probeCase.name, probeCase] as const,
    ),
  )('mutation: loosening the limit makes probe %s pass', (_name, probeCase) => {
    expect(readRules(loosenedRules, probeCase)).toStrictEqual([]);
  });
});
