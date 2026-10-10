// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EquityPointDecision } from '../engine-decision.types.js';
import { EngineDecimal, formatEngineDecimal, type EngineDecimalValue } from '../engine-decimal.js';
import { EXIT_REASON } from '../engine-vocabulary.constant.js';
import type { MetricsClosedPosition, MetricsRun } from '../metrics/metrics.types.js';
import { CHAIN_SCALE_DECIMAL_PLACES, CHAIN_VALUE_DECIMAL_PLACES } from './walk-forward.constant.js';
import type { ChainCarry, ChainedWindowResult, WindowTestResult } from './walk-forward.types.js';

export type ChainWindowResultParams = {
  readonly result: WindowTestResult;
  readonly carried: ChainCarry;
  readonly run: MetricsRun;
};

const ZERO = new EngineDecimal(0);
const FIRST_WINDOW_INDEX = 0;

function scaleValue(value: string, scale: EngineDecimalValue): string {
  const scaled = new EngineDecimal(value).times(scale);
  return formatEngineDecimal(
    scaled.toDecimalPlaces(CHAIN_VALUE_DECIMAL_PLACES, EngineDecimal.ROUND_HALF_UP),
  );
}

function scaleTrade(
  trade: MetricsClosedPosition,
  scale: EngineDecimalValue,
): MetricsClosedPosition {
  return {
    openedCandleOpenTime: trade.openedCandleOpenTime,
    candleOpenTime: trade.candleOpenTime,
    entryFee: scaleValue(trade.entryFee, scale),
    exitFee: scaleValue(trade.exitFee, scale),
    netProfit: scaleValue(trade.netProfit, scale),
    exitReason: trade.exitReason,
  };
}

// A régua da janela 0 é a própria (entrou uma vez, com a taxa dela). Das seguintes, só a razão interna ao
// primeiro ponto da janela continua a régua anterior: repagar a entrada a cada janela empurraria a régua
// para baixo e favoreceria a estratégia. O retorno do primeiro candle de cada janela fica de fora dela.
function chainBenchmark(params: {
  readonly result: WindowTestResult;
  readonly carriedBenchmark: EngineDecimalValue;
  readonly initialBalance: EngineDecimalValue;
}): string[] {
  const { result, carriedBenchmark } = params;
  const first = new EngineDecimal(result.equityPoints[0]?.benchmark ?? '0');
  const isRebased = result.index !== FIRST_WINDOW_INDEX && first.greaterThan(ZERO);
  return result.equityPoints.map((point) => {
    const value = new EngineDecimal(point.benchmark);
    const chained = isRebased
      ? carriedBenchmark.times(value).dividedBy(first)
      : value.times(carriedBenchmark).dividedBy(params.initialBalance);
    return formatEngineDecimal(
      chained.toDecimalPlaces(CHAIN_VALUE_DECIMAL_PLACES, EngineDecimal.ROUND_HALF_UP),
    );
  });
}

// A posição ainda aberta no fim do teste é liquidada ali: a janela seguinte recomeça parada, então o que
// ela valia já está no patrimônio e precisa estar também nas operações.
function liquidationTrade(result: WindowTestResult): MetricsClosedPosition[] {
  const { openPosition } = result;
  const last = result.equityPoints.at(-1);
  if (openPosition === null || last === undefined) return [];
  return [
    {
      openedCandleOpenTime: openPosition.openedCandleOpenTime,
      candleOpenTime: last.candleOpenTime,
      entryFee: openPosition.entryFee,
      exitFee: '0',
      netProfit: openPosition.unrealizedProfit,
      exitReason: EXIT_REASON.COMMAND,
    },
  ];
}

// Cada janela de teste recomeça do patrimônio FINAL da anterior, em unidades relativas: o fator é o patrimônio
// carregado dividido pelo saldo inicial da carteira da janela (ADR 0002, "Walk-forward"). Pura.
export function chainWindowResult(params: ChainWindowResultParams): ChainedWindowResult {
  const { result, carried, run } = params;
  const initialBalance = new EngineDecimal(run.initialBalance);
  const scale = new EngineDecimal(carried.equity)
    .dividedBy(initialBalance)
    .toDecimalPlaces(CHAIN_SCALE_DECIMAL_PLACES, EngineDecimal.ROUND_HALF_UP);
  const benchmarks = chainBenchmark({
    result,
    carriedBenchmark: new EngineDecimal(carried.benchmark),
    initialBalance,
  });
  const equityPoints: EquityPointDecision[] = result.equityPoints.map((point, position) => ({
    candleOpenTime: point.candleOpenTime,
    equity: scaleValue(point.equity, scale),
    equityAtLow: scaleValue(point.equityAtLow, scale),
    benchmark: benchmarks[position] ?? carried.benchmark,
  }));
  const liquidation = liquidationTrade(result);
  const trades = [...result.closedPositions, ...liquidation].map((trade) =>
    scaleTrade(trade, scale),
  );
  const last = equityPoints.at(-1);
  return {
    index: result.index,
    scale: formatEngineDecimal(scale),
    equityPoints,
    trades,
    endEquity: last?.equity ?? carried.equity,
    endBenchmark: last?.benchmark ?? carried.benchmark,
    liquidatedAtWindowEnd: liquidation.length > 0,
  };
}
