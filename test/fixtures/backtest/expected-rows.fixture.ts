// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RecordedStep } from '../strategy-engine/engine-contract-types.fixture.js';

// O que o motor decidiu, escrito à mão a partir das decisões (sem o mapeador de produção): é a régua da paridade
// entre a execução direta em memória e o que o backtest gravou.
export type ExpectedRows = {
  readonly equityPoints: readonly unknown[];
  readonly signals: readonly unknown[];
  readonly fills: readonly unknown[];
  readonly closedPositions: readonly unknown[];
  readonly orderStatuses: Readonly<Record<string, string>>;
};

const FINAL_RANK = 1;

function rankOf(status: string): number {
  return status === 'created' ? 0 : FINAL_RANK;
}

export function expectedRowsOf(run: readonly RecordedStep[]): ExpectedRows {
  const decisions = run.map((step) => step.result.decisions);
  const protection = new Map<string, { stopPrice: string; targetPrice: string }>();
  for (const decision of decisions) {
    for (const opened of decision.openedPositions) {
      protection.set(opened.positionKey, {
        stopPrice: opened.stopPrice,
        targetPrice: opened.targetPrice,
      });
    }
  }
  const orderStatuses: Record<string, string> = {};
  for (const event of decisions.flatMap((decision) => decision.orders)) {
    const known = orderStatuses[event.orderKey];
    if (known === undefined || rankOf(event.status) > rankOf(known)) {
      orderStatuses[event.orderKey] = event.status;
    }
  }
  return {
    equityPoints: decisions.flatMap((decision) =>
      decision.equityPoint === null
        ? []
        : [
            {
              candleTime: decision.equityPoint.candleOpenTime,
              equity: decision.equityPoint.equity,
              equityAtLow: decision.equityPoint.equityAtLow,
              benchmark: decision.equityPoint.benchmark,
            },
          ],
    ),
    signals: decisions.flatMap((decision) =>
      decision.signal === null
        ? []
        : [
            {
              candleTime: decision.signal.candleOpenTime,
              action: decision.signal.action,
              score: decision.signal.score,
              regime: decision.signal.regime,
              reason: decision.signal.reason,
            },
          ],
    ),
    fills: decisions.flatMap((decision) =>
      decision.fills.map((fill) => ({
        orderKey: fill.orderKey,
        positionKey: fill.positionKey,
        candleTime: fill.candleOpenTime,
        side: fill.side,
        price: fill.price,
        quantity: fill.quantity,
        notional: fill.notional,
        fee: fill.fee,
      })),
    ),
    closedPositions: decisions.flatMap((decision) =>
      decision.closedPositions.map((closed) => ({
        engineKey: closed.positionKey,
        entryPrice: closed.entryPrice,
        exitPrice: closed.exitPrice,
        quantity: closed.quantity,
        netProfit: closed.netProfit,
        exitReason: closed.exitReason,
        openedCandleTime: closed.openedCandleOpenTime,
        closedCandleTime: closed.candleOpenTime,
        ...protection.get(closed.positionKey),
      })),
    ),
    orderStatuses,
  };
}
