// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  ExecutionConfig,
  FillDecision,
  OpenedPositionDecision,
  OrderEvent,
} from '../../../packages/strategy-engine/src/index.js';
import type { EngineRun, EngineScenario, RecordedStep } from './engine-contract-types.fixture.js';

export type TimelineEntry = {
  readonly index: number;
  readonly step: RecordedStep;
  readonly aliveAtStart: readonly OpenedPositionDecision[];
};

export type Timeline = {
  readonly entries: readonly TimelineEntry[];
  readonly createdOrders: ReadonlyMap<string, OrderEvent & { readonly createdIndex: number }>;
  readonly execution: ExecutionConfig;
};

function registerCreatedOrders(
  step: RecordedStep,
  index: number,
  createdOrders: Map<string, OrderEvent & { readonly createdIndex: number }>,
): void {
  for (const order of step.result.decisions.orders) {
    if (!createdOrders.has(order.orderKey))
      createdOrders.set(order.orderKey, { ...order, createdIndex: index });
  }
}

// Linha do tempo das posições: quem estava aberta no começo de cada candle, com stop e alvo.
export function buildTimeline(scenario: EngineScenario, run: EngineRun): Timeline {
  const createdOrders = new Map<string, OrderEvent & { readonly createdIndex: number }>();
  const alive = new Map<string, OpenedPositionDecision>();
  const entries = run.map((step, index) => {
    const entry = { index, step, aliveAtStart: [...alive.values()] };
    registerCreatedOrders(step, index, createdOrders);
    for (const opened of step.result.decisions.openedPositions)
      alive.set(opened.positionKey, opened);
    for (const closed of step.result.decisions.closedPositions) alive.delete(closed.positionKey);
    return entry;
  });
  return { entries, createdOrders, execution: scenario.strategy.config.execution };
}

export function orderOf(timeline: Timeline, fill: FillDecision): OrderEvent | undefined {
  return timeline.createdOrders.get(fill.orderKey);
}

// Posições vivas durante o candle: as que vieram de antes e as abertas nele.
export function positionsDuring(entry: TimelineEntry): readonly OpenedPositionDecision[] {
  return [...entry.aliveAtStart, ...entry.step.result.decisions.openedPositions];
}

export function isMarketExitAtOpen(
  timeline: Timeline,
  entry: TimelineEntry,
  positionKey: string,
): boolean {
  return entry.step.result.decisions.fills.some((fill) => {
    const order = orderOf(timeline, fill);
    return fill.positionKey === positionKey && fill.side === 'sell' && order?.type === 'market';
  });
}

export function entryFillOf(entry: TimelineEntry, positionKey: string): FillDecision | undefined {
  return entry.step.result.decisions.fills.find(
    (fill) => fill.positionKey === positionKey && fill.side === 'buy',
  );
}
