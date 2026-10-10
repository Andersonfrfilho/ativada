// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatEngineDecimal, toEngineDecimal } from '../engine-decimal.js';
import type { WalletState } from '../engine-state.types.js';
import type { RunParameters } from '../strategy-config.types.js';
import { buyDebit, liquidationValue } from '../wallet/wallet-pricing.js';
import type { OpenPositionMetrics } from './metrics.types.js';

export type ComputeOpenPositionMetricsParams = {
  readonly wallet: WalletState;
  readonly lastClose: string;
  readonly parameters: RunParameters;
};

// A posição ainda aberta no último fechamento: valor de liquidação (slippage e taxa de saída) menos o débito de
// compra (valor para cima mais a taxa de entrada). As mesmas primitivas da carteira, para a conta fechar.
export function computeOpenPositionMetrics(
  params: ComputeOpenPositionMetricsParams,
): OpenPositionMetrics | null {
  const { position } = params.wallet;
  if (position === null) return null;
  const quantity = toEngineDecimal(position.quantity);
  const worth = liquidationValue({ quantity, price: params.lastClose }, params.parameters);
  const cost = buyDebit(quantity.times(position.entryPrice), params.parameters);
  return {
    openedCandleOpenTime: position.openedCandleOpenTime,
    entryFee: position.entryFee,
    unrealizedProfit: formatEngineDecimal(worth.minus(cost)),
  };
}
