// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { isOwnedCommand } from '../scripts/live72/process-state.js';
import {
  formatDuration,
  formatStatus,
  parseDfAvailableKilobytes,
  parsePid,
  type StatusFacts,
} from '../scripts/live72/status-format.js';

const HOUR = 3_600_000;
const START = Date.parse('2026-10-12T14:20:00.000Z');

const FACTS: StatusFacts = {
  now: START + 10 * HOUR + 5 * 60_000,
  run: {
    runId: 'run-1',
    userId: 'user-1',
    goalId: 'goal-1',
    strategyName: 'Placar clássico',
    strategyVersionId: 'version-1',
    strategyVersion: 1,
    configHash: 'abc',
    symbol: 'BTCUSDT',
    timeframe: '1h',
    initialBalance: '10000',
    periodStart: START - 20 * 60_000,
    leadInCandles: 200,
    startedAt: new Date(START).toISOString(),
    plannedEndAt: new Date(START + 72 * HOUR).toISOString(),
    plannedWorkerKillAt: new Date(START + 36 * HOUR).toISOString(),
  },
  runStatus: 'running',
  isWaitingForData: false,
  counts: {
    signals: 10,
    orders: 2,
    fills: 2,
    positions: 1,
    equityPoints: 10,
    alerts: 1,
    lastCandleTime: START + 9 * HOUR,
  },
  evaluatedCandles: 10,
  equity: '10123.45',
  openPosition: 'aberta, 0.1 a 60000',
  alertsByStatus: { sent: 1 },
  events: {
    supervisorStarts: 1,
    supervisorStops: 0,
    childExits: { api: 2 },
    controlledKill: undefined,
    interventions: [],
    cronRuns: 2,
    cronFailures: 0,
  },
  processes: [
    { name: 'supervisor', pid: 10, isAlive: true },
    { name: 'worker', pid: null, isAlive: false },
  ],
  isApiHealthy: true,
  tickerAgeSeconds: 0.8,
  databaseBytes: 52_428_800,
  diskFreeKilobytes: 5 * 1024 * 1024,
};

describe('live72: status em texto', () => {
  test('traz tudo o que o responsável pediu, em linhas curtas', () => {
    const text = formatStatus(FACTS);
    expect(text).toContain('Tempo: 10 h 05 min');
    expect(text).toContain('faltam 61 h 55 min');
    expect(text).toContain('esperando dados (waitingForData): não');
    expect(text).toContain('Candles: 10 avaliados; último candle 2026-10-12T23:20:00.000Z');
    expect(text).toContain('Sinais 10; ordens 2; preenchimentos 2');
    expect(text).toContain('Posição: aberta, 0.1 a 60000; patrimônio 10123.45');
    expect(text).toContain('Alertas gerados 1 (caixa de saída: {"sent":1})');
    expect(text).toContain('api 2');
    expect(text).toContain('reinício controlado do worker: ainda não');
    expect(text).toContain('worker PARADO');
    expect(text).toContain('supervisor ok (pid 10)');
    expect(text).toContain('API responde');
    expect(text).toContain('último tick há 0.8 s');
    expect(text).toContain('banco 50 MB; disco 5.0 GB livres');
    expect(text.trim().split('\n').length).toBeLessThanOrEqual(12);
  });

  test('sem simulação o status diz como começar, sem inventar números', () => {
    const text = formatStatus({
      ...FACTS,
      run: undefined,
      counts: null,
      events: null,
      runStatus: null,
      tickerAgeSeconds: null,
      databaseBytes: null,
      diskFreeKilobytes: null,
      isApiHealthy: false,
    });
    expect(text).toContain('make live72-start');
    expect(text).toContain('API NÃO responde');
    expect(text).toContain('sem tick recebido');
    expect(text).toContain('n/d');
  });

  test('depois das 72 h avisa que o prazo foi cumprido', () => {
    const text = formatStatus({ ...FACTS, now: START + 80 * HOUR });
    expect(text).toContain('prazo de 72 h cumprido');
  });

  test('reinício controlado feito aparece com a hora', () => {
    const at = new Date(START + 36 * HOUR).toISOString();
    const events = {
      ...(FACTS.events ?? {
        supervisorStarts: 1,
        supervisorStops: 0,
        childExits: {},
        interventions: [],
        cronRuns: 0,
        cronFailures: 0,
      }),
      controlledKill: { at, before: null },
    };
    expect(formatStatus({ ...FACTS, events })).toContain(`feito em ${at}`);
  });
});

describe('live72: leitura de pid, df e duração', () => {
  test('pid só aceita inteiro puro', () => {
    expect(parsePid('1234\n')).toBe(1234);
    expect(parsePid('12 34')).toBeNull();
    expect(parsePid('abc')).toBeNull();
    expect(parsePid('')).toBeNull();
    expect(parsePid('-5')).toBeNull();
  });

  test('df -k: coluna Available da última linha', () => {
    const output = [
      'Filesystem   1024-blocks      Used Available Capacity iused ifree %iused  Mounted on',
      '/dev/disk3s5   482797652 301234567 150000000    67% 1 2 3% /System/Volumes/Data',
    ].join('\n');
    expect(parseDfAvailableKilobytes(output)).toBe(150000000);
    expect(parseDfAvailableKilobytes('')).toBeNull();
    expect(parseDfAvailableKilobytes('só uma linha')).toBeNull();
  });

  test('duração em horas e minutos, sem negativo', () => {
    expect(formatDuration(0)).toBe('0 h 00 min');
    expect(formatDuration(90 * 60_000)).toBe('1 h 30 min');
    expect(formatDuration(-5)).toBe('0 h 00 min');
    expect(formatDuration(71 * HOUR + 59 * 60_000)).toBe('71 h 59 min');
  });
});

describe('live72: pid reaproveitado pelo sistema', () => {
  const root = '/Users/x/repo';

  test('só é nosso o processo bun que roda arquivo deste repositório', () => {
    expect(
      isOwnedCommand('/Users/x/.bun/bin/bun run /Users/x/repo/apps/api-ativada/src/main.ts', root),
    ).toBe(true);
    expect(
      isOwnedCommand(
        '/usr/bin/caffeinate -dimsu /bin/bun run /Users/x/repo/scripts/live72/supervisor.ts',
        root,
      ),
    ).toBe(true);
    expect(isOwnedCommand('/Applications/Safari.app/Contents/MacOS/Safari', root)).toBe(false);
    expect(isOwnedCommand('/Users/x/.bun/bin/bun run /Users/x/other/server.ts', root)).toBe(false);
    expect(isOwnedCommand('', root)).toBe(false);
  });
});
