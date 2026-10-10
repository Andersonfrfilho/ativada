// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { canonicalJson } from '../packages/strategy-engine/src/index.js';
import { runGolden } from './fixtures/backtest/backtest-scenarios.fixture.js';
import {
  buildLive,
  createTestEvaluator,
  tickUntilIdle,
} from './fixtures/live/live-scenarios.fixture.js';
import { REAL_DATASETS } from './fixtures/strategy-engine/signal/classic-signals.fixture.js';

const ROW_KINDS = ['signals', 'orders', 'fills', 'positions', 'equityPoints', 'commands'] as const;

function digestOf(rows: Record<string, readonly unknown[]>): string {
  return new Bun.CryptoHasher('sha256')
    .update(canonicalJson(JSON.parse(JSON.stringify(rows))))
    .digest('hex');
}

describe.each(REAL_DATASETS.map((dataset) => [dataset.name, dataset] as const))(
  'paridade backtest × ao vivo: %s',
  (_name, dataset) => {
    test('o mesmo conjunto de candles reais dá as mesmas operações, uma a uma, e o mesmo digest', async () => {
      const backtest = await runGolden(dataset);
      expect(backtest.outcome.status).toBe('completed');
      const live = buildLive({ dataset });
      const { evaluator } = await createTestEvaluator(live);
      await tickUntilIdle(evaluator);
      const fromBacktest = backtest.memory.snapshot();
      const fromLive = live.snapshot();
      for (const kind of ROW_KINDS) {
        expect(fromLive[kind]?.length).toBe(fromBacktest[kind]?.length);
        fromBacktest[kind]?.forEach((row, index) => {
          expect(fromLive[kind]?.[index]).toStrictEqual(row);
        });
      }
      expect(digestOf(fromLive)).toBe(digestOf(fromBacktest));
      expect(fromLive['positions']?.length).toBeGreaterThan(0);
    });

    test('o estado do motor no último candle é o mesmo nos dois modos (retomar de um é retomar do outro)', async () => {
      const backtest = await runGolden(dataset);
      const live = buildLive({ dataset });
      const { evaluator } = await createTestEvaluator(live);
      await tickUntilIdle(evaluator);
      expect(canonicalJson(live.state.checkpoint?.engineState ?? null)).toBe(
        canonicalJson(backtest.memory.state.checkpoint?.engineState ?? null),
      );
      expect(live.state.checkpoint?.lastCandleTime).toBe(
        backtest.memory.state.checkpoint?.lastCandleTime,
      );
    });

    test('depois de uma queda no meio, a simulação ao vivo retomada ainda é a do backtest', async () => {
      const backtest = await runGolden(dataset);
      const live = buildLive({ dataset });
      const first = await createTestEvaluator(live, {
        instanceId: 'worker-a',
        maxStepsPerPass: 250,
      });
      await first.evaluator.tick();
      live.state.isHeartbeatExpired = true;
      const second = await createTestEvaluator(live, { instanceId: 'worker-b' });
      await tickUntilIdle(second.evaluator);
      expect(digestOf(live.snapshot())).toBe(digestOf(backtest.memory.snapshot()));
    });
  },
);
