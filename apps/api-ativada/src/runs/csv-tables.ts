// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  EquityPointInput,
  FillInput,
  PositionInput,
  RunLogEntry,
  SignalInput,
  WalkForwardWindowInput,
} from '@ativada/database';

import {
  decimalColumn,
  jsonColumn,
  numberColumn,
  textColumn,
  type CsvColumn,
} from './csv-columns.js';

export const TRADE_COLUMNS: readonly CsvColumn<PositionInput>[] = [
  textColumn('engine_key', (row) => row.engineKey),
  textColumn('status', (row) => row.status),
  decimalColumn('entry_price', (row) => row.entryPrice),
  decimalColumn('quantity', (row) => row.quantity),
  decimalColumn('stop_price', (row) => row.stopPrice),
  decimalColumn('target_price', (row) => row.targetPrice),
  decimalColumn('entry_fee', (row) => row.entryFee),
  decimalColumn('exit_price', (row) => row.exitPrice),
  decimalColumn('exit_fee', (row) => row.exitFee),
  decimalColumn('net_profit', (row) => row.netProfit),
  textColumn('exit_reason', (row) => row.exitReason),
  numberColumn('opened_candle_time', (row) => row.openedCandleTime),
  numberColumn('closed_candle_time', (row) => row.closedCandleTime),
];

export const SIGNAL_COLUMNS: readonly CsvColumn<SignalInput>[] = [
  numberColumn('candle_time', (row) => row.candleTime),
  textColumn('action', (row) => row.action),
  decimalColumn('score', (row) => row.score),
  textColumn('regime', (row) => row.regime),
  textColumn('reason', (row) => row.reason),
  jsonColumn('votes', (row) => row.votes),
  jsonColumn('indicators', (row) => row.indicators),
  jsonColumn('sentiment_observation', (row) => row.sentimentObservation),
];

export const FILL_COLUMNS: readonly CsvColumn<FillInput>[] = [
  numberColumn('candle_time', (row) => row.candleTime),
  textColumn('order_key', (row) => row.orderKey),
  textColumn('position_key', (row) => row.positionKey),
  textColumn('side', (row) => row.side),
  decimalColumn('price', (row) => row.price),
  decimalColumn('quantity', (row) => row.quantity),
  decimalColumn('notional', (row) => row.notional),
  decimalColumn('fee', (row) => row.fee),
];

export const EQUITY_COLUMNS: readonly CsvColumn<EquityPointInput>[] = [
  numberColumn('candle_time', (row) => row.candleTime),
  decimalColumn('equity', (row) => row.equity),
  decimalColumn('equity_at_low', (row) => row.equityAtLow),
  decimalColumn('benchmark', (row) => row.benchmark),
];

export const WINDOW_COLUMNS: readonly CsvColumn<WalkForwardWindowInput>[] = [
  numberColumn('window_index', (row) => row.windowIndex),
  numberColumn('train_start', (row) => row.trainStart),
  numberColumn('train_end', (row) => row.trainEnd),
  numberColumn('test_start', (row) => row.testStart),
  numberColumn('test_end', (row) => row.testEnd),
  textColumn('status', (row) => row.status),
  numberColumn('eligible_combinations', (row) => row.eligibleCombinations),
  jsonColumn('best_params', (row) => row.bestParams),
  jsonColumn('in_sample', (row) => row.inSample),
  jsonColumn('out_of_sample', (row) => row.outOfSample),
];

// O instante do candle em UTC ISO (`2025-01-01T01:00:00.000Z`): legível na planilha e ordenável como texto.
function toIsoTime(milliseconds: number | undefined): string | undefined {
  return milliseconds === undefined ? undefined : new Date(milliseconds).toISOString();
}

// O registro cronológico: cabeçalho fixo; decimais exatamente como o motor os emitiu; só o que o tipo da linha tem.
export const LOG_COLUMNS: readonly CsvColumn<RunLogEntry>[] = [
  textColumn('time', (row) => toIsoTime(row.eventTime)),
  textColumn('event', (row) => row.kind),
  textColumn('action', (row) => row.action),
  textColumn('side', (row) => row.side),
  textColumn('order_key', (row) => row.orderKey),
  textColumn('order_type', (row) => row.orderType),
  textColumn('purpose', (row) => row.purpose),
  textColumn('status', (row) => row.status),
  decimalColumn('score', (row) => row.score),
  textColumn('regime', (row) => row.regime),
  decimalColumn('price', (row) => row.price),
  decimalColumn('limit_price', (row) => row.limitPrice),
  decimalColumn('trigger_price', (row) => row.triggerPrice),
  decimalColumn('quantity', (row) => row.quantity),
  decimalColumn('notional', (row) => row.notional),
  decimalColumn('fee', (row) => row.fee),
  decimalColumn('risk_amount', (row) => row.riskAmount),
  decimalColumn('stop_distance', (row) => row.stopDistance),
  decimalColumn('target_distance', (row) => row.targetDistance),
  textColumn('last_event_time', (row) => toIsoTime(row.lastEventTime)),
  textColumn('reason', (row) => row.reason),
];
