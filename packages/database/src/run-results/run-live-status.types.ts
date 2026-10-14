// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OwnerScope } from '../ownership/owner-scope.js';
import type {
  EquityPointInput,
  PositionInput,
  SignalInput,
  TimeRange,
} from './run-result.types.js';

// A vela de cada decisão se acha pela PK de `candles`: a corretora, o par e o timeframe são os da execução.
export type DecisionMarket = {
  readonly exchange: string;
  readonly symbol: string;
  readonly timeframe: string;
};

// Uma linha de `signals` com o fechamento (`candles.close`, 8 casas e zeros à direita) e o `close_time` da vela que ela decidiu.
export type DecisionRow = SignalInput & { readonly close: string; readonly closeTime: number };

// Decrescente por `candle_time`: `before` é o último instante já entregue (exclusivo); `limit` de 1 a 100.
export type ListDecisionRowsParams = {
  readonly market: DecisionMarket;
  readonly before: number | undefined;
  readonly limit: number;
};

export type DecisionRowPage = {
  readonly items: readonly DecisionRow[];
  // O `candle_time` da última linha entregue, quando há mais antigas.
  readonly nextBefore: number | undefined;
};

// Só o que o pontinho do gráfico precisa de cada vela; crescente, na faixa `[from, to)`.
export type DecisionMarkerRow = Pick<SignalInput, 'candleTime' | 'action' | 'score'>;

export type ListDecisionMarkersParams = { readonly range: TimeRange; readonly limit: number };

// Faixa FECHADA de `candle_time`: `from` e `to` são a menor e a maior vela das decisões lidas.
export type CandleSpan = { readonly from: number; readonly to: number };

export type ListPositionsAroundParams = {
  // Ausente: só as posições abertas.
  readonly span: CandleSpan | undefined;
  readonly limit: number;
};

// As leituras do acompanhamento ao vivo (ADR 0002, spec 008, L19): cada uma filtra o dono nela mesma, por chave e com LIMIT.
export type RunLiveStatusRepository = {
  readonly readLatestEquityPoint: (
    scope: OwnerScope,
    runId: string,
  ) => Promise<EquityPointInput | undefined>;
  readonly listDecisionRows: (
    scope: OwnerScope,
    runId: string,
    params: ListDecisionRowsParams,
  ) => Promise<DecisionRowPage>;
  // As posições abertas e as que cruzam a faixa: o bastante para saber se a carteira estava comprada em cada vela.
  readonly listPositionsAround: (
    scope: OwnerScope,
    runId: string,
    params: ListPositionsAroundParams,
  ) => Promise<readonly PositionInput[]>;
  readonly listDecisionMarkers: (
    scope: OwnerScope,
    runId: string,
    params: ListDecisionMarkersParams,
  ) => Promise<readonly DecisionMarkerRow[]>;
};
