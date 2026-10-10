// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  ProtectiveRefusal,
  RunParameterWarningCode,
  SizingConstraint,
} from './risk.constant.js';

// Entradas e saídas em texto decimal canônico: o mesmo contrato do estado do motor (sem `Decimal`).
export type ComputeProtectivePricesParams = {
  // Preço de PREENCHIMENTO da entrada (já com slippage), nunca o fechamento de `t`.
  readonly entryPrice: string;
  // ATR do candle de DECISÃO `t`, nunca o de `t+1`.
  readonly atr: string;
  readonly stopAtrMultiple: string;
  readonly targetAtrMultiple: string;
  readonly slippageRate: string;
  readonly tickSize: string;
};

export type ProtectivePricesResult =
  | {
      readonly kind: 'priced';
      readonly stopPrice: string;
      readonly targetPrice: string;
      readonly stopDistance: string;
      readonly targetDistance: string;
    }
  | { readonly kind: 'refused'; readonly reason: ProtectiveRefusal };

export type PositionSizeParams = {
  readonly riskAmount: string;
  readonly entryPrice: string;
  readonly stopPrice: string;
  readonly feeRate: string;
  readonly slippageRate: string;
  readonly cash: string;
  readonly equity: string;
  readonly maxExposureRate: string;
  // Volume do candle de DECISÃO `t`: o do candle de preenchimento é desconhecido na abertura.
  readonly candleVolume: string;
  readonly maxVolumeShare: string;
  readonly quantityStep: string;
  readonly tickSize: string;
  readonly minNotional: string;
};

export type PositionSizeResult = {
  readonly quantity: string;
  readonly notional: string;
  readonly estimatedStopLoss: string;
  readonly constraint: SizingConstraint;
};

export type RunParameterWarning = {
  readonly code: RunParameterWarningCode;
  readonly message: string;
};
