// Copyright (c) 2026 Ada Technology. All rights reserved.
import { GOLDEN_DATASETS } from '../../test/fixtures/strategy-engine/production/engine-golden.fixture.js';
import { GRID_24, STRATEGY_CONFIG } from './scenarios.js';
import { runScenario } from './run-scenario.js';
import { DAY_MILLISECONDS, SENTIMENT_SOURCE } from './walkforward-test.constant.js';
import {
  assertCondition,
  reportLine,
  seedCandles,
  seedStrategyVersion,
  type WalkForwardTestContext,
} from './walkforward-test-context.js';

const REAL_WARM_UP_CANDLES = 200;

export async function seedRealSets(context: WalkForwardTestContext): Promise<void> {
  for (const dataset of GOLDEN_DATASETS) await seedCandles(context, dataset.candles);
}

function readRecord(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? Object.getOwnPropertyDescriptor(value, key)?.value
    : undefined;
}

// (c) Os dois conjuntos reais. BTCUSDT 1h × 500 cobre ~21 dias: não comporta nenhuma janela de calendário, e a
// falha tipada PERIOD_TOO_SHORT é o resultado correto. ETHUSDT 1d × 400 (~13 meses) comporta janelas 3/1/1 depois do
// aquecimento da estratégia curta; o relatório é o fora da amostra, sem afirmar nada sobre o alerta.
export async function checkRealSets(context: WalkForwardTestContext): Promise<void> {
  const versionId = await seedStrategyVersion(context, STRATEGY_CONFIG);
  // A combinação mais exigente da grade (média lenta de 50) pede ~170 candles de aquecimento: sobram ~200 dias.
  const leadIn = REAL_WARM_UP_CANDLES;
  for (const dataset of GOLDEN_DATASETS) {
    const first = dataset.candles[leadIn];
    const last = dataset.candles.at(-1);
    if (first === undefined || last === undefined) throw new Error(`${dataset.name}: série curta`);
    const { symbol, timeframe } = dataset.market;
    if (timeframe !== '1h' && timeframe !== '1d') throw new Error('timeframe fora do conjunto');
    const days = Math.round(((last.closeTime + 1 - first.openTime) / DAY_MILLISECONDS) * 10) / 10;
    const result = await runScenario(
      context,
      {
        versionId,
        symbol,
        timeframe,
        periodStart: first.openTime,
        periodEnd: last.closeTime + 1,
        request:
          timeframe === '1d'
            ? { grid: GRID_24, trainMonths: 3, testMonths: 1, stepMonths: 1, minTradesPerWindow: 2 }
            : { grid: GRID_24 },
      },
      { threads: 2 },
    );
    if (timeframe === '1h') {
      assertCondition(
        result.outcome.status === 'failed' &&
          result.outcome.errorCode === 'PERIOD_TOO_SHORT' &&
          result.persisted.status === 'failed' &&
          result.persisted.errorCode === 'PERIOD_TOO_SHORT' &&
          result.persisted.counts['windows'] === 0,
        `${dataset.name}: esperava PERIOD_TOO_SHORT, veio ${result.persisted.status}/${String(result.persisted.errorCode)}`,
      );
      reportLine(
        `REAL ${dataset.name}: ${days} dias de período útil não comportam nem uma janela de calendário => falha tipada PERIOD_TOO_SHORT gravada, nenhuma janela escrita (esperado: com 6/2/2 seriam necessários 12 meses)`,
      );
      continue;
    }
    assertCondition(
      result.outcome.status === 'completed' && result.persisted.status === 'completed',
      `${dataset.name}: terminou ${result.persisted.status}/${String(result.persisted.errorCode)}`,
    );
    const alert = readRecord(result.persisted.metrics, 'overfitting');
    reportLine(
      `REAL ${dataset.name}: ${days} dias de período útil (SENTIMENTO ${SENTIMENT_SOURCE} ausente => voto 0), ${result.persisted.windows.length} janelas 3/1/1, ${result.persisted.counts['equityPoints']} pontos de teste; fora da amostra: retorno ${JSON.stringify(readRecord(readRecord(result.persisted.metrics, 'totalReturn'), 'value'))}, Sharpe ${JSON.stringify(readRecord(readRecord(result.persisted.metrics, 'sharpe'), 'value'))}, comprar e segurar ${JSON.stringify(readRecord(readRecord(result.persisted.metrics, 'benchmarkReturn'), 'value'))}; alerta de overfitting ${JSON.stringify(readRecord(alert, 'isAlert'))} (${JSON.stringify(readRecord(alert, 'reasons'))})`,
    );
  }
}
