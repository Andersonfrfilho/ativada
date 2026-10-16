// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { DatabaseExecutor } from '../database-executor.js';
import type { JsonContainer, JsonValue } from '../json-value.types.js';
import type { OwnerScope } from '../ownership/owner-scope.js';

// Os blocos jsonb (previsão, leituras, equipe, travas e comandos) são objeto ou lista; `undefined` grava `NULL`.
export type AnalystDecisionInput = {
  readonly runId: string;
  readonly candleTime: number;
  readonly version: string;
  readonly mode: string;
  readonly status: string;
  readonly posture: string | undefined;
  readonly reason: string | undefined;
  readonly cadenceMinutes: number | undefined;
  readonly entryGate: string | undefined;
  // Texto decimal exato (`0`, `0.25`, `0.5`, `1`).
  readonly riskScale: string | undefined;
  readonly isTimeExitDue: boolean | undefined;
  readonly forecast: JsonContainer | undefined;
  readonly readings: JsonContainer | undefined;
  readonly specialists: JsonContainer | undefined;
  readonly locks: JsonContainer | undefined;
  readonly commands: JsonContainer | undefined;
  readonly message: string | undefined;
  readonly failureCode: string | undefined;
};

export type AnalystDecisionRecord = {
  readonly runId: string;
  readonly candleTime: number;
  readonly version: string;
  readonly mode: string;
  readonly status: string;
  readonly posture: string | null;
  readonly reason: string | null;
  readonly cadenceMinutes: number | null;
  readonly entryGate: string | null;
  readonly riskScale: string | null;
  readonly isTimeExitDue: boolean | null;
  readonly forecast: JsonValue;
  readonly readings: JsonValue;
  readonly specialists: JsonValue;
  readonly locks: JsonValue;
  readonly commands: JsonValue;
  readonly message: string | null;
  readonly failureCode: string | null;
  readonly createdAt: Date;
};

export type ListAnalystDecisionsParams = {
  readonly runId: string;
  readonly limit: number;
  // Último `candleTime` da página anterior (ordem decrescente): só vêm velas mais antigas.
  readonly before: number | undefined;
};

export type AnalystDecisionsPage = {
  readonly decisions: readonly AnalystDecisionRecord[];
  readonly nextCursor: number | undefined;
};

// Toda leitura e escrita é filtrada pelo dono; execução alheia ou inexistente é `undefined` / lista vazia / `false`.
export type AnalystDecisionRepository = {
  // Idempotente por (execução, vela): a vela já decidida não muda; devolve se gravou uma linha nova.
  readonly appendAnalystDecision: (
    scope: OwnerScope,
    input: AnalystDecisionInput,
  ) => Promise<boolean>;
  readonly findAnalystDecision: (
    scope: OwnerScope,
    params: { readonly runId: string; readonly candleTime: number },
  ) => Promise<AnalystDecisionRecord | undefined>;
  readonly findLatestAnalystDecision: (
    scope: OwnerScope,
    runId: string,
  ) => Promise<AnalystDecisionRecord | undefined>;
  readonly listAnalystDecisionsPage: (
    scope: OwnerScope,
    params: ListAnalystDecisionsParams,
  ) => Promise<AnalystDecisionsPage>;
};

// Para o passo do worker gravar na MESMA transação do candle (T2.3).
export type InsertAnalystDecision = (
  executor: DatabaseExecutor,
  scope: OwnerScope,
  input: AnalystDecisionInput,
) => Promise<boolean>;
