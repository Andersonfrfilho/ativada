// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  CommandInput,
  EquityPointInput,
  FillInput,
  OrderInput,
  PositionInput,
  RunResultRows,
  SignalInput,
} from '@ativada/database';
import type { StepDecisions } from '@ativada/strategy-engine';

import { mapCommand, mapEquityPoint, mapFill, mapOrderEvent, mapSignal } from './map-decisions.js';
import type { PositionTracker } from './position-tracker.js';

// As linhas do lote em curso: viram UMA transação com o checkpoint do último candle.
export type BatchBuffer = {
  readonly signals: SignalInput[];
  readonly orders: OrderInput[];
  readonly fills: FillInput[];
  readonly positions: PositionInput[];
  readonly equityPoints: EquityPointInput[];
  readonly commands: CommandInput[];
  steps: number;
};

export function createBatchBuffer(): BatchBuffer {
  return {
    signals: [],
    orders: [],
    fills: [],
    positions: [],
    equityPoints: [],
    commands: [],
    steps: 0,
  };
}

export type AppendDecisionsParams = {
  readonly buffer: BatchBuffer;
  readonly decisions: StepDecisions;
  readonly tracker: PositionTracker;
};

// Abertura antes do fechamento: a posição aberta e fechada no mesmo candle (stop) é rastreada antes de sair.
export function appendDecisions(params: AppendDecisionsParams): void {
  const { buffer, decisions, tracker } = params;
  if (decisions.signal !== null) buffer.signals.push(mapSignal(decisions.signal));
  buffer.orders.push(...decisions.orders.map(mapOrderEvent));
  buffer.fills.push(...decisions.fills.map(mapFill));
  buffer.positions.push(...decisions.openedPositions.map(tracker.open));
  buffer.positions.push(...decisions.closedPositions.map(tracker.close));
  if (decisions.equityPoint !== null)
    buffer.equityPoints.push(mapEquityPoint(decisions.equityPoint));
  buffer.commands.push(...decisions.commands.map(mapCommand));
  buffer.steps += 1;
}

export function toRunResultRows(buffer: BatchBuffer): RunResultRows {
  return {
    signals: buffer.signals,
    orders: buffer.orders,
    fills: buffer.fills,
    positions: buffer.positions,
    equityPoints: buffer.equityPoints,
    commands: buffer.commands,
  };
}
