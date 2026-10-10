// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { PositionInput } from '@cryptoada/database';
import type {
  ClosedPositionDecision,
  OpenedPositionDecision,
  OpenPositionState,
} from '@cryptoada/strategy-engine';

import { BACKTEST_ERROR_CODE, POSITION_STATUS } from './backtest.constant.js';
import { BacktestError } from './backtest.error.js';

type Protection = { readonly stopPrice: string; readonly targetPrice: string };

export type PositionTracker = {
  readonly open: (position: OpenedPositionDecision) => PositionInput;
  readonly close: (position: ClosedPositionDecision) => PositionInput;
};

function toOpenRow(position: OpenedPositionDecision): PositionInput {
  return {
    engineKey: position.positionKey,
    status: POSITION_STATUS.OPEN,
    entryPrice: position.entryPrice,
    quantity: position.quantity,
    stopPrice: position.stopPrice,
    targetPrice: position.targetPrice,
    entryFee: position.entryFee,
    exitPrice: undefined,
    exitFee: undefined,
    netProfit: undefined,
    exitReason: undefined,
    openedCandleTime: position.candleOpenTime,
    closedCandleTime: undefined,
  };
}

function toClosedRow(position: ClosedPositionDecision, protection: Protection): PositionInput {
  return {
    engineKey: position.positionKey,
    status: POSITION_STATUS.CLOSED,
    entryPrice: position.entryPrice,
    quantity: position.quantity,
    ...protection,
    entryFee: position.entryFee,
    exitPrice: position.exitPrice,
    exitFee: position.exitFee,
    netProfit: position.netProfit,
    exitReason: position.exitReason,
    openedCandleTime: position.openedCandleOpenTime,
    closedCandleTime: position.candleOpenTime,
  };
}

// A saída do motor não repete stop e alvo, e o lote que fecha a posição pode ser outro que o da abertura:
// o rastreador guarda a proteção de cada posição aberta. Na retomada, nasce da posição do estado.
export function createPositionTracker(seed: OpenPositionState | null): PositionTracker {
  const protections = new Map<string, Protection>();
  if (seed !== null) {
    protections.set(seed.positionKey, { stopPrice: seed.stopPrice, targetPrice: seed.targetPrice });
  }
  return {
    open(position): PositionInput {
      const { stopPrice, targetPrice } = position;
      protections.set(position.positionKey, { stopPrice, targetPrice });
      return toOpenRow(position);
    },
    close(position): PositionInput {
      const protection = protections.get(position.positionKey);
      if (protection === undefined) {
        throw new BacktestError(
          BACKTEST_ERROR_CODE.POSITION_UNTRACKED,
          'O motor fechou uma posição que não foi aberta nesta execução.',
        );
      }
      protections.delete(position.positionKey);
      return toClosedRow(position, protection);
    },
  };
}
