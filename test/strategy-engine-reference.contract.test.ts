// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  ENGINE_INPUT_ERROR_CODE,
  EngineInputError,
} from '../packages/strategy-engine/src/index.js';
import {
  buildStepInput,
  runSteps,
} from './fixtures/strategy-engine/engine-contract-runs.fixture.js';
import type {
  EngineScenario,
  RecordedStep,
} from './fixtures/strategy-engine/engine-contract-types.fixture.js';
import { createReferenceEngine } from './fixtures/strategy-engine/reference-engine.fixture.js';
import { buildReferenceScenarios } from './fixtures/strategy-engine/reference-scenarios.fixture.js';

function scenarioNamed(name: string): EngineScenario {
  const found = buildReferenceScenarios().find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`Cenário ${name} ausente.`);
  return found;
}

function runNamed(name: string): RecordedStep[] {
  return runSteps({ engine: createReferenceEngine(), scenario: scenarioNamed(name) });
}

function stepAt(run: readonly RecordedStep[], index: number): RecordedStep {
  const step = run[index];
  if (step === undefined) throw new Error(`Passo ${index} ausente.`);
  return step;
}

function orderSummary(step: RecordedStep): string[] {
  return step.result.decisions.orders.map(
    (order) => `${order.type}:${order.status}${order.reason === null ? '' : `:${order.reason}`}`,
  );
}

describe('reference engine — sizing by value at risk (RF05)', () => {
  test('the entry stores the value at risk and sizes at the fill price with fees and slippage', () => {
    const run = runNamed('market-entries-with-stop-gap-and-target');
    expect(stepAt(run, 2).result.decisions.orders[0]).toMatchObject({
      status: 'created',
      riskAmount: '100',
      stopDistance: '4',
      targetDistance: '6',
      quantity: null,
    });
    // P = 100.05; stop = 96.05; saída estimada 96; risco por unidade 4.24605 → 23.5513.
    expect(stepAt(run, 3).result.decisions.fills[0]).toMatchObject({
      price: '100.05',
      quantity: '23.5513',
      fee: '2.35630757',
    });
    const closed = run.flatMap((step) => step.result.decisions.closedPositions);
    expect(closed.map((position) => [position.exitReason, position.exitPrice])).toStrictEqual([
      ['stop', '96'],
      ['stop', '84.95'],
      ['target', '115.05'],
    ]);
    expect(closed[0]?.netProfit).toBe('-99.99999737');
  });

  test('a gap up between decision and fill keeps the realized loss at the stop within 1%', () => {
    const run = runNamed('gap-up-entry-then-stop');
    expect(stepAt(run, 3).result.decisions.openedPositions[0]).toMatchObject({
      entryPrice: '105.06',
      quantity: '23.44083',
      stopPrice: '101.06',
    });
    expect(stepAt(run, 4).result.decisions.closedPositions[0]).toMatchObject({
      exitPrice: '101',
      netProfit: '-99.99998723',
    });
  });

  test('the cash, fee included, caps the quantity when the risk would buy more', () => {
    const run = runNamed('cash-bound-entry');
    expect(stepAt(run, 3).result.decisions.fills[0]?.quantity).toBe('99.85017');
    expect(stepAt(run, 3).result.state.wallet.cash).toBe('0.00048199');
  });
});

