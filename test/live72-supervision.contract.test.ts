// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fireControlledKillIfDue, isKillDue } from '../scripts/live72/controlled-kill.js';
import { nextCronDelayMilliseconds } from '../scripts/live72/cron-job.js';
import { buildLaunchAgentPlist } from '../scripts/live72/launch-agent.js';
import { parseEvents } from '../scripts/live72/live72-events.js';
import { startTelegramSink } from '../scripts/live72/telegram-sink.js';
import type { RunCounts } from '../scripts/live72/run-counts.js';
import { writeRunFile, type RunFile } from '../scripts/live72/run-file.js';
import {
  computeBackoffMilliseconds,
  nextFailureCount,
  superviseProcess,
} from '../scripts/live72/supervised-process.js';

const directories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'live72-supervision-'));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

const HOUR = 3_600_000;

function runFileAt(start: number): RunFile {
  return {
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
    periodStart: start,
    leadInCandles: 200,
    startedAt: new Date(start).toISOString(),
    plannedEndAt: new Date(start + 72 * HOUR).toISOString(),
    plannedWorkerKillAt: new Date(start + 36 * HOUR).toISOString(),
  };
}

describe('live72: espera entre reinícios', () => {
  test('cresce em dobro e para no teto de 1 minuto', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 20].map(computeBackoffMilliseconds)).toEqual([
      0, 2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000,
    ]);
  });

  test('processo que viveu 5 min ou foi morto de propósito zera a contagem', () => {
    expect(nextFailureCount({ previous: 4, uptimeMilliseconds: 1_000, isControlled: false })).toBe(
      5,
    );
    expect(
      nextFailureCount({ previous: 4, uptimeMilliseconds: 300_000, isControlled: false }),
    ).toBe(0);
    expect(nextFailureCount({ previous: 4, uptimeMilliseconds: 1_000, isControlled: true })).toBe(
      0,
    );
  });

  test('o cron repete em 6 h quando deu certo e em 10 min quando falhou', () => {
    expect(nextCronDelayMilliseconds(0)).toBe(6 * HOUR);
    expect(nextCronDelayMilliseconds(1)).toBe(600_000);
  });
});

describe('live72: LaunchAgent', () => {
  const params = {
    bunPath: '/Users/x/.bun/bin/bun',
    envFile: '/repo/envs/env.live72',
    supervisorScript: '/repo/scripts/live72/supervisor.ts',
    workingDirectory: '/repo & co',
    logsDirectory: '/home/x/.ativada-live72/logs',
    home: '/home/x',
  };

  test('tem o rótulo autorizado, KeepAlive, RunAtLoad e o caffeinate -dimsu antes do bun', () => {
    const plist = buildLaunchAgentPlist(params);
    expect(plist).toContain('<string>com.adatechnology.ativada-live72</string>');
    expect(plist).toContain('<key>KeepAlive</key>\n  <true/>');
    expect(plist).toContain('<key>RunAtLoad</key>\n  <true/>');
    const caffeinate = plist.indexOf('<string>/usr/bin/caffeinate</string>');
    const flags = plist.indexOf('<string>-dimsu</string>');
    const bun = plist.indexOf('<string>/Users/x/.bun/bin/bun</string>');
    expect(caffeinate).toBeGreaterThan(0);
    expect(flags).toBeGreaterThan(caffeinate);
    expect(bun).toBeGreaterThan(flags);
    expect(plist).toContain('<string>--env-file=/repo/envs/env.live72</string>');
  });

  test('escapa caracteres de XML nos caminhos', () => {
    expect(buildLaunchAgentPlist(params)).toContain('/repo &amp; co');
  });

  test('não carrega a senha nem o ambiente da simulação, só PATH e HOME', () => {
    const plist = buildLaunchAgentPlist(params);
    expect(plist).not.toContain('PASSWORD');
    expect(plist.match(/<key>[A-Z_]+<\/key>/g)).toEqual(['<key>PATH</key>', '<key>HOME</key>']);
  });
});

