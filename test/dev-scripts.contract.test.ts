// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { hasKnownSymbolFilters } from '../packages/market-data-crypto/src/symbol-filters.constant.js';

const REPOSITORY_ROOT: string = new URL('../', import.meta.url).pathname;
const SCRIPT_FILES: string[] = [
  'scripts/dev-lib.sh',
  'scripts/dev-up.sh',
  'scripts/dev-down.sh',
  'scripts/dev-lib.ps1',
  'scripts/dev-up.ps1',
  'scripts/dev-down.ps1',
];
const DEFAULT_SYMBOLS_PATTERN = /DevDefaultSymbols = '([^']+)'|DEV_DEFAULT_SYMBOLS='([^']+)'/;
const SECRET_NAME_PATTERN = /PASSWORD|SECRET|TOKEN|DATABASE_URL/;
const DUMPING_COMMAND_PATTERN =
  /printenv|\benv\s*\||set -x|Get-ChildItem\s+Env:|\$env:\s*\||gci\s+env:/;

function readRepositoryFile(relativePath: string): string {
  return readFileSync(`${REPOSITORY_ROOT}${relativePath}`, 'utf8');
}

function readDefaultSymbols(relativePath: string): string {
  const match = DEFAULT_SYMBOLS_PATTERN.exec(readRepositoryFile(relativePath));
  return match?.[1] ?? match?.[2] ?? '';
}

describe('scripts de ambiente local (dev-up e dev-down)', () => {
  test('.dev/ está no .gitignore: logs e pids nunca vão para o commit', () => {
    const lines = readRepositoryFile('.gitignore').split('\n');
    expect(lines).toContain('.dev/');
  });

  test('a lista padrão de moedas é a mesma em bash e PowerShell e todas têm filtro conhecido', () => {
    const bashSymbols = readDefaultSymbols('scripts/dev-lib.sh');
    expect(bashSymbols).not.toBe('');
    expect(readDefaultSymbols('scripts/dev-lib.ps1')).toBe(bashSymbols);
    for (const symbol of bashSymbols.split(',')) {
      expect(hasKnownSymbolFilters(symbol)).toBe(true);
    }
  });

  test.each(SCRIPT_FILES)('%s não nomeia segredo nem despeja o ambiente', (relativePath) => {
    const content = readRepositoryFile(relativePath);
    expect(content).not.toMatch(SECRET_NAME_PATTERN);
    expect(content).not.toMatch(DUMPING_COMMAND_PATTERN);
  });

  test.each(['scripts/dev-down.sh', 'scripts/dev-down.ps1'])(
    '%s para por pid registrado, nunca por nome de processo, e não apaga volumes',
    (relativePath) => {
      const content = readRepositoryFile(relativePath);
      expect(content).not.toMatch(
        /pkill|killall|Get-Process\s+(-Name|bun|node)|Stop-Process\s+-Name/,
      );
      expect(content).not.toMatch(/--volumes|\s-v\b/);
    },
  );
});
