// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  appendEvent,
  parseEvents,
  recordCliCommand,
  summarizeEvents,
} from '../scripts/live72/live72-events.js';
import { aggregateLogErrors, mergeLogErrors } from '../scripts/live72/log-errors.js';
import { createRotatingLog, shouldRotate } from '../scripts/live72/rotating-log.js';

const SINCE = '2026-10-12T14:20:00.000Z';

function line(at: string, type: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ at, type, ...extra });
}

describe('live72: events.jsonl', () => {
  test('linha corrompida ou sem campo obrigatório é contada, não derruba a leitura', () => {
    const text = [line(SINCE, 'supervisor_start'), '{quebrado', '{"type":"x"}', ''].join('\n');
    const parsed = parseEvents(text);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.invalidLines).toBe(2);
  });

  test('resumo conta só o que veio depois do início da simulação', () => {
    const before = '2026-10-12T13:00:00.000Z';
    const during = '2026-10-13T00:00:00.000Z';
    const text = [
      line(before, 'supervisor_start'),
      line(before, 'cli_command', { command: 'up', isMutating: true }),
      line(during, 'supervisor_start'),
      line(during, 'child_exit', { child: 'worker', controlled: true }),
      line(during, 'child_exit', { child: 'api' }),
      line(during, 'child_exit', { child: 'worker' }),
      line(during, 'cli_command', { command: 'status', isMutating: false }),
      line(during, 'cli_command', { command: 'stop', isMutating: true }),
      line(during, 'cron_run', { exitCode: 0 }),
      line(during, 'cron_run', { exitCode: 1 }),
    ].join('\n');
    const summary = summarizeEvents(parseEvents(text).events, SINCE);
    expect(summary.supervisorStarts).toBe(1);
    expect(summary.childExits).toEqual({ worker: 2, api: 1 });
    expect(summary.interventions).toEqual([{ at: during, command: 'stop' }]);
    expect(summary.cronRuns).toBe(2);
    expect(summary.cronFailures).toBe(1);
    expect(summary.controlledKill).toBeUndefined();
  });

  test('reinício controlado guarda a hora e a contagem de antes', () => {
    const before = {
      signals: 1,
      orders: 0,
      fills: 0,
      positions: 0,
      equityPoints: 1,
      alerts: 0,
      lastCandleTime: 5,
    };
    const text = line('2026-10-14T02:20:00.000Z', 'controlled_worker_kill', { before });
    const kill = summarizeEvents(parseEvents(text).events, SINCE).controlledKill;
    expect(kill?.at).toBe('2026-10-14T02:20:00.000Z');
    expect(kill?.before).toEqual(before);
  });

  test('contagem de antes malformada vira null em vez de enganar o relatório', () => {
    const text = line('2026-10-14T02:20:00.000Z', 'controlled_worker_kill', {
      before: { signals: 'x' },
    });
    expect(summarizeEvents(parseEvents(text).events, SINCE).controlledKill?.before).toBeNull();
  });

  test('appendEvent e recordCliCommand gravam linhas legíveis de volta', () => {
    const directory = mkdtempSync(join(tmpdir(), 'live72-events-'));
    try {
      const path = join(directory, 'nested', 'events.jsonl');
      appendEvent(path, 'supervisor_start', { pid: 7 });
      recordCliCommand(path, 'status');
      recordCliCommand(path, 'stop');
      const events = parseEvents(readFileSync(path, 'utf8')).events;
      expect(events.map((event) => event['isMutating'])).toEqual([undefined, false, true]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('live72: erros dos logs', () => {
  test('conta só erro, por código, sem o texto livre', () => {
    const lines = [
      JSON.stringify({ level: 'info', message: 'ok' }),
      JSON.stringify({ level: 'error', code: 'DB_DOWN', message: 'senha=segredo' }),
      JSON.stringify({ level: 'error', code: 'DB_DOWN' }),
      JSON.stringify({ level: 'error', event: 'ticker.disconnected' }),
      JSON.stringify({ level: 'error', message: 'falha solta' }),
      JSON.stringify({ level: 'error' }),
      'texto que não é JSON',
    ];
    const totals = aggregateLogErrors(lines);
    expect(totals).toEqual({
      DB_DOWN: 2,
      'ticker.disconnected': 1,
      'falha solta': 1,
      sem_codigo: 1,
    });
    expect(JSON.stringify(totals)).not.toContain('segredo');
  });

  test('soma os totais de vários arquivos', () => {
    expect(mergeLogErrors([{ A: 1 }, { A: 2, B: 1 }])).toEqual({ A: 3, B: 1 });
  });
});

describe('live72: rotação do log', () => {
  test('só gira quando o arquivo já tem conteúdo e o próximo pedaço estoura o teto', () => {
    expect(shouldRotate({ currentBytes: 0, incomingBytes: 500, maximumBytes: 100 })).toBe(false);
    expect(shouldRotate({ currentBytes: 60, incomingBytes: 40, maximumBytes: 100 })).toBe(false);
    expect(shouldRotate({ currentBytes: 60, incomingBytes: 41, maximumBytes: 100 })).toBe(true);
  });

  test('mantém no máximo N arquivos e nenhum passa muito do teto', () => {
    const directory = mkdtempSync(join(tmpdir(), 'live72-log-'));
    try {
      const path = join(directory, 'worker.log');
      const log = createRotatingLog({ path, maximumBytes: 100, keptFiles: 3 });
      const chunk = new TextEncoder().encode('x'.repeat(40));
      for (let index = 0; index < 30; index += 1) log.write(chunk);
      for (const name of ['worker.log', 'worker.log.1', 'worker.log.2', 'worker.log.3']) {
        expect(statSync(join(directory, name)).size).toBeLessThanOrEqual(100);
      }
      expect(() => statSync(join(directory, 'worker.log.4'))).toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test('retoma o tamanho de um arquivo que já existe', () => {
    const directory = mkdtempSync(join(tmpdir(), 'live72-log-'));
    try {
      const path = join(directory, 'api.log');
      writeFileSync(path, 'y'.repeat(90));
      const log = createRotatingLog({ path, maximumBytes: 100, keptFiles: 2 });
      log.write(new TextEncoder().encode('z'.repeat(20)));
      expect(statSync(`${path}.1`).size).toBe(90);
      expect(statSync(path).size).toBe(20);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
