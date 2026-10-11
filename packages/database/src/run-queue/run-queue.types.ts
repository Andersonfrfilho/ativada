// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OwnerScope } from '../ownership/owner-scope.js';
import type { RunKind } from '../runs/run.constant.js';
import type { UserRunLimits } from './run-limits.js';
import type { RunOrphanPolicy } from './run-queue.constant.js';

export type ClaimedRun = { readonly runId: string; readonly kind: RunKind };

// `claimedBy` identifica a instância da API (um id por processo).
export type ClaimNextRunParams = { readonly claimedBy: string };

export type RenewHeartbeatParams = {
  readonly claimedBy: string;
  readonly runIds: readonly string[];
};

// `held`: as que continuam desta instância. `lost`: as que outra instância recuperou (voltaram à fila ou rodam sob
// outro dono); as que simplesmente terminaram não são nem uma coisa nem outra.
export type RenewHeartbeatResult = {
  readonly held: readonly string[];
  readonly lost: readonly string[];
};

export type ReclaimExpiredRunsParams = {
  readonly heartbeatTimeoutSeconds: number;
  readonly orphanPolicy: RunOrphanPolicy;
};

export type ReclaimResult = { readonly requeued: number; readonly failed: number };

// A posição de uma execução `queued`, 1-based: entre as do PRÓPRIO dono e na fila inteira (só o número).
export type RunQueuePosition = { readonly own: number; readonly overall: number };

type KindCounts = { readonly queued: number; readonly running: number };

// Só contagens: nenhum dado de usuário.
export type RunQueueSummary = {
  readonly queued: number;
  readonly running: number;
  readonly byKind: Readonly<Record<RunKind, KindCounts>>;
};

export type RunQueueRepository = {
  // Reivindica a próxima execução elegível (round-robin entre usuários, tetos por usuário e tipo) com
  // `FOR UPDATE SKIP LOCKED`: segura com várias instâncias sobre o mesmo banco. `undefined` se não há nenhuma.
  readonly claimNextRun: (params: ClaimNextRunParams) => Promise<ClaimedRun | undefined>;
  // Renova o batimento das execuções que a instância ainda detém e devolve quais continuam dela e quais perdeu.
  readonly renewHeartbeat: (params: RenewHeartbeatParams) => Promise<RenewHeartbeatResult>;
  // Órfãs (`running` com batimento vencido ou ausente): com checkpoint voltam à fila, sem checkpoint viram
  // `failed`/`ORPHANED` (ou todas falham, conforme a política). A simulação ao vivo nunca é tocada.
  readonly reclaimExpiredRuns: (params: ReclaimExpiredRunsParams) => Promise<ReclaimResult>;
  // Encerramento gracioso: as `running` da instância voltam a `queued` com o checkpoint preservado.
  readonly releaseClaimedRuns: (params: { readonly claimedBy: string }) => Promise<number>;
  // As `running` de conta bloqueada ou apagada são canceladas (as `queued` ficam, sem ser reivindicadas).
  readonly cancelRunsOfInactiveOwners: () => Promise<number>;
  readonly countQueuedRuns: (scope: OwnerScope) => Promise<number>;
  // Execuções guardadas do dono (não apagadas, de qualquer tipo e estado): a cota de armazenamento.
  readonly countStoredRuns: (scope: OwnerScope) => Promise<number>;
  readonly countActiveRuns: (scope: OwnerScope, kind: RunKind) => Promise<number>;
  readonly readUserRunLimits: (scope: OwnerScope) => Promise<UserRunLimits>;
  readonly findQueuePosition: (
    scope: OwnerScope,
    runId: string,
  ) => Promise<RunQueuePosition | undefined>;
  readonly readQueueSummary: () => Promise<RunQueueSummary>;
};
