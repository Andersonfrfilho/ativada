// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { WalkForwardOutcome } from '../apps/api-cryptoada/src/walk-forward/walk-forward.types.js';
import { createEngine } from '../packages/strategy-engine/src/index.js';
import { DAY_MILLISECONDS } from './fixtures/walk-forward/daily-candles.fixture.js';
import { loadWalkForwardApp } from './fixtures/walk-forward/walk-forward-app.fixture.js';
import {
  buildWalkForwardScenario,
  SCENARIO_END,
  SCENARIO_GRID,
  type ScenarioParams,
} from './fixtures/walk-forward/walk-forward-scenarios.fixture.js';

const { runWalkForward } = (await loadWalkForwardApp()).run;

const TIMEOUT_MILLISECONDS = 120_000;

function errorCodeOf(outcome: WalkForwardOutcome): string | undefined {
  return outcome.status === 'failed' ? outcome.errorCode : undefined;
}

async function expectFailure(params: {
  readonly scenario?: ScenarioParams;
  readonly options?: Record<string, unknown>;
  readonly code: string;
}): Promise<void> {
  const built = buildWalkForwardScenario(params.scenario ?? {});
  const outcome = await runWalkForward(built.params(params.options ?? {}));
  expect(errorCodeOf(outcome)).toBe(params.code);
  expect(outcome.status === 'failed' && outcome.isRecorded).toBe(true);
  expect(built.memory.state.status).toBe('failed');
  expect(built.memory.state.errorCode).toBe(params.code);
  expect(built.memory.state.windows.size).toBe(0);
  expect(built.memory.state.results.equityPoints.size).toBe(0);
}

describe('walk-forward: falhas tipadas, antes de gravar qualquer janela', () => {
  test('grade fora do catálogo: INVALID_GRID', async () => {
    await expectFailure({
      options: { grid: { parameters: [{ path: 'schemaVersion', values: [1] }] } },
      code: 'INVALID_GRID',
    });
    await expectFailure({
      options: { grid: { parameters: [{ path: 'rules.fantasma.period', values: [9] }] } },
      code: 'INVALID_GRID',
    });
  });

  test('grade acima do teto de 200 combinações VÁLIDAS: GRID_TOO_LARGE, com a contagem', async () => {
    const values = Array.from({ length: 21 }, (_unused, index) => index + 2);
    const built = buildWalkForwardScenario();
    const outcome = await runWalkForward(
      built.params({
        grid: {
          parameters: [
            { path: 'rules.ema-cross.fastPeriod', values },
            { path: 'rules.ema-cross.slowPeriod', values },
          ],
        },
      }),
    );
    expect(errorCodeOf(outcome)).toBe('GRID_TOO_LARGE');
    expect(outcome.status === 'failed' && outcome.message).toContain('validCombinations=210');
    expect(built.memory.state.errorCode).toBe('GRID_TOO_LARGE');
  });

  test('nenhuma combinação válida: NO_VALID_COMBINATIONS', async () => {
    await expectFailure({
      options: {
        grid: {
          parameters: [
            { path: 'rules.ema-cross.fastPeriod', values: [40] },
            { path: 'rules.ema-cross.slowPeriod', values: [10] },
          ],
        },
      },
      code: 'NO_VALID_COMBINATIONS',
    });
  });

  test('passo menor que o teste e pedido malformado: INVALID_WINDOW_CONFIG', async () => {
    await expectFailure({ options: { stepMonths: 1 }, code: 'INVALID_WINDOW_CONFIG' });
    await expectFailure({ options: { trainMonths: 0 }, code: 'INVALID_WINDOW_CONFIG' });
  });

  test('período que não comporta três janelas: PERIOD_TOO_SHORT', async () => {
    await expectFailure({
      scenario: { periodEnd: SCENARIO_END - 90 * DAY_MILLISECONDS },
      code: 'PERIOD_TOO_SHORT',
    });
  });

  test('sem candle no período: NO_CANDLES; aquecimento curto: INSUFFICIENT_HISTORY', async () => {
    await expectFailure({ scenario: { candleCount: 100 }, code: 'NO_CANDLES' });
    await expectFailure({ scenario: { warmUpDays: 20 }, code: 'INSUFFICIENT_HISTORY' });
  });

  test('execução inexistente, de outro tipo ou adulterada', async () => {
    const built = buildWalkForwardScenario();
    const absent = await runWalkForward({ ...built.params(), runId: crypto.randomUUID() });
    expect(errorCodeOf(absent)).toBe('RUN_NOT_FOUND');
    expect(absent.status === 'failed' && absent.isRecorded).toBe(false);
    await expectFailure({ scenario: { kind: 'backtest' }, code: 'RUN_KIND_UNSUPPORTED' });
    await expectFailure({ scenario: { tamper: 'run_hash' }, code: 'HASH_MISMATCH' });
    await expectFailure({ scenario: { tamper: 'config_hash' }, code: 'HASH_MISMATCH' });
  });

  test(
    'retomar com OUTRO pedido é recusado: o checkpoint é do pedido original',
    async () => {
      const hooks = { failAtCommit: 4, isFailureUnrecordable: true };
      const crashed = buildWalkForwardScenario({ hooks });
      await runWalkForward(crashed.params());
      expect(crashed.memory.state.status).toBe('running');
      hooks.isFailureUnrecordable = false;
      const other = await runWalkForward(
        crashed.params({
          grid: { parameters: [{ path: 'thresholds.buy', values: ['1', '2'] }] },
        }),
      );
      expect(errorCodeOf(other)).toBe('OPTIONS_MISMATCH');
      expect(crashed.memory.state.status).toBe('failed');
    },
    TIMEOUT_MILLISECONDS,
  );

  test(
    'erro inesperado do motor vira código estável e a mensagem original NUNCA sai',
    async () => {
      const built = buildWalkForwardScenario();
      const engine = createEngine();
      const outcome = await runWalkForward(
        built.params({
          engine: {
            ...engine,
            walletStep: () => {
              throw new Error('postgres://usuario:senha-secreta@host/banco');
            },
          },
        }),
      );
      // o ajuste não usa o `engine` injetado; o teste usa: a falha chega na primeira janela
      expect(errorCodeOf(outcome)).toBe('WALK_FORWARD_UNEXPECTED');
      expect(JSON.stringify(outcome)).not.toContain('senha-secreta');
      expect(built.memory.state.errorCode).toBe('WALK_FORWARD_UNEXPECTED');
      expect(SCENARIO_GRID.parameters.length).toBeGreaterThan(0);
    },
    TIMEOUT_MILLISECONDS,
  );
});
