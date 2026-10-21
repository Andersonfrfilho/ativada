// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { JsonContainer } from '../json-value.types.js';
import type { OwnerScope } from '../ownership/owner-scope.js';
import type { DecisionMarket } from './run-live-status.types.js';
import type { SignalAction } from './run-result.constant.js';
import type { TimeRange } from './run-result.types.js';

// Uma linha de `signals` para as camadas do gráfico (ADR 0002, spec 009, P1): só o que as colunas precisam, crescente.
export type LayerRow = {
  readonly candleTime: number;
  readonly action: SignalAction;
  readonly score: string;
  readonly indicators: JsonContainer;
};

export type ListLayerRowsParams = { readonly range: TimeRange; readonly limit: number };

// O trecho de velas decididas que usa um mesmo par de limiares (P4): backtest e ao vivo têm um só; o walk-forward, um por
// janela de teste que terminou bem. `[startTime, endTime)` em ms UTC; os limiares são texto decimal.
export type ProjectionSegment = {
  readonly startTime: number;
  readonly endTime: number;
  readonly buy: string;
  readonly sell: string;
};

// A faixa lida: a série de velas da execução (corretora, par e timeframe), a duração da vela, o fim da faixa da execução
// (a vela seguinte precisa abrir antes dele) e os trechos com os limiares de cada um.
export type ProjectionReadParams = {
  readonly market: DecisionMarket;
  readonly durationMilliseconds: number;
  readonly rangeEnd: number;
  readonly segments: readonly ProjectionSegment[];
};

export type ProjectionStrengthCounts = { readonly hits: number; readonly misses: number };

// As contagens do resumo (P6): tudo em inteiros; taxas, Wilson e frases saem em TypeScript a partir delas.
export type ProjectionCounts = {
  readonly noSide: number;
  readonly pending: number;
  readonly hits: number;
  readonly misses: number;
  readonly ties: number;
  readonly upMoves: number;
  readonly banded: number;
  readonly inside: number;
  readonly byStrength: {
    readonly weak: ProjectionStrengthCounts;
    readonly strong: ProjectionStrengthCounts;
    readonly decided: ProjectionStrengthCounts;
  };
};

export type ListProjectionItemsParams = ProjectionReadParams & {
  // O `candle_time` da última linha já entregue (exclusivo); ausente = a página mais nova.
  readonly before: number | undefined;
  readonly limit: number;
};

// Uma previsão com tudo o que a regra precisa: fechamento da vela, ATR gravado, limiares do trecho e o fechamento da vela
// seguinte contígua (`null` = ainda fora da faixa ou ausente em `candles`).
export type ProjectionItemRow = {
  readonly candleTime: number;
  readonly score: string;
  readonly close: string;
  readonly atr: string | null;
  readonly nextClose: string | null;
  readonly buy: string;
  readonly sell: string;
};

export type ProjectionItemPage = {
  readonly items: readonly ProjectionItemRow[];
  // O `candle_time` da última linha entregue, quando há mais antigas.
  readonly nextBefore: number | undefined;
};

// As leituras da previsão (ADR 0002, spec 009, P6 e P7): cada uma filtra o dono nela mesma, por chave e com LIMIT.
export type RunProjectionRepository = {
  readonly listLayerRows: (
    scope: OwnerScope,
    runId: string,
    params: ListLayerRowsParams,
  ) => Promise<readonly LayerRow[]>;
  readonly summarizeProjections: (
    scope: OwnerScope,
    runId: string,
    params: ProjectionReadParams,
  ) => Promise<ProjectionCounts>;
  readonly listProjectionItems: (
    scope: OwnerScope,
    runId: string,
    params: ListProjectionItemsParams,
  ) => Promise<ProjectionItemPage>;
};
