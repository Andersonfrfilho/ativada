// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { ENGINE_VERSION, EngineDecimal } from '../packages/strategy-engine/src/index.js';
import {
  GOLDEN_DATASETS,
  reconcileRun,
  runClassicEngine,
  buildClassicScenario,
  summarizeEngineRun,
  type EngineGoldenSummary,
} from './fixtures/strategy-engine/production/engine-golden.fixture.js';
import {
  PAPER_TRADES,
  paperTrade,
} from './fixtures/strategy-engine/production/paper-trades.fixture.js';
import type { RealDataset } from './fixtures/strategy-engine/signal/classic-signals.fixture.js';

const GOLDEN_PATH = `${new URL('./fixtures/strategy-engine/golden/', import.meta.url).pathname}classic-scoreboard-engine.${ENGINE_VERSION}.json`;
const RUN_TIMEOUT_MILLISECONDS = 120_000;

type Golden = {
  readonly engineVersion: string;
  readonly run: Readonly<Record<string, string>>;
  readonly datasets: Readonly<Record<string, EngineGoldenSummary>>;
};

async function readGolden(): Promise<Golden> {
  const file = Bun.file(GOLDEN_PATH);
  if (!(await file.exists())) {
    throw new Error(`Grave o dourado do motor ${ENGINE_VERSION} em ${GOLDEN_PATH}.`);
  }
  return (await file.json()) as Golden;
}

describe.each(GOLDEN_DATASETS.map((dataset) => [dataset.name, dataset] as const))(
  'complete engine over real candles: %s',
  (_name, dataset: RealDataset) => {
    const scenario = buildClassicScenario(dataset);
    const run = runClassicEngine(dataset);
    const { initialBalance } = scenario.run.parameters;

    test(
      'is reproducible and matches the golden of this engine version',
      async () => {
        const summary = summarizeEngineRun(run, initialBalance);
        expect(summarizeEngineRun(runClassicEngine(dataset), initialBalance)).toStrictEqual(
          summary,
        );
        const golden = await readGolden();
        expect(golden.engineVersion).toBe(ENGINE_VERSION);
        expect(golden.datasets[dataset.name]).toStrictEqual(summary);
      },
      RUN_TIMEOUT_MILLISECONDS,
    );

    test('the books close: operations + open position = final equity − initial balance', () => {
      const books = reconcileRun(scenario, run);
      expect(new EngineDecimal(books.realized).plus(books.unrealized).toFixed()).toBe(
        books.variation,
      );
      expect(books.cashReplayed).toBe(run.at(-1)?.result.state.wallet.cash ?? '');
    });

    test('the first two operations match the paper calculation, to the last digit', () => {
      const trades = PAPER_TRADES[dataset.name] ?? [];
      expect(trades).toHaveLength(2);
      const closed = run.flatMap((step) => step.result.decisions.closedPositions);
      const opened = run.flatMap((step) => step.result.decisions.openedPositions);
      trades.forEach((trade, index) => {
        const byHand = paperTrade({ trade, dataset, initialBalance });
        expect(opened[index]).toMatchObject({
          entryPrice: byHand.entryPrice,
          quantity: byHand.quantity,
          stopPrice: byHand.stopPrice,
          targetPrice: byHand.targetPrice,
          entryFee: byHand.entryFee,
        });
        expect(closed[index]).toMatchObject({
          exitPrice: byHand.exitPrice,
          exitFee: byHand.exitFee,
          netProfit: byHand.netProfit,
          exitReason: trade.exitReason,
        });
        expect(byHand).toMatchObject(trade.expected);
      });
    });
  },
);

describe('the golden is pinned to the engine version', () => {
  test('the golden file is named by the version and covers every dataset', async () => {
    const golden = await readGolden();
    expect(Object.keys(golden.datasets).sort()).toStrictEqual(
      GOLDEN_DATASETS.map((dataset) => dataset.name).sort(),
    );
    expect(GOLDEN_PATH).toContain(`.${ENGINE_VERSION}.json`);
  });

  test('both real series trade, win and lose, and pay fees', async () => {
    const golden = await readGolden();
    for (const summary of Object.values(golden.datasets)) {
      expect(summary.operations).toBeGreaterThan(5);
      expect(summary.wins).toBeGreaterThan(0);
      expect(summary.wins).toBeLessThan(summary.operations);
      expect(Number(summary.feesPaid)).toBeGreaterThan(0);
    }
  });
});
