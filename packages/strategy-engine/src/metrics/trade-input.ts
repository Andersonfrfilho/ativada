// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineDecimalValue } from '../engine-decimal.js';
import { EXIT_REASON, type ExitReason } from '../engine-vocabulary.constant.js';
import { parseFiniteDecimal, rejectMetricsInput } from './metrics-input.js';
import type { MetricsClosedPosition, OpenPositionMetrics } from './metrics.types.js';

const EXIT_REASONS: readonly string[] = Object.values(EXIT_REASON);

export type ParsedTrade = {
  readonly openedTime: number;
  readonly closedTime: number;
  readonly entryFee: EngineDecimalValue;
  readonly exitFee: EngineDecimalValue;
  readonly netProfit: EngineDecimalValue;
  readonly exitReason: ExitReason;
};

export type ParsedOpenPosition = {
  readonly openedTime: number;
  readonly entryFee: EngineDecimalValue;
  readonly unrealizedProfit: EngineDecimalValue;
};

function isExitReason(reason: string): reason is ExitReason {
  return EXIT_REASONS.includes(reason);
}

function parseFee(text: string, label: string): EngineDecimalValue {
  const fee = parseFiniteDecimal(text, label);
  if (fee.isNegative()) rejectMetricsInput(`${label} não pode ser negativa.`);
  return fee;
}

function parseTrade(position: MetricsClosedPosition): ParsedTrade {
  const { exitReason } = position;
  if (!isExitReason(exitReason)) rejectMetricsInput('motivo de saída desconhecido.');
  if (position.openedCandleOpenTime > position.candleOpenTime) {
    rejectMetricsInput('a posição não pode sair antes de entrar.');
  }
  return {
    openedTime: position.openedCandleOpenTime,
    closedTime: position.candleOpenTime,
    entryFee: parseFee(position.entryFee, 'entryFee'),
    exitFee: parseFee(position.exitFee, 'exitFee'),
    netProfit: parseFiniteDecimal(position.netProfit, 'netProfit'),
    exitReason,
  };
}

// Há no máximo uma posição por vez: a seguinte só entra depois de a anterior sair, na ordem de saída.
export function parseClosedPositions(positions: readonly MetricsClosedPosition[]): ParsedTrade[] {
  const trades = positions.map(parseTrade);
  trades.forEach((trade, index) => {
    const previous = trades[index - 1];
    if (previous !== undefined && trade.openedTime < previous.closedTime) {
      rejectMetricsInput('as posições devem estar em ordem de saída, sem sobreposição.');
    }
  });
  return trades;
}

export function parseOpenPosition(params: {
  readonly openPosition: OpenPositionMetrics | null;
  readonly trades: readonly ParsedTrade[];
}): ParsedOpenPosition | null {
  const { openPosition } = params;
  if (openPosition === null) return null;
  const lastClosed = params.trades.at(-1);
  if (lastClosed !== undefined && openPosition.openedCandleOpenTime < lastClosed.closedTime) {
    rejectMetricsInput('a posição aberta não pode começar antes da última saída.');
  }
  return {
    openedTime: openPosition.openedCandleOpenTime,
    entryFee: parseFee(openPosition.entryFee, 'entryFee da posição aberta'),
    unrealizedProfit: parseFiniteDecimal(openPosition.unrealizedProfit, 'unrealizedProfit'),
  };
}
