// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { WalletDecisions } from '../../../../packages/strategy-engine/src/index.js';
import {
  iterateFlows,
  REFERENCE_WALLET,
  runWalletFlow,
  type RecordedWalletStep,
  type WalletImplementation,
} from './wallet-differential.fixture.js';

export const COVERAGE = {
  MARKET_FILL: 'market-fill',
  LIMIT_FILL: 'limit-fill',
  LIMIT_EXPIRED: 'limit-expired',
  LIMIT_CANCELLED_BY_SELL: 'limit-cancelled-by-sell',
  STOP_EXIT: 'stop-exit',
  STOP_EXIT_ON_GAP: 'stop-exit-on-gap',
  TARGET_EXIT: 'target-exit',
  TARGET_EXIT_ON_GAP: 'target-exit-on-gap',
  STOP_WITH_TARGET_TOUCHED: 'stop-with-target-touched',
  SIGNAL_EXIT: 'signal-exit',
  COMMAND_EXIT: 'command-exit',
  REJECTED_ZERO_ATR: 'rejected-zero-atr',
  REJECTED_INVALID_STOP: 'rejected-invalid-stop',
  REJECTED_BELOW_MIN_NOTIONAL: 'rejected-below-min-notional',
  VOLUME_CAPPED: 'volume-capped',
  HALT: 'halt',
  RESUME: 'resume',
  GAP_CANDLE: 'gap-candle',
} as const;

export type Coverage = Record<string, number>;

function bump(coverage: Coverage, key: string): void {
  coverage[key] = (coverage[key] ?? 0) + 1;
}

function countOrders(decisions: WalletDecisions, coverage: Coverage): void {
  for (const order of decisions.orders) {
    if (order.status === 'filled' && order.purpose === 'entry') {
      bump(coverage, order.type === 'limit' ? COVERAGE.LIMIT_FILL : COVERAGE.MARKET_FILL);
    }
    if (order.status === 'expired') bump(coverage, COVERAGE.LIMIT_EXPIRED);
    if (order.reason === 'opposite_signal') bump(coverage, COVERAGE.LIMIT_CANCELLED_BY_SELL);
    if (order.reason === 'zero_atr') bump(coverage, COVERAGE.REJECTED_ZERO_ATR);
    if (order.reason === 'invalid_stop') bump(coverage, COVERAGE.REJECTED_INVALID_STOP);
    if (order.reason === 'below_min_notional') bump(coverage, COVERAGE.REJECTED_BELOW_MIN_NOTIONAL);
    if (order.reason === 'volume_capped') bump(coverage, COVERAGE.VOLUME_CAPPED);
  }
}

function countExits(recorded: RecordedWalletStep, coverage: Coverage): void {
  const { candle } = recorded.step;
  const position = recorded.before.position;
  for (const closed of recorded.result.decisions.closedPositions) {
    const isCarried = position !== null && position.openedCandleOpenTime < candle.openTime;
    if (closed.exitReason === 'signal') bump(coverage, COVERAGE.SIGNAL_EXIT);
    if (closed.exitReason === 'command') bump(coverage, COVERAGE.COMMAND_EXIT);
    if (closed.exitReason === 'target') {
      bump(coverage, COVERAGE.TARGET_EXIT);
      if (isCarried && Number(candle.open) > Number(position.targetPrice)) {
        bump(coverage, COVERAGE.TARGET_EXIT_ON_GAP);
      }
    }
    if (closed.exitReason !== 'stop') continue;
    bump(coverage, COVERAGE.STOP_EXIT);
    if (isCarried && Number(candle.open) <= Number(position.stopPrice)) {
      bump(coverage, COVERAGE.STOP_EXIT_ON_GAP);
    }
    if (Number(candle.high) > Number(closed.entryPrice)) {
      bump(coverage, COVERAGE.STOP_WITH_TARGET_TOUCHED);
    }
  }
}

// O que o gerador de fluxos de fato exercita: um diferencial que não toca o caso não prova nada.
export function measureCoverage(implementation: WalletImplementation = REFERENCE_WALLET): Coverage {
  const coverage: Coverage = {};
  for (const flow of iterateFlows()) {
    for (const recorded of runWalletFlow(flow, implementation)) {
      const { decisions } = recorded.result;
      countOrders(decisions, coverage);
      countExits(recorded, coverage);
      for (const command of decisions.commands) {
        if (command.kind === 'halt') bump(coverage, COVERAGE.HALT);
        if (command.kind === 'resume') bump(coverage, COVERAGE.RESUME);
      }
      if ((recorded.step.signal?.confirmedGapCandles ?? 0) > 0) bump(coverage, COVERAGE.GAP_CANDLE);
    }
  }
  return coverage;
}
