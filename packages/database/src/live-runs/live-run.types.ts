// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RenewHeartbeatParams, RenewHeartbeatResult } from '../run-queue/run-queue.types.js';

// `claimedBy` identifica a instância do worker (um id por processo).
export type ClaimLiveRunsParams = {
  readonly claimedBy: string;
  readonly heartbeatTimeoutSeconds: number;
};

// `isTakeover`: a execução estava `running` sob um worker que parou de bater e passou a esta instância.
export type ClaimedLiveRun = { readonly runId: string; readonly isTakeover: boolean };

// A simulação ao vivo tem o PRÓPRIO ciclo (ADR 0002, T4.1): quem reivindica é o worker, nunca a fila de backtests.
export type LiveRunRepository = {
  // Reivindica as `queued` e as `running` de batimento vencido, de contas ativas e dentro do teto
  // `maxActiveLivePaperRuns` de cada usuário, uma por vez (`FOR UPDATE SKIP LOCKED`): dois workers nunca pegam a mesma.
  readonly claimLiveRuns: (params: ClaimLiveRunsParams) => Promise<readonly ClaimedLiveRun[]>;
  readonly renewHeartbeat: (params: RenewHeartbeatParams) => Promise<RenewHeartbeatResult>;
  // Encerramento gracioso: as `running` da instância voltam a `queued` com o checkpoint preservado.
  readonly releaseClaimedRuns: (params: { readonly claimedBy: string }) => Promise<number>;
  // As `running` de conta bloqueada ou apagada são canceladas (as `queued` ficam, sem ser reivindicadas).
  readonly cancelLiveRunsOfInactiveOwners: () => Promise<number>;
};
