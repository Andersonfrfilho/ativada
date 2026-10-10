// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_KIND, type RunKind } from '../runs/run.constant.js';
import { DEFAULT_USER_LIMITS } from '../schema/users.schema.js';

// Só estes tipos passam pela fila: a simulação ao vivo (Fase 4) tem o próprio ciclo e nunca é reivindicada.
export const CLAIMABLE_RUN_KINDS: readonly RunKind[] = [RUN_KIND.BACKTEST, RUN_KIND.WALK_FORWARD];

// Gravado em `runs.error_code` quando a execução ficou sem processo vivo e não pôde ser retomada.
export const RUN_ORPHANED_ERROR_CODE = 'ORPHANED';

// O que fazer com a órfã (batimento vencido): retomar a que tem checkpoint e falhar a que não tem, ou falhar todas.
export const RUN_ORPHAN_POLICY = {
  RESUME_WITH_CHECKPOINT: 'resume',
  FAIL_ALL: 'fail',
} as const;
export type RunOrphanPolicy = (typeof RUN_ORPHAN_POLICY)[keyof typeof RUN_ORPHAN_POLICY];

export const MAXIMUM_RUN_LIMIT = 1_000;

// Padrões do RF00b: backtests simultâneos (T3.6), walk-forwards simultâneos e simulações ao vivo ativas.
type RunLimitDefaults = {
  readonly maxConcurrentBacktests: number;
  readonly maxConcurrentWalkForwards: number;
  readonly maxActiveLivePaperRuns: number;
};

export const DEFAULT_RUN_LIMITS: RunLimitDefaults = {
  maxConcurrentBacktests: 2,
  maxConcurrentWalkForwards: DEFAULT_USER_LIMITS.maxConcurrentWalkForwards,
  maxActiveLivePaperRuns: DEFAULT_USER_LIMITS.maxActiveLivePaperRuns,
};
