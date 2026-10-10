// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  createEngine,
  ENGINE_STATE_ERROR_CODE,
  EngineStateError,
} from '../packages/strategy-engine/src/index.js';
import {
  buildStepInput,
  runSteps,
} from './fixtures/strategy-engine/engine-contract-runs.fixture.js';
import { buildProductionScenarios } from './fixtures/strategy-engine/production/production-scenarios.fixture.js';

const SCENARIO = buildProductionScenarios()[0];
if (SCENARIO === undefined) throw new Error('Cenário ausente.');

// Sinal e carteira andam juntos: o `step` não aceita um estado em que cada metade parou num candle.
describe('step refuses a state whose halves stopped at different candles', () => {
  test('wallet behind the signal, and signal behind the wallet', () => {
    const engine = createEngine();
    const steps = runSteps({ engine, scenario: SCENARIO, candles: SCENARIO.candles.slice(0, 6) });
    const last = steps.at(-1);
    const next = SCENARIO.candles[6];
    if (last === undefined || next === undefined) throw new Error('Passo ausente.');
    const input = buildStepInput({
      scenario: SCENARIO,
      state: last.result.state,
      candle: next,
      sentiment: [],
    });
    expect(() => engine.step(input)).not.toThrow();
    const { wallet, signal } = last.result.state;
    const walletBehind = {
      ...last.result.state,
      wallet: {
        ...wallet,
        lastCandleOpenTime:
          wallet.lastCandleOpenTime === null ? null : wallet.lastCandleOpenTime - 3_600_000,
      },
    };
    const signalBehind = {
      ...last.result.state,
      signal: { ...signal, lastCandleOpenTime: (signal.lastCandleOpenTime ?? 0) - 3_600_000 },
    };
    for (const state of [walletBehind, signalBehind]) {
      expect(() => engine.step({ ...input, state })).toThrow(EngineStateError);
      expect(() => engine.step({ ...input, state })).toThrow(
        expect.objectContaining({ code: ENGINE_STATE_ERROR_CODE.INVALID_STATE }),
      );
    }
  });
});
