// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { RunWalkForwardParams } from '../apps/api-cryptoada/src/walk-forward/walk-forward.types.js';
import { loadWalkForwardApp } from './fixtures/walk-forward/walk-forward-app.fixture.js';
import {
  buildWalkForwardScenario,
  SCENARIO_END,
  SCENARIO_GRID,
  SCENARIO_OPTIONS,
} from './fixtures/walk-forward/walk-forward-scenarios.fixture.js';
import { DAY_MILLISECONDS } from './fixtures/walk-forward/daily-candles.fixture.js';

const app = await loadWalkForwardApp();
const { runWalkForward } = app.run;
const { WALK_FORWARD_REQUEST_MESSAGE_SCHEMA } = app.messages;

const TIMEOUT_MILLISECONDS = 120_000;
const COMBINATIONS = 12;
const WINDOWS = 4;
const RUN_ID = '018f0000-0000-7000-8000-0000000000f1';
const NOW = (): number => SCENARIO_END + 400 * DAY_MILLISECONDS;
// Uma grade diferente da gravada: se ela valesse, a busca teria 3 combinações em vez de 12.
const OTHER_GRID = { parameters: [{ path: 'thresholds.buy', values: ['1', '1.5', '2'] }] };

// O pedido vem da LINHA da execução: as opções da chamada não trazem grade nem janelas.
function rowOnlyParams(
  scenario: ReturnType<typeof buildWalkForwardScenario>,
): RunWalkForwardParams {
  return {
    database: scenario.memory.database,
    runId: scenario.memory.runId,
    options: { now: NOW, threads: 1 },
  };
}

async function referenceSnapshot(): Promise<string> {
  const reference = buildWalkForwardScenario({ request: SCENARIO_OPTIONS });
  await runWalkForward(rowOnlyParams(reference));
  return JSON.stringify(reference.memory.snapshot());
}

describe('walk-forward: o pedido mora na linha da execução (runs.request)', () => {
  test(
    'sem grade nas opções, a busca usa a grade e as janelas gravadas na linha',
    async () => {
      const scenario = buildWalkForwardScenario({ request: SCENARIO_OPTIONS });
      const outcome = await runWalkForward(rowOnlyParams(scenario));
      expect(outcome.status).toBe('completed');
      expect(outcome.status === 'completed' && outcome.combinations).toBe(COMBINATIONS);
      expect(outcome.status === 'completed' && outcome.windows).toBe(WINDOWS);
    },
    TIMEOUT_MILLISECONDS,
  );

  test(
    'o pedido gravado vence o das opções: outra grade passada na chamada é ignorada',
    async () => {
      const scenario = buildWalkForwardScenario({ request: SCENARIO_OPTIONS });
      const outcome = await runWalkForward(
        scenario.params({ grid: OTHER_GRID, minTradesPerWindow: 9 }),
      );
      expect(outcome.status).toBe('completed');
      expect(outcome.status === 'completed' && outcome.combinations).toBe(COMBINATIONS);
    },
    TIMEOUT_MILLISECONDS,
  );

  test(
    'queda no meio da busca e retomada usam o MESMO pedido gravado, mesmo se a chamada trouxer outro',
    async () => {
      const reference = await referenceSnapshot();
      const crashed = buildWalkForwardScenario({
        request: SCENARIO_OPTIONS,
        hooks: { failAtCommit: 6, isFailureUnrecordable: true },
      });
      const first = await runWalkForward(rowOnlyParams(crashed));
      expect(first.status).toBe('failed');
      expect(crashed.memory.state.status).toBe('running');
      const resumed = await runWalkForward({
        ...rowOnlyParams(crashed),
        options: { now: NOW, threads: 1, grid: OTHER_GRID },
      });
      expect(resumed.status).toBe('completed');
      expect(JSON.stringify(crashed.memory.snapshot())).toBe(reference);
    },
    TIMEOUT_MILLISECONDS,
  );

  test(
    'queda no meio do TESTE e retomada partem do pedido gravado',
    async () => {
      const reference = await referenceSnapshot();
      const crashed = buildWalkForwardScenario({
        request: SCENARIO_OPTIONS,
        hooks: { failAtCommit: COMBINATIONS + 2, isFailureUnrecordable: true },
      });
      await runWalkForward(rowOnlyParams(crashed));
      expect(crashed.memory.state.windows.size).toBe(1);
      const resumed = await runWalkForward(rowOnlyParams(crashed));
      expect(resumed.status).toBe('completed');
      expect(JSON.stringify(crashed.memory.snapshot())).toBe(reference);
    },
    TIMEOUT_MILLISECONDS,
  );

  test(
    'pedido gravado fora do esquema falha com código estável e fica gravado como failed',
    async () => {
      const scenario = buildWalkForwardScenario({
        request: { grid: SCENARIO_GRID, trainMonths: 0 },
      });
      // As opções trazem uma grade válida: o pedido inválido da linha NÃO pode ser trocado por elas em silêncio.
      const outcome = await runWalkForward(scenario.params());
      expect(outcome.status).toBe('failed');
      expect(outcome.status === 'failed' && outcome.errorCode).toBe('INVALID_WINDOW_CONFIG');
      expect(scenario.memory.state.status).toBe('failed');
    },
    TIMEOUT_MILLISECONDS,
  );
});

describe('walk-forward: a mensagem da thread leva só o runId', () => {
  test('o pedido da thread é { type, runId } e recusa qualquer outro campo', () => {
    expect(
      WALK_FORWARD_REQUEST_MESSAGE_SCHEMA.safeParse({ type: 'run', runId: RUN_ID }).success,
    ).toBe(true);
    const withRequest = WALK_FORWARD_REQUEST_MESSAGE_SCHEMA.safeParse({
      type: 'run',
      runId: RUN_ID,
      request: { grid: SCENARIO_GRID },
    });
    expect(withRequest.success).toBe(false);
  });
});
