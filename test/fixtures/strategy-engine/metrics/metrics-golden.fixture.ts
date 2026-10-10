// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  computeRunMetrics,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  ENGINE_VERSION,
  METRICS_VERSION,
  toEngineDecimal,
  type ComputeRunMetricsParams,
  type OpenPositionMetrics,
  type RunMetrics,
} from '../../../../packages/strategy-engine/src/index.js';
import type { RecordedStep } from '../engine-contract-types.fixture.js';
import { buyDebit, liquidationValue } from '../reference-pricing.fixture.js';
import {
  buildClassicScenario,
  GOLDEN_DATASETS,
  runClassicEngine,
} from '../production/engine-golden.fixture.js';
import type { RealDataset } from '../signal/classic-signals.fixture.js';

export const GOLDEN_METRICS_PATH = `${new URL('../golden/', import.meta.url).pathname}classic-scoreboard-metrics.${METRICS_VERSION}.${ENGINE_VERSION}.json`;

export type MetricsGolden = {
  readonly metricsVersion: string;
  readonly engineVersion: string;
  readonly run: Readonly<Record<string, string>>;
  readonly datasets: Readonly<Record<string, RunMetrics>>;
};

// O lucro não realizado vem da referência independente (preço de liquidação e débito de compra do
// `reference-pricing`), nunca do código da carteira de produção.
function describeOpenPosition(
  dataset: RealDataset,
  run: readonly RecordedStep[],
): OpenPositionMetrics | null {
  const position = run.at(-1)?.result.state.wallet.position ?? null;
  const last = run.at(-1);
  if (position === null || last === undefined) return null;
  const { parameters } = buildClassicScenario(dataset).run;
  const quantity = toEngineDecimal(position.quantity);
  const worth = liquidationValue({ quantity, price: last.candle.close, run: parameters });
  const cost = buyDebit(quantity.times(position.entryPrice), parameters);
  return {
    openedCandleOpenTime: position.openedCandleOpenTime,
    entryFee: position.entryFee,
    unrealizedProfit: worth.minus(cost).toFixed(),
  };
}

// A entrada das métricas tal como a T3.2 a montará a partir de uma execução do motor.
export function buildMetricsParams(
  dataset: RealDataset,
  run: readonly RecordedStep[],
): ComputeRunMetricsParams {
  const decisions = run.map((step) => step.result.decisions);
  return {
    equityPoints: decisions.flatMap((decision) =>
      decision.equityPoint === null ? [] : [decision.equityPoint],
    ),
    closedPositions: decisions.flatMap((decision) => decision.closedPositions),
    openPosition: describeOpenPosition(dataset, run),
    run: {
      initialBalance: buildClassicScenario(dataset).run.parameters.initialBalance,
      timeframeMilliseconds: ENGINE_TIMEFRAME_DURATION_MILLISECONDS[dataset.market.timeframe],
    },
  };
}

export function computeDatasetMetrics(dataset: RealDataset): ComputeRunMetricsParams {
  return buildMetricsParams(dataset, runClassicEngine(dataset));
}

export function buildMetricsGolden(): MetricsGolden {
  const [first] = GOLDEN_DATASETS;
  if (first === undefined) throw new Error('Nenhum conjunto real para o dourado.');
  const parameters = buildClassicScenario(first).run.parameters;
  const datasets = Object.fromEntries(
    GOLDEN_DATASETS.map((dataset) => [
      dataset.name,
      computeRunMetrics(computeDatasetMetrics(dataset)),
    ]),
  );
  return {
    metricsVersion: METRICS_VERSION,
    engineVersion: ENGINE_VERSION,
    run: {
      initialBalance: parameters.initialBalance,
      feeRate: parameters.feeRate,
      slippageRate: parameters.slippageRate,
      tickSize: parameters.tickSize,
      quantityStep: parameters.quantityStep,
      minNotional: parameters.minNotional,
      maxVolumeShare: parameters.maxVolumeShare,
    },
    datasets,
  };
}