describe('live72: reinício controlado do worker', () => {
  // O início fica no passado real: o evento gravado leva a hora de agora e precisa cair depois dele.
  const PAST_START = Date.now() - 100 * HOUR;

  test('só dispara dentro da janela entre o horário marcado e o fim, uma vez', () => {
    const base = { plannedAt: 100, plannedEnd: 200, isAlreadyFired: false };
    expect(isKillDue({ ...base, now: 99 })).toBe(false);
    expect(isKillDue({ ...base, now: 100 })).toBe(true);
    expect(isKillDue({ ...base, now: 199 })).toBe(true);
    expect(isKillDue({ ...base, now: 200 })).toBe(false);
    expect(isKillDue({ ...base, now: 150, isAlreadyFired: true })).toBe(false);
  });

  function setup(now: number): {
    options: Parameters<typeof fireControlledKillIfDue>[0];
    kills: { count: number };
    eventsFile: string;
  } {
    const directory = temporaryDirectory();
    const runFile = join(directory, 'run.json');
    const eventsFile = join(directory, 'events.jsonl');
    writeRunFile(runFile, runFileAt(PAST_START));
    const kills = { count: 0 };
    const options = {
      runFile,
      eventsFile,
      worker: {
        killControlled: (): boolean => {
          kills.count += 1;
          return true;
        },
      },
      readCounts: (): Promise<RunCounts> =>
        Promise.resolve({
          signals: 5,
          orders: 1,
          fills: 1,
          positions: 1,
          equityPoints: 5,
          alerts: 2,
          lastCandleTime: 9,
        }),
      now: (): number => now,
    };
    return { options, kills, eventsFile };
  }

  test('antes das 36 h não mata nada e nada é registrado', async () => {
    const { options, kills, eventsFile } = setup(PAST_START + 35 * HOUR);
    expect(await fireControlledKillIfDue(options)).toBe(false);
    expect(kills.count).toBe(0);
    expect(() => readFileSync(eventsFile, 'utf8')).toThrow();
  });

  test('às 36 h mata o worker UMA vez e grava a hora e a contagem de antes', async () => {
    const { options, kills, eventsFile } = setup(PAST_START + 36 * HOUR + 5_000);
    expect(await fireControlledKillIfDue(options)).toBe(true);
    expect(await fireControlledKillIfDue(options)).toBe(false);
    expect(kills.count).toBe(1);
    const events = parseEvents(readFileSync(eventsFile, 'utf8')).events;
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('controlled_worker_kill');
    expect(events[0]?.['before']).toMatchObject({ signals: 5, alerts: 2 });
  });

  test('worker fora do ar na hora marcada: nada é registrado e tenta de novo', async () => {
    const { options, eventsFile } = setup(PAST_START + 37 * HOUR);
    const idle = { ...options, worker: { killControlled: (): boolean => false } };
    expect(await fireControlledKillIfDue(idle)).toBe(false);
    expect(() => readFileSync(eventsFile, 'utf8')).toThrow();
    expect(await fireControlledKillIfDue(options)).toBe(true);
  });

  test('depois do término previsto não dispara', async () => {
    const { options, kills } = setup(PAST_START + 80 * HOUR);
    expect(await fireControlledKillIfDue(options)).toBe(false);
    expect(kills.count).toBe(0);
  });

  test('banco indisponível não impede o reinício: a contagem de antes fica nula', async () => {
    const { options, eventsFile } = setup(PAST_START + 40 * HOUR);
    const broken = {
      ...options,
      readCounts: (): Promise<RunCounts> => Promise.reject(new Error('banco fora')),
    };
    expect(await fireControlledKillIfDue(broken)).toBe(true);
    expect(parseEvents(readFileSync(eventsFile, 'utf8')).events[0]?.['before']).toBeNull();
  });
});

async function waitFor(check: () => boolean, milliseconds: number): Promise<void> {
  const deadline = Date.now() + milliseconds;
  while (!check() && Date.now() < deadline) await Bun.sleep(25);
}