describe('reference engine — fills, benchmark and equity', () => {
  test('the first signal comes at the close of the last lead-in candle', () => {
    const run = runNamed('market-entries-with-stop-gap-and-target');
    expect(stepAt(run, 1).result.decisions.signal).toBeNull();
    expect(stepAt(run, 2).result.decisions.signal?.action).toBe('BUY');
  });

  test('the benchmark buys at the next open and equity is marked at the close and at the low', () => {
    const run = runNamed('market-entries-with-stop-gap-and-target');
    expect(stepAt(run, 2).result.decisions.equityPoint).toMatchObject({
      equity: '10000',
      equityAtLow: '10000',
      benchmark: '10000',
    });
    expect(stepAt(run, 3).result.state.wallet.benchmark).toStrictEqual({
      quantity: '99.85017',
      cash: '0.00048199',
    });
    expect(stepAt(run, 3).result.decisions.equityPoint).toMatchObject({
      equity: '9992.93460999',
      equityAtLow: '9969.40686129',
    });
  });

  test('the limit scenario expires, fills inside the candle and fills at a gap open', () => {
    const run = runNamed('limit-entries-with-expiry-and-gap');
    expect(orderSummary(stepAt(run, 4))).toStrictEqual(['limit:expired', 'limit:created']);
    const buyPrices = run.flatMap((step) =>
      step.result.decisions.fills.filter((fill) => fill.side === 'buy').map((fill) => fill.price),
    );
    expect(buyPrices).toStrictEqual(['99', '101.06']);
  });

  test('touch is not a fill; later opens fill at the limit; touched target holds; gap target exits at target', () => {
    const run = runNamed('edge-fills-touch-gap-and-intra-candle');
    expect(stepAt(run, 3).result.decisions.fills).toStrictEqual([]);
    expect(stepAt(run, 4).result.decisions.fills[0]?.price).toBe('99');
    expect(stepAt(run, 5).result.decisions.closedPositions).toStrictEqual([]);
    expect(stepAt(run, 6).result.decisions.closedPositions[0]).toMatchObject({
      exitReason: 'target',
      exitPrice: '105',
    });
    expect(orderSummary(stepAt(run, 6)).slice(0, 2)).toStrictEqual([
      'target:created',
      'target:filled',
    ]);
    expect(stepAt(run, 6).result.decisions.orders[0]).toMatchObject({
      triggerPrice: '105',
      limitPrice: null,
      price: null,
    });
    expect(stepAt(run, 7).result.decisions.fills[0]?.price).toBe('104.94');
    expect(stepAt(run, 7).result.decisions.closedPositions).toStrictEqual([]);
  });

  test('rejections and the volume share: zero ATR, invalid stop, below minimum, capped quantity', () => {
    const run = runNamed('rejections-and-volume-cap');
    expect(orderSummary(stepAt(run, 2))).toStrictEqual(['market:rejected:zero_atr']);
    expect(orderSummary(stepAt(run, 4))[0]).toBe('market:rejected:invalid_stop');
    expect(orderSummary(stepAt(run, 6))[0]).toBe('market:rejected:below_min_notional');
    expect(stepAt(run, 7).result.decisions.orders[0]).toMatchObject({
      status: 'filled',
      reason: 'volume_capped',
      quantity: '0.3',
    });
  });
});

describe('reference engine — signals, commands and sentiment', () => {
  test('SELL cancels the live limit entry and sells an open position at the next open', () => {
    const run = runNamed('sell-paths-commands-and-sentiment');
    expect(orderSummary(stepAt(run, 3))).toStrictEqual(['limit:cancelled:opposite_signal']);
    expect(stepAt(run, 8).result.decisions.closedPositions[0]).toMatchObject({
      exitReason: 'signal',
      exitPrice: '97.95',
    });
  });

  test('halt cancels the live entry and blocks entries; resume re-enables; exit_position sells', () => {
    const run = runNamed('sell-paths-commands-and-sentiment');
    expect(stepAt(run, 9).result.decisions.commands).toStrictEqual([
      {
        commandId: 'command-9-halt',
        candleOpenTime: stepAt(run, 9).candle.openTime,
        issuedAt: stepAt(run, 9).candle.openTime,
        kind: 'halt',
        reason: 'user_stop',
        status: 'applied',
      },
    ]);
    expect(orderSummary(stepAt(run, 9))).toStrictEqual(['limit:cancelled:command']);
    expect(stepAt(run, 9).result.state.wallet.isHalted).toBe(true);
    expect(stepAt(run, 11).result.state.wallet.isHalted).toBe(false);
    expect(stepAt(run, 15).result.decisions.closedPositions[0]).toMatchObject({
      exitReason: 'command',
      exitPrice: '98.45',
    });
  });

  test('the signal records the sentiment it used; a stale observation is missing data', () => {
    const run = runNamed('sell-paths-commands-and-sentiment');
    const staleVote = stepAt(run, 4).result.decisions.signal?.votes[1];
    expect(staleVote).toMatchObject({ ruleId: 'greed-filter', vote: 0, isMissing: true });
    expect(stepAt(run, 4).result.decisions.signal?.sentiment).toBeNull();
    expect(stepAt(run, 10).result.decisions.signal).toMatchObject({
      action: 'HOLD',
      sentiment: { value: 85, source: 'alternative.me' },
    });
  });

  test('execution reports from the exchange are refused loudly by the simulated reference', () => {
    const scenario = scenarioNamed('market-entries-with-stop-gap-and-target');
    const engine = createReferenceEngine();
    const [first] = scenario.candles;
    if (first === undefined) throw new Error('Cenário vazio.');
    const input = buildStepInput({
      scenario,
      state: engine.createInitialState({ strategy: scenario.strategy, run: scenario.run }),
      candle: first,
      sentiment: [],
    });
    const report = {
      kind: 'fill',
      reportId: 'report-1',
      reportedAt: first.openTime,
      orderKey: 'order-0',
      price: '100',
      quantity: '1',
      fee: '0.1',
    } as const;
    expect(() => engine.step({ ...input, executionReports: [report] })).toThrow(
      expect.objectContaining({ code: ENGINE_INPUT_ERROR_CODE.EXECUTION_REPORTS_UNSUPPORTED }),
    );
    expect(() => engine.step({ ...input, executionReports: [report] })).toThrow(EngineInputError);
  });
});
