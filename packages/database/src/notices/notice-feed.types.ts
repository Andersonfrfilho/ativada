// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OwnerScope } from '../ownership/owner-scope.js';

// De qual tabela o aviso nasceu; o caso de uso do API escolhe a frase por esta origem e pelo estado gravado.
export const NOTICE_SOURCE = {
  ENTRY_ORDER: 'entry_order',
  EXIT_POSITION: 'exit_position',
  RUN_STALLED: 'run_stalled',
  RUN_RESUMED: 'run_resumed',
  RUN_WAITING: 'run_waiting',
  RUN_GOAL: 'run_goal',
  PRICE_ALERT: 'price_alert',
} as const;
export type NoticeSource = (typeof NOTICE_SOURCE)[keyof typeof NOTICE_SOURCE];

// Uma linha crua do que o banco já grava. Dinheiro em texto exato; instantes em milissegundos UTC.
export type NoticeSourceRow = {
  readonly noticeId: string;
  readonly source: NoticeSource;
  readonly occurredAt: number;
  readonly runId: string | undefined;
  readonly symbol: string;
  readonly timeframe: string | undefined;
  readonly candleTime: number | undefined;
  readonly expiresCandleTime: number | undefined;
  readonly operationKey: string | undefined;
  // O status da ordem (`created`, `filled`, `cancelled`, `expired`, `rejected`) ou o desfecho da meta.
  readonly state: string | undefined;
  // Motivo gravado: `orders.reason`, `positions.exit_reason` ou a direção do alerta de preço.
  readonly reason: string | undefined;
  readonly price: string | undefined;
  readonly limitPrice: string | undefined;
  readonly orderType: string | undefined;
  readonly fee: string | undefined;
  readonly quantity: string | undefined;
  readonly netProfit: string | undefined;
  readonly targetPrice: string | undefined;
  readonly entryPrice: string | undefined;
  readonly stopPrice: string | undefined;
  readonly initialBalance: string | undefined;
  // O que a ficha "Operar à mão" precisa e o motor já gravou (RF27 a RF31): decisão, notional e os parâmetros da simulação.
  readonly createdCandleTime: number | undefined;
  readonly notional: string | undefined;
  readonly feeRate: string | undefined;
  readonly slippageRate: string | undefined;
  readonly tickSize: string | undefined;
  readonly quantityStep: string | undefined;
  readonly strategyVersionId: string | undefined;
};

// Onde o histórico procura: o último backtest ou walk-forward concluído da mesma versão, par e vela (RF32).
export type NoticeHistoryKey = {
  readonly strategyVersionId: string;
  readonly symbol: string;
  readonly timeframe: string;
};

export type NoticeHistory = NoticeHistoryKey & {
  readonly kind: string;
  readonly elapsedMilliseconds: number;
  readonly totalReturn: string;
};

// Quais origens a consulta lê: as da simulação, as do alerta de preço, ou todas.
export const NOTICE_FEED_SCOPE = {
  RUNS: 'runs',
  PRICE_ALERTS: 'price-alerts',
  ALL: 'all',
} as const;
export type NoticeFeedScope = (typeof NOTICE_FEED_SCOPE)[keyof typeof NOTICE_FEED_SCOPE];

export type NoticeCursor = { readonly occurredAt: number; readonly noticeId: string };

export type ListNoticeSourcesParams = {
  // Só avisos a partir deste instante (ms UTC): a janela de leitura.
  readonly since: number;
  readonly limit: number;
  readonly scope: NoticeFeedScope;
  // `older`: antes do cursor (paginação); `newer`: depois dele (o resumo na volta). Ausente: os mais novos.
  readonly older: NoticeCursor | undefined;
  readonly newer: NoticeCursor | undefined;
};

// A lista de avisos do dono (ADR 0002, spec 014): UMA consulta `UNION ALL`, sempre com o dono em cada tabela e com LIMIT.
export type NoticeFeedRepository = {
  readonly listNoticeSources: (
    scope: OwnerScope,
    params: ListNoticeSourcesParams,
  ) => Promise<readonly NoticeSourceRow[]>;
  readonly listNoticeHistories: (
    scope: OwnerScope,
    keys: readonly NoticeHistoryKey[],
  ) => Promise<readonly NoticeHistory[]>;
};
