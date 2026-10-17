// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AlertInput } from '../alerts/alert.types.js';
import type { AnalystDecisionInput } from '../analyst/analyst-decision.types.js';
import type { JsonContainer } from '../json-value.types.js';
import type { TeamRunInputWrite } from '../model-teams/team-run-input.types.js';
import type { OwnerScope } from '../ownership/owner-scope.js';
import type { DataWaitState, RecordDataWaitParams } from '../runs/run-data-wait.js';
import type { RecordGoalOutcomeParams } from '../runs/run-goal.js';
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
  // Meta decidida neste passo (alvo, perda máxima ou prazo): grava o desfecho uma vez; `false` se já estava gravado.
  readonly recordGoalOutcome: (params: Omit<RecordGoalOutcomeParams, 'runId'>) => Promise<boolean>;
  // Encerra a execução ao vivo como concluída (a meta acabou e a posição já saiu), na MESMA transação do passo.
  readonly completeRun: () => Promise<boolean>;
  // A simulação espera um buraco de candles: grava desde quando e conta as recuperações que não o preencheram (`undefined` se
  // a execução não está `running`). O primeiro registro da espera avisa o dono por NOTIFY, na mesma transação.
  readonly recordDataWait: (
    params: Omit<RecordDataWaitParams, 'runId'>,
  ) => Promise<DataWaitState | undefined>;
  // O buraco foi atravessado: apaga a espera.
  readonly clearDataWait: () => Promise<boolean>;
  // Avisa a API (NOTIFY na mesma transação) do que o passo do candle gravou; devolve quantos avisos saíram.
  readonly publishStepEvents: (candleTime: number) => Promise<number>;
  // A decisão do analista de risco da vela (spec 007), na MESMA transação do passo; avisa a API só se a linha é nova.
  readonly appendAnalystDecision: (input: AnalystDecisionInput) => Promise<boolean>;
  // A entrada gravada da vela numa execução de equipe (plan D9), na MESMA transação; `false` se a vela já tinha a sua.
  readonly appendTeamRunInput: (input: TeamRunInputWrite) => Promise<boolean>;
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
