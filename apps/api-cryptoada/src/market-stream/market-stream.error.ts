// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MARKET_ERROR_CODE, type MarketErrorCode } from './market-stream.constant.js';

// Recusa de uma assinatura do ticker público: carrega só o código fixo e, quando há, o par recusado.
export class MarketSubscriptionError extends Error {
  readonly code: MarketErrorCode;
  readonly pair: string | undefined;

  constructor(code: MarketErrorCode, pair?: string) {
    super(`Assinatura de mercado recusada (${code}).`);
    this.name = new.target.name;
    this.code = code;
    this.pair = pair;
  }
}

export class UnsupportedPairError extends MarketSubscriptionError {
  constructor(pair: string) {
    super(MARKET_ERROR_CODE.PAIR_NOT_SUPPORTED, pair);
  }
}

export class TooManyPairsError extends MarketSubscriptionError {
  constructor() {
    super(MARKET_ERROR_CODE.TOO_MANY_PAIRS);
  }
}
