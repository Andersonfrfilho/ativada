// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

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

type BashRun = { readonly exitCode: number; readonly output: string };

function runBash(script: string, extraPath = ''): BashRun {
  const result = Bun.spawnSync(['bash', '-c', script], {
    cwd: REPOSITORY_ROOT,
    env: { PATH: `${extraPath}${extraPath === '' ? '' : ':'}/usr/bin:/bin`, HOME: '/tmp' },
  });
  return {
    exitCode: result.exitCode,
    output: `${result.stdout.toString()}${result.stderr.toString()}`,
  };
}

describe('dev-lib.sh: Windows e leitura do env', () => {
  test('recusa rodar no Git Bash/MSYS/Cygwin e aponta o .ps1', () => {
    const directory = mkdtempSync(`${tmpdir()}/fake-uname-`);
    try {
      for (const kernel of ['MINGW64_NT-10.0', 'MSYS_NT-10.0', 'CYGWIN_NT-10.0']) {
        writeFileSync(`${directory}/uname`, `#!/bin/sh\necho ${kernel}\n`, { mode: 0o755 });
        const run = runBash('bash scripts/dev-up.sh --dry-run', directory);
        expect(run.exitCode).toBe(1);
        expect(run.output).toContain('pwsh scripts/dev-up.ps1');
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test('o env é lido linha a linha, sem executar nada: o $ da senha fica literal e aspas, CRLF e comentário valem', () => {
    const directory = mkdtempSync(`${tmpdir()}/env-file-`);
    try {
      const file = `${directory}/env.dev`;
      writeFileSync(
        file,
        [
          '# PLAIN=nao',
          'PLAIN=a$b${c}$(echo x)',
          "QUOTED='p$w d'",
          'DOUBLE="q$z"',
          'SPACED = ignorada',
          'LAST=ultimo\r',
        ].join('\n'),
      );
      const run = runBash(
        `. scripts/dev-lib.sh; dev_read_environment_file ${file}; printf '%s|%s|%s|%s|%s' "$PLAIN" "$QUOTED" "$DOUBLE" "\${SPACED:-vazio}" "$LAST"`,
      );
      expect(run.exitCode).toBe(0);
      expect(run.output).toBe('a$b${c}$(echo x)|p$w d|q$z|vazio|ultimo');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test('dev-lib.sh não carrega o env com source', () => {
    expect(readRepositoryFile('scripts/dev-lib.sh')).not.toMatch(/^\s*\.\s+"?\$DEV_ENV_FILE/m);
  });
});

describe('dev-lib.ps1: encerramento gracioso antes da força', () => {
  test('tenta o taskkill sem /F, espera ~10 s e só então usa /F', () => {
    const content = readRepositoryFile('scripts/dev-lib.ps1');
    const graceful = content.indexOf('taskkill /PID $ProcessId /T *>');
    const wait = content.indexOf(
      'Wait-Process -Id $ProcessId -Timeout $script:DevGracefulStopSeconds',
    );
    const forced = content.indexOf('taskkill /PID $ProcessId /T /F');
    expect(graceful).toBeGreaterThan(-1);
    expect(wait).toBeGreaterThan(graceful);
    expect(forced).toBeGreaterThan(wait);
    expect(content).toContain('$script:DevGracefulStopSeconds = 10');
  });
});
