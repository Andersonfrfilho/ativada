// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineCandle, SentimentObservation } from '@cryptoada/strategy-engine';

import type { WalletSpan } from './window-spans.js';

// Tudo o que uma thread de busca precisa e que atravessa a fronteira como dado: nada de conexão com o banco, de
// escopo de dono nem de estado de usuário. As configurações voltam a passar pelo esquema da estratégia lá dentro.
export type SearchInput = {
  readonly parameters: unknown;
  readonly candles: readonly EngineCandle[];
  readonly sentiments: readonly (SentimentObservation | null)[];
  readonly trainSpans: readonly WalletSpan[];
  readonly strategies: readonly unknown[];
};

// O ajuste de uma janela, resumido: o suficiente para escolher o parâmetro e para reconstruir o alerta.
export type WindowSummary = {
  readonly windowIndex: number;
  readonly trades: number;
  readonly sharpe: string | null;
  readonly maxDrawdownAtLow: string;
  readonly points: number;
};

export type CombinationSearcher = {
  readonly evaluate: (combinationIndex: number) => Promise<readonly WindowSummary[]>;
  readonly close: () => Promise<void>;
};
