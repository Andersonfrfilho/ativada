// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  computeRunMetrics,
  planWalkForwardWindows,
  type EquityPointDecision,
} from '../../packages/strategy-engine/src/index.js';
import {
  buildHourlySeries,
  GRID_24,
  hourlyScenario,
  NO_COSTS,
  STRATEGY_CONFIG,
} from './scenarios.js';
import { assertCompleted, runScenario, type ScenarioResult } from './run-scenario.js';
import {
  HOUR_MILLISECONDS,
  PERIOD_END,
  PERIOD_START,
  SYMBOLS,
} from './walkforward-test.constant.js';
import {
  assertCondition,
  reportLine,
  seedCandles,
  seedStrategyVersion,
  type WalkForwardTestContext,
} from './walkforward-test-context.js';

const REQUEST = { grid: GRID_24, minTradesPerWindow: 10 } as const;
const OVERFITTING_SEED = 2;
const TRENDING_SEED = 1;
const TRENDING_DRIFT_BASIS_POINTS = 4;

type Alert = {
  readonly isAlert: boolean;
  readonly reasons: readonly string[];
  readonly inSampleSharpe: { readonly value: string | null };
  readonly outOfSampleSharpe: { readonly value: string | null };
  readonly degradation: { readonly value: string | null };
};

function readRecord(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? Object.getOwnPropertyDescriptor(value, key)?.value
    : undefined;
}

function readAlert(result: ScenarioResult): Alert {
  const alert = readRecord(result.persisted.metrics, 'overfitting');
  if (typeof alert !== 'object' || alert === null) throw new Error('metrics sem overfitting');
  return alert as Alert;
}

// (i) As janelas gravadas batem com o plano puro, e o relatório principal é o FORA DA AMOSTRA concatenado: as
// métricas recomputadas sobre a curva de testes gravada são as de `runs.metrics`, e não as do ajuste.
function assertWindowsAndMainReport(result: ScenarioResult, label: string): void {
  const plan = planWalkForwardWindows({ start: PERIOD_START, end: PERIOD_END });
  const { windows } = result.persisted;
  assertCondition(
    windows.length === plan.length,
    `${label}: ${windows.length} janelas, plano ${plan.length}`,
  );
  plan.forEach((expected, index) => {
    const stored = windows[index];
    assertCondition(
      stored?.windowIndex === index &&
        stored.trainStart === expected.trainStart &&
        stored.trainEnd === expected.trainEnd &&
        stored.testStart === expected.testStart &&
        stored.testEnd === expected.testEnd &&
        stored.trainEnd === stored.testStart,
      `${label}: a janela ${index} gravada difere do plano puro`,
    );
  });
  const points: EquityPointDecision[] = result.persisted.equityPoints.map((point) => ({
    candleOpenTime: point.candleTime,
    equity: point.equity,
    equityAtLow: point.equityAtLow,
    benchmark: point.benchmark,
  }));
  assertCondition(
    points.every((point) =>
      windows.some((w) => point.candleOpenTime >= w.testStart && point.candleOpenTime < w.testEnd),
    ),
    `${label}: há patrimônio gravado fora das janelas de TESTE`,
  );
  const recomputed = computeRunMetrics({
    equityPoints: points,
    closedPositions: [],
    openPosition: null,
    run: { initialBalance: '10000', timeframeMilliseconds: HOUR_MILLISECONDS },
  });
  const alert = readAlert(result);
  assertCondition(
    JSON.stringify(readRecord(result.persisted.metrics, 'sharpe')) ===
      JSON.stringify(recomputed.sharpe) &&
      JSON.stringify(readRecord(result.persisted.metrics, 'maxDrawdownAtLow')) ===
        JSON.stringify(recomputed.maxDrawdownAtLow),
    `${label}: metrics não é a curva de testes concatenada`,
  );
  assertCondition(
    alert.outOfSampleSharpe.value === recomputed.sharpe.value &&
      alert.inSampleSharpe.value !== alert.outOfSampleSharpe.value,
    `${label}: o relatório principal confundiu dentro e fora da amostra`,
  );
}

export type OverfittingResults = {
  readonly overfit: ScenarioResult;
  readonly trending: ScenarioResult;
};

export async function checkOverfitting(
  context: WalkForwardTestContext,
): Promise<OverfittingResults> {
  const versionId = await seedStrategyVersion(context, STRATEGY_CONFIG);
  await seedCandles(
    context,
    buildHourlySeries({ symbol: SYMBOLS.OVERFITTING, seed: OVERFITTING_SEED, driftBasisPoints: 0 }),
  );
  const overfit = await runScenario(
    context,
    hourlyScenario({ versionId, symbol: SYMBOLS.OVERFITTING, request: REQUEST, costs: NO_COSTS }),
  );
  assertCompleted(overfit, 'overfitting conhecido');
  const alert = readAlert(overfit);
  assertCondition(
    alert.isAlert,
    'OVERFITTING: o alerta NÃO disparou no passeio aleatório sem borda',
  );
  const inSample = Number(alert.inSampleSharpe.value);
  const outOfSample = Number(alert.outOfSampleSharpe.value);
  assertCondition(
    inSample > 0 && outOfSample < inSample / 2,
    'OVERFITTING: dentro positivo e fora abaixo de 50%',
  );
  assertWindowsAndMainReport(overfit, 'overfitting conhecido');
  reportLine(
    `OVERFITTING CONHECIDO (passeio aleatório sem borda, custos zerados, 24 combinações, ${overfit.persisted.windows.length} janelas): ALERTA DISPARA, Sharpe DENTRO ${alert.inSampleSharpe.value}, FORA ${alert.outOfSampleSharpe.value}, degradação ${alert.degradation.value}, motivos ${alert.reasons.join('+')}`,
  );
  await seedCandles(
    context,
    buildHourlySeries({
      symbol: SYMBOLS.TRENDING,
      seed: TRENDING_SEED,
      driftBasisPoints: TRENDING_DRIFT_BASIS_POINTS,
    }),
  );
  const trending = await runScenario(
    context,
    hourlyScenario({ versionId, symbol: SYMBOLS.TRENDING, request: REQUEST }),
  );
  assertCompleted(trending, 'tendência persistente');
  const trendAlert = readAlert(trending);
  assertCondition(
    !trendAlert.isAlert && Number(trendAlert.outOfSampleSharpe.value) > 0,
    `TENDÊNCIA: o alerta disparou (${trendAlert.reasons.join('+')}) ou o fora da amostra não é positivo`,
  );
  assertWindowsAndMainReport(trending, 'tendência persistente');
  reportLine(
    `TENDÊNCIA PERSISTENTE (custos reais, 24 combinações, ${trending.persisted.windows.length} janelas): ALERTA NÃO DISPARA, Sharpe DENTRO ${trendAlert.inSampleSharpe.value}, FORA ${trendAlert.outOfSampleSharpe.value}, degradação ${trendAlert.degradation.value}`,
  );
  return { overfit, trending };
}
