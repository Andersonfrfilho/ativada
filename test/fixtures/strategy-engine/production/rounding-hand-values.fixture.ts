// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { WalletStepResult } from '../../../../packages/strategy-engine/src/index.js';
import { buildReferenceRun } from '../engine-scenarios.fixture.js';
import type { EngineApi } from './engine-api.fixture.js';
import {
  handStep,
  MARKET_ENTRY_ORDER,
  PENDING_SIGNAL_EXIT,
  type HandStepParams,
} from './hand-wallet.fixture.js';

// Tick 0,00000001 e passo 0,001: preço (8 casas) × quantidade (3 casas) dá notional de 11 casas, e o dinheiro
// tem 8. Slippage zero para a conta ficar só nos arredondamentos de dinheiro. Todas as contas abaixo foram
// feitas à mão (ADR 0002 §e): débito sobe, crédito desce, taxa sobe, cada um a 8 casas.
export const ROUNDING_RUN = buildReferenceRun({
  tickSize: '0.00000001',
  quantityStep: '0.001',
  minNotional: '1',
  maxVolumeShare: '1',
  slippageRate: '0',
});

const ROUNDING_POSITION = {
  positionKey: 'position-0',
  openedCandleOpenTime: MARKET_ENTRY_ORDER.createdCandleOpenTime,
  entryPrice: '0.12345679',
  quantity: '1234.567',
  stopPrice: '0.12345179',
  targetPrice: '0.12346429',
  entryFee: '0.15241568',
} as const;

// Entrada a 0,12345679 limitada pelo volume de decisão (1234,5678 → 1234,567): notional
// 1234,567 × 0,12345679 = 152,41567885993.
const ENTRY_PARAMS: HandStepParams = {
  run: ROUNDING_RUN,
  state: {
    pendingOrder: {
      ...MARKET_ENTRY_ORDER,
      riskAmount: '100',
      stopDistance: '0.000005',
      targetDistance: '0.0000075',
      decisionVolume: '1234.5678',
    },
  },
  candle: ['0.12345679', '0.123464', '0.123455', '0.123463'],
};

// Venda a 0,12349999: notional 1234,567 × 0,12349999 = 152,46901215433.
const EXIT_PARAMS: HandStepParams = {
  run: ROUNDING_RUN,
  state: {
    cash: '9847.43190546',
    position: ROUNDING_POSITION,
    pendingOrder: PENDING_SIGNAL_EXIT,
  },
  candle: ['0.12349999', '0.1235', '0.12349', '0.123495'],
};

export type RoundingObservation = Readonly<Record<string, string | undefined>>;

export type RoundingCase = {
  readonly label: string;
  readonly params: HandStepParams;
  readonly observe: (result: WalletStepResult) => RoundingObservation;
  readonly expected: RoundingObservation;
};

export const ROUNDING_CASES: readonly RoundingCase[] = [
  {
    // buyDebit = ceil8(152,41567885993) + ceil8(taxa 0,15241567885993) = 152,41567886 + 0,15241568.
    // Patrimônio: 9847,43190546 + sellCredit(1234,567 × 0,123463) e × 0,123455 (mínima).
    label: 'entry: buyDebit, entryFee, cash and the valuation at the close and at the low',
    params: ENTRY_PARAMS,
    observe: (result) => ({
      notional: result.decisions.fills[0]?.notional,
      entryFee: result.decisions.openedPositions[0]?.entryFee,
      cash: result.state.cash,
      equity: result.decisions.equityPoint?.equity,
      equityAtLow: result.decisions.equityPoint?.equityAtLow,
    }),
    expected: {
      notional: '152.41567885993',
      entryFee: '0.15241568',
      cash: '9847.43190546',
      equity: '9999.70282763',
      equityAtLow: '9999.69296097',
    },
  },
  {
    // sellCredit = floor8(152,46901215433) − ceil8(0,15246901215433) = 152,46901215 − 0,15246902;
    // netProfit = 152,31654313 − buyDebit da entrada (152,56809454).
    label: 'exit: sellCredit, exitFee, netProfit and the cash',
    params: EXIT_PARAMS,
    observe: (result) => ({
      notional: result.decisions.fills[0]?.notional,
      exitPrice: result.decisions.closedPositions[0]?.exitPrice,
      exitFee: result.decisions.closedPositions[0]?.exitFee,
      netProfit: result.decisions.closedPositions[0]?.netProfit,
      cash: result.state.cash,
    }),
    expected: {
      notional: '152.46901215433',
      exitPrice: '0.12349999',
      exitFee: '0.15246902',
      netProfit: '-0.25155141',
      cash: '9999.74844859',
    },
  },
];

// Primeiro desvio entre o `walletStep` dado e as contas à mão (undefined = nenhum).
export function findRoundingDeviation(walletStep: EngineApi['walletStep']): string | undefined {
  for (const roundingCase of ROUNDING_CASES) {
    const result = handStep({ ...roundingCase.params, walletStepImplementation: walletStep });
    const observed = roundingCase.observe(result);
    for (const [name, expected] of Object.entries(roundingCase.expected)) {
      if (observed[name] !== expected) {
        return `${roundingCase.label}: ${name} esperado ${expected}, veio ${String(observed[name])}`;
      }
    }
  }
  return undefined;
}
