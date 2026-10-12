// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { JsonContainer } from '@ativada/database';
import type { Engine, OverfittingAlert } from '@ativada/strategy-engine';

import type {
  WALK_FORWARD_OUTCOME_STATUS,
  WALK_FORWARD_PHASE,
  WalkForwardRunErrorCode,
} from './walk-forward.constant.js';
import type { WalkForwardDatabase } from './walk-forward-database.types.js';

// O PEDIDO do walk-forward: a grade e as janelas moram na execução (`runs.request`), não na versão da estratégia
// (ADR 0002). A linha vale: estas opções só são usadas quando a linha não tem pedido (linha anterior à migration 0010
// e testes); o checkpoint guarda o hash do pedido efetivo para recusar uma retomada com outro.
export type WalkForwardRequest = {
  readonly grid?: unknown;
  readonly trainMonths?: number | undefined;
  readonly testMonths?: number | undefined;
  readonly stepMonths?: number | undefined;
  readonly minTradesPerWindow?: number | undefined;
};

export type WalkForwardOptions = WalkForwardRequest & {
  // Threads de busca (1 = no próprio fio). O resultado NÃO depende deste número.
  readonly threads?: number | undefined;
  readonly engine?: Engine | undefined;
  // Relógio do corte do candle aberto: só candle com fechamento já passado entra.
  readonly now?: (() => number) | undefined;
  readonly onProgress?: ((progress: number) => void) | undefined;
};

export type RunWalkForwardParams = {
  readonly database: WalkForwardDatabase;
  readonly runId: string;
  readonly options: WalkForwardOptions;
};

export type PhaseMilliseconds = Readonly<
  Record<(typeof WALK_FORWARD_PHASE)[keyof typeof WALK_FORWARD_PHASE], number>
>;

export type WalkForwardCompleted = {
  readonly status: typeof WALK_FORWARD_OUTCOME_STATUS.COMPLETED;
  readonly runId: string;
  readonly windows: number;
  readonly combinations: number;
  readonly candles: number;
  readonly overfitting: OverfittingAlert;
  readonly metrics: JsonContainer;
  readonly phases: PhaseMilliseconds;
};

export type WalkForwardCancelled = {
  readonly status: typeof WALK_FORWARD_OUTCOME_STATUS.CANCELLED;
  readonly runId: string;
  readonly completedWindows: number;
};

// `isRecorded`: o `failed` chegou ao banco; falso quando nem isso foi possível (o banco caiu junto).
export type WalkForwardFailed = {
  readonly status: typeof WALK_FORWARD_OUTCOME_STATUS.FAILED;
  readonly runId: string;
  readonly errorCode: WalkForwardRunErrorCode;
  readonly message: string;
  readonly isRecorded: boolean;
};

export type WalkForwardOutcome = WalkForwardCompleted | WalkForwardCancelled | WalkForwardFailed;
