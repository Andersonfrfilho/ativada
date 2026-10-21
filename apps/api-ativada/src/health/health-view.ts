// Copyright (c) 2026 Ada Technology. All rights reserved.
import { WORKER_HEARTBEAT_STALE_INTERVALS } from '@ativada/environment';
import type { LatestWorkerHeartbeat, readDatabaseHealth } from '@ativada/database';

const MILLISECONDS_PER_SECOND = 1_000;

export const WORKER_STATE = { ALIVE: 'alive', STALE: 'stale', UNKNOWN: 'unknown' } as const;
export type WorkerState = (typeof WORKER_STATE)[keyof typeof WORKER_STATE];

export type WorkerHealth = {
  readonly lastHeartbeatAt: number | null;
  readonly ageSeconds: number | null;
  readonly state: WorkerState;
};

export type DatabaseHealthView = {
  readonly state: 'up' | 'down';
  readonly consecutiveFailures: number;
  readonly downSince: number | null;
  // Só o código (`ERR_POSTGRES_*`, SQLSTATE): nunca a mensagem do driver.
  readonly lastFailureCode: string | null;
  readonly lastFailureAt: number | null;
};

export const UNKNOWN_WORKER_HEALTH: WorkerHealth = {
  lastHeartbeatAt: null,
  ageSeconds: null,
  state: WORKER_STATE.UNKNOWN,
};

type DatabaseHealth = ReturnType<typeof readDatabaseHealth>;

export function toDatabaseHealthView(health: DatabaseHealth): DatabaseHealthView {
  return {
    state: health.state,
    consecutiveFailures: health.consecutiveFailures,
    downSince: health.downSince ?? null,
    lastFailureCode: health.lastFailureCode ?? null,
    lastFailureAt: health.lastFailureAt ?? null,
  };
}

export type WorkerHealthParams = {
  readonly heartbeat: LatestWorkerHeartbeat | undefined;
  readonly heartbeatSeconds: number;
};

// `alive` até 3 intervalos de idade (pelo relógio do banco), depois `stale`; sem nenhuma linha, `unknown`.
export function toWorkerHealth(params: WorkerHealthParams): WorkerHealth {
  const { heartbeat } = params;
  if (heartbeat === undefined) return UNKNOWN_WORKER_HEALTH;
  const staleAfterMilliseconds =
    params.heartbeatSeconds * WORKER_HEARTBEAT_STALE_INTERVALS * MILLISECONDS_PER_SECOND;
  return {
    lastHeartbeatAt: heartbeat.lastBeatAt.getTime(),
    ageSeconds: Math.floor(heartbeat.ageMilliseconds / MILLISECONDS_PER_SECOND),
    state:
      heartbeat.ageMilliseconds <= staleAfterMilliseconds ? WORKER_STATE.ALIVE : WORKER_STATE.STALE,
  };
}