describe('live72: processo supervisionado', () => {
  function supervise(command: string[]): {
    process: ReturnType<typeof superviseProcess>;
    events: () => ReturnType<typeof parseEvents>['events'];
  } {
    const directory = temporaryDirectory();
    const eventsFile = join(directory, 'events.jsonl');
    const supervised = superviseProcess({
      name: 'probe',
      command,
      cwd: directory,
      env: {},
      log: { write: (): void => undefined },
      eventsFile,
      pidFile: join(directory, 'probe.pid'),
      waitForInfra: () => Promise.resolve(),
    });
    const events = (): ReturnType<typeof parseEvents>['events'] => {
      try {
        return parseEvents(readFileSync(eventsFile, 'utf8')).events;
      } catch {
        return [];
      }
    };
    return { process: supervised, events };
  }

  test('SIGKILL controlado registra a saída como controlada e sobe o processo de novo na hora', async () => {
    const { process: supervised, events } = supervise(['/bin/sleep', '30']);
    await waitFor(() => events().some((event) => event.type === 'child_start'), 3_000);
    expect(supervised.killControlled()).toBe(true);
    await waitFor(
      () => events().filter((event) => event.type === 'child_start').length === 2,
      3_000,
    );
    await supervised.stop();
    const exits = events().filter((event) => event.type === 'child_exit');
    expect(exits[0]).toMatchObject({ child: 'probe', signal: 'SIGKILL', controlled: true });
    expect(events().filter((event) => event.type === 'child_start')).toHaveLength(2);
  });

  test('processo que cai sozinho é registrado e reiniciado depois da espera', async () => {
    const { process: supervised, events } = supervise(['/bin/sh', '-c', 'exit 3']);
    await waitFor(
      () => events().filter((event) => event.type === 'child_start').length === 2,
      5_000,
    );
    await supervised.stop();
    const first = events().find((event) => event.type === 'child_exit');
    expect(first).toMatchObject({ exitCode: 3, controlled: false });
    expect(events().filter((event) => event.type === 'child_start').length).toBeGreaterThanOrEqual(
      2,
    );
  }, 10_000);

  test('stop() encerra o processo e o laço, sem reiniciar', async () => {
    const { process: supervised, events } = supervise(['/bin/sleep', '30']);
    await waitFor(() => events().some((event) => event.type === 'child_start'), 3_000);
    await supervised.stop();
    const starts = events().filter((event) => event.type === 'child_start').length;
    await Bun.sleep(300);
    expect(events().filter((event) => event.type === 'child_start')).toHaveLength(starts);
    expect(
      events().some((event) => event.type === 'child_exit' && event['stopping'] === true),
    ).toBe(true);
  });

  test('o reinício controlado agendado mata o processo real, registra a hora e ele volta sozinho', async () => {
    const { process: supervised, events } = supervise(['/bin/sleep', '30']);
    await waitFor(() => events().some((event) => event.type === 'child_start'), 3_000);
    const directory = temporaryDirectory();
    const runFile = join(directory, 'run.json');
    const start = Date.now() - 37 * HOUR;
    writeRunFile(runFile, runFileAt(start));
    const eventsFile = join(directory, 'events.jsonl');
    const fired = await fireControlledKillIfDue({
      runFile,
      eventsFile,
      worker: supervised,
      readCounts: (): Promise<RunCounts> =>
        Promise.resolve({
          signals: 1,
          orders: 0,
          fills: 0,
          positions: 0,
          equityPoints: 1,
          alerts: 0,
          lastCandleTime: 1,
        }),
    });
    expect(fired).toBe(true);
    await waitFor(
      () => events().filter((event) => event.type === 'child_start').length === 2,
      3_000,
    );
    await supervised.stop();
    expect(events().find((event) => event.type === 'child_exit')).toMatchObject({
      signal: 'SIGKILL',
      controlled: true,
    });
    expect(parseEvents(readFileSync(eventsFile, 'utf8')).events[0]?.type).toBe(
      'controlled_worker_kill',
    );
  });

  test('killControlled sem processo vivo devolve falso', async () => {
    const { process: supervised } = supervise(['/bin/sh', '-c', 'exit 0']);
    await Bun.sleep(300);
    expect(supervised.killControlled()).toBe(false);
    await supervised.stop();
  });
});

describe('live72: sumidouro do Telegram', () => {
  test('aceita o envio, devolve ok e não repete o corpo nem a rota no stdout', async () => {
    const lines: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array): boolean => {
      lines.push(String(chunk));
      return true;
    };
    const port = 56990 + Math.floor(Math.random() * 9);
    const sink = startTelegramSink(`http://127.0.0.1:${port}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/botSEGREDO/sendMessage`, {
        method: 'POST',
        body: JSON.stringify({ chat_id: 4242, text: 'conteúdo privado' }),
      });
      expect(await response.json()).toMatchObject({ ok: true });
    } finally {
      process.stdout.write = original;
      await sink.stop();
    }
    const written = lines.join('');
    expect(written).toContain('telegram_sink.delivered');
    expect(written).not.toContain('SEGREDO');
    expect(written).not.toContain('4242');
    expect(written).not.toContain('conteúdo privado');
  });
});
