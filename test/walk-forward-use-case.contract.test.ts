// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  computeRunMetrics,
  planWalkForwardWindows,
  type EquityPointDecision,
} from '../packages/strategy-engine/src/index.js';
import { loadWalkForwardApp } from './fixtures/walk-forward/walk-forward-app.fixture.js';
import {
  buildWalkForwardScenario,
  SCENARIO_END,
  SCENARIO_START,
} from './fixtures/walk-forward/walk-forward-scenarios.fixture.js';

const { runWalkForward } = (await loadWalkForwardApp()).run;

const DAY = 86_400_000;
const SCENARIO_TIMEOUT_MILLISECONDS = 120_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function read(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

describe('walk-forward: caso de uso', () => {
  test(
    'conclui, grava uma linha por janela igual ao plano puro e o relatório é o FORA DA AMOSTRA',
    async () => {
      const { memory, params } = buildWalkForwardScenario();
      const progress: number[] = [];
      const outcome = await runWalkForward(
        params({ onProgress: (value: number) => progress.push(value) }),
      );
      expect(outcome.status).toBe('completed');
      const plan = planWalkForwardWindows({ start: SCENARIO_START, end: SCENARIO_END });
      const windows = [...memory.state.windows.values()];
      expect(windows).toHaveLength(plan.length);
      windows.forEach((window, index) => {
        expect(window).toMatchObject({
          windowIndex: index,
          trainStart: plan[index]?.trainStart,
          trainEnd: plan[index]?.trainEnd,
          testStart: plan[index]?.testStart,
          testEnd: plan[index]?.testEnd,
        });
        expect(['ok', 'no_eligible_parameters']).toContain(window.status);
      });
      expect(memory.state.status).toBe('completed');
      expect(memory.state.progress).toBe(100);
      // progresso: só sobe, nunca passa de 99 antes de concluir
      expect(
        progress.every((value, index) => index === 0 || value >= (progress[index - 1] ?? 0)),
      ).toBe(true);
      expect(Math.max(...progress)).toBeLessThanOrEqual(99);
      expect(progress.length).toBeGreaterThan(3);
    },
    SCENARIO_TIMEOUT_MILLISECONDS,
  );

  test(
    'o relatório principal (metrics) são as métricas da curva de TESTES gravada, nunca as do ajuste',
    async () => {
      const { memory, params } = buildWalkForwardScenario();
      await runWalkForward(params());
      const points: EquityPointDecision[] = [...memory.state.results.equityPoints.values()]
        .sort((first, second) => first.candleTime - second.candleTime)
        .map((point) => ({
          candleOpenTime: point.candleTime,
          equity: point.equity,
          equityAtLow: point.equityAtLow,
          benchmark: point.benchmark,
        }));
      const metrics = memory.state.metrics;
      expect(read(metrics, 'sharpe')).toBeDefined();
      const recomputed = computeRunMetrics({
        equityPoints: points,
        closedPositions: [],
        openPosition: null,
        run: { initialBalance: '10000', timeframeMilliseconds: DAY },
      });
      expect(read(metrics, 'totalReturn')).toEqual(recomputed.totalReturn);
      expect(read(metrics, 'sharpe')).toEqual(recomputed.sharpe);
      expect(read(metrics, 'maxDrawdownAtLow')).toEqual(recomputed.maxDrawdownAtLow);
      expect(isRecord(read(metrics, 'overfitting'))).toBe(true);
      const alert = read(metrics, 'overfitting');
      expect(typeof read(alert, 'isAlert')).toBe('boolean');
      expect(Array.isArray(read(alert, 'reasons'))).toBe(true);
    },
    SCENARIO_TIMEOUT_MILLISECONDS,
  );

  test(
    'tudo o que foi gravado do teste fica DENTRO das janelas de teste, com engine_key w<i>:',
    async () => {
      const { memory, params } = buildWalkForwardScenario();
      await runWalkForward(params());
      const windows = [...memory.state.windows.values()];
      const inside = (time: number): boolean =>
        windows.some((window) => time >= window.testStart && time < window.testEnd);
      for (const point of memory.state.results.equityPoints.values()) {
        expect(inside(point.candleTime)).toBe(true);
      }
      for (const signal of memory.state.results.signals.values()) {
        expect(inside(signal.candleTime)).toBe(true);
      }
      for (const order of memory.state.results.orders.values()) {
        expect(order.engineKey).toMatch(/^w\d+:order-\d+$/);
      }
      for (const position of memory.state.results.positions.values()) {
        expect(position.engineKey).toMatch(/^w\d+:position-\d+$/);
      }
      for (const command of memory.state.results.commands.values()) {
        expect(command.commandId).toMatch(/^w\d+:/);
      }
      expect(memory.state.results.equityPoints.size).toBeGreaterThan(100);
    },
    SCENARIO_TIMEOUT_MILLISECONDS,
  );

  test(
    'duas execuções dão exatamente o mesmo resultado gravado',
    async () => {
      const first = buildWalkForwardScenario();
      const second = buildWalkForwardScenario();
      await runWalkForward(first.params());
      await runWalkForward(second.params());
      expect(JSON.stringify(second.memory.snapshot())).toBe(
        JSON.stringify(first.memory.snapshot()),
      );
    },
    SCENARIO_TIMEOUT_MILLISECONDS,
  );
});

describe('walk-forward: propriedades do desenho', () => {
  test(
    'o AJUSTE não enxerga o teste: alterar os candles a partir do começo do teste da janela 1 não muda o ajuste das janelas 0 e 1',
    async () => {
      const boundary = Date.UTC(2023, 8, 1);
      const original = buildWalkForwardScenario();
      const altered = buildWalkForwardScenario({ alterFrom: boundary });
      await runWalkForward(original.params());
      await runWalkForward(altered.params());
      for (const index of [0, 1]) {
        const before = original.memory.state.windows.get(index);
        const after = altered.memory.state.windows.get(index);
        expect(JSON.stringify(after?.inSample)).toBe(JSON.stringify(before?.inSample));
        expect(JSON.stringify(after?.bestParams)).toBe(JSON.stringify(before?.bestParams));
      }
      // a janela 0 também termina o teste antes: o fora da amostra dela é o mesmo
      expect(JSON.stringify(altered.memory.state.windows.get(0)?.outOfSample)).toBe(
        JSON.stringify(original.memory.state.windows.get(0)?.outOfSample),
      );
      // e a alteração é visível onde deve: o ajuste da janela 3 enxerga candles alterados
      expect(JSON.stringify(altered.memory.state.windows.get(3)?.inSample)).not.toBe(
        JSON.stringify(original.memory.state.windows.get(3)?.inSample),
      );
    },
    SCENARIO_TIMEOUT_MILLISECONDS,
  );

  test(
    'nenhuma combinação elegível: TODAS as janelas ficam paradas, sem operar, e o alerta dispara',
    async () => {
      const { memory, params } = buildWalkForwardScenario();
      const outcome = await runWalkForward(params({ minTradesPerWindow: 10_000 }));
      expect(outcome.status).toBe('completed');
      for (const window of memory.state.windows.values()) {
        expect(window.status).toBe('no_eligible_parameters');
        expect(window.bestParams).toBeUndefined();
        expect(window.eligibleCombinations).toBe(0);
      }
      expect(memory.state.results.fills.size).toBe(0);
      expect(memory.state.results.positions.size).toBe(0);
      expect(
        [...memory.state.results.equityPoints.values()].every((point) => point.equity === '10000'),
      ).toBe(true);
      const alert = read(memory.state.metrics, 'overfitting');
      expect(read(alert, 'isAlert')).toBe(true);
      expect(read(alert, 'reasons')).toContain('too_few_eligible_windows');
      expect(memory.state.results.commands.size).toBeGreaterThanOrEqual(
        2 * memory.state.windows.size,
      );
    },
    SCENARIO_TIMEOUT_MILLISECONDS,
  );

  test(
    'lacuna no meio da série: é declarada ao motor com a contagem exata e a execução conclui',
    async () => {
      const { memory, params } = buildWalkForwardScenario({
        hole: { from: Date.UTC(2023, 9, 10), count: 5 },
      });
      const outcome = await runWalkForward(params());
      expect(outcome.status).toBe('completed');
      expect(memory.state.windows.size).toBe(4);
    },
    SCENARIO_TIMEOUT_MILLISECONDS,
  );

  test(
    'a ordem das operações em cada unidade: status, janela, resultados, checkpoint — e só então o commit',
    async () => {
      const { memory, params } = buildWalkForwardScenario();
      await runWalkForward(params());
      const log = memory.calls.log.join(',');
      expect(log).toContain('status,checkpoint,commit');
      expect(log).toContain('status,append-windows,append,checkpoint,commit');
      expect(log).not.toContain('rollback');
    },
    SCENARIO_TIMEOUT_MILLISECONDS,
  );
});
