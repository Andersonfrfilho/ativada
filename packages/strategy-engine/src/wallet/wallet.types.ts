// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  AppliedCommandDecision,
  ClosedPositionDecision,
  FillDecision,
  OpenedPositionDecision,
  OrderEvent,
} from '../engine-decision.types.js';
import type { EngineCandle } from '../engine-candle.types.js';
import type { WalletState } from '../engine-state.types.js';
import type { RunParameters, StrategyConfig } from '../strategy-config.types.js';

export type WalletContext = {
  readonly config: StrategyConfig;
  readonly parameters: RunParameters;
  readonly candle: EngineCandle;
};

// Rascunho do passo: acumula decisões enquanto o estado é substituído, nunca mutado no lugar. Vive só
// dentro de um `walletStep`; o que sai é o estado novo e as listas.
export type WalletDraft = {
  state: WalletState;
  readonly commands: AppliedCommandDecision[];
  readonly orders: OrderEvent[];
  readonly fills: FillDecision[];
  readonly openedPositions: OpenedPositionDecision[];
  readonly closedPositions: ClosedPositionDecision[];
  // Limitada preenchida no meio do candle: a máxima pode ter vindo antes dela, o alvo não vale nesse candle.
  isIntraCandleEntry: boolean;
};

export function createWalletDraft(state: WalletState): WalletDraft {
  return {
    state,
    commands: [],
    orders: [],
    fills: [],
    openedPositions: [],
    closedPositions: [],
    isIntraCandleEntry: false,
  };
}
