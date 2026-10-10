// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AlertInput } from '../alerts/alert.types.js';
import type { JsonContainer } from '../json-value.types.js';
import type { OwnerScope } from '../ownership/owner-scope.js';
import type { RunStatus } from '../runs/run.constant.js';
import type {
  AppendResult,
  CommandInput,
  EquityPointInput,
  FillInput,
  OrderInput,
  PositionInput,
  SignalInput,
  WalkForwardWindowInput,
} from './run-result.types.js';

// Tudo o que um lote do motor produziu, nas seis tabelas de resultado.
export type RunResultRows = {
  readonly signals: readonly SignalInput[];
  readonly orders: readonly OrderInput[];
  readonly fills: readonly FillInput[];
  readonly positions: readonly PositionInput[];
  readonly equityPoints: readonly EquityPointInput[];
  readonly commands: readonly CommandInput[];
};

export type BatchCheckpointParams = {
  readonly engineState: JsonContainer;
  readonly lastCandleTime: number;
  readonly progress: number;
};

// Os três passos de um lote, todos dentro da MESMA transação e já presos ao dono e à execução.
export type RunBatchWriter = {
  // Lê o status com a linha da execução travada: um cancelamento concorrente espera o fim do lote.
  readonly readStatus: () => Promise<RunStatus>;
  readonly appendResults: (rows: RunResultRows) => Promise<AppendResult>;
  // Alerta de sinal (RF10) na MESMA transação do passo: só nasce se o dono tem Telegram vinculado e alertas ligados.
  readonly appendAlerts: (rows: readonly AlertInput[]) => Promise<AppendResult>;
  // O walk-forward grava a janela (e os resultados do teste dela) no mesmo lote que o checkpoint.
  readonly appendWindows: (rows: readonly WalkForwardWindowInput[]) => Promise<AppendResult>;
  // `false` quando a execução não está `running` ou o candle não avança o checkpoint.
  readonly saveCheckpoint: (params: BatchCheckpointParams) => Promise<boolean>;
  // Avisa a API (NOTIFY na mesma transação) do que o passo do candle gravou; devolve quantos avisos saíram.
  readonly publishStepEvents: (candleTime: number) => Promise<number>;
};

export type RunBatchRepository = {
  // Executa `work` numa transação; se `work` lançar, tudo é desfeito. `undefined` = execução de outro dono
  // ou inexistente (nada é aberto nem gravado).
  readonly runInBatch: <TResult>(
    scope: OwnerScope,
    runId: string,
    work: (writer: RunBatchWriter) => Promise<TResult>,
  ) => Promise<TResult | undefined>;
};
