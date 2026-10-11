// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OwnerScope } from '@cryptoada/database';

import { RateLimitedError } from '../rate-limit/rate-limited.error.js';
import type { GoalColdBudget } from './goal-cold-budget.js';
import { GOAL_EVALUATION_IN_FLIGHT_RETRY_AFTER_SECONDS } from './goal.constant.js';
import { GoalEvaluationBusyError } from './goal.error.js';

export type ColdEvaluationRequest = {
  readonly scope: OwnerScope;
  // Identifica o que está sendo avaliado (a meta e os números dela): quem pede o mesmo divide a avaliação em voo.
  readonly signature: string;
};

export type ColdEvaluationGate<TResult> = {
  readonly run: (request: ColdEvaluationRequest, work: () => Promise<TResult>) => Promise<TResult>;
};

export type ColdEvaluationGateParams = {
  readonly maxConcurrent: number;
  readonly budget: GoalColdBudget;
};

type InFlight<TResult> = { readonly signature: string; readonly promise: Promise<TResult> };

// Uma avaliação a frio em voo por usuário, no máximo `maxConcurrent` no total, e cada uma gasta o orçamento do dono.
// Quem pede a mesma meta que já voa recebe a mesma avaliação (sem gastar nada); outra meta do mesmo dono espera (429).
export function createColdEvaluationGate<TResult>(
  params: ColdEvaluationGateParams,
): ColdEvaluationGate<TResult> {
  const inFlightByOwner = new Map<string, InFlight<TResult>>();

  function admit(request: ColdEvaluationRequest, ownerKey: string): Promise<TResult> | undefined {
    const existing = inFlightByOwner.get(ownerKey);
    if (existing !== undefined) {
      if (existing.signature === request.signature) return existing.promise;
      throw new RateLimitedError(GOAL_EVALUATION_IN_FLIGHT_RETRY_AFTER_SECONDS);
    }
    if (inFlightByOwner.size >= params.maxConcurrent) throw new GoalEvaluationBusyError();
    params.budget.charge(request.scope);
    return undefined;
  }

  return {
    run: async (request, work): Promise<TResult> => {
      const ownerKey = String(request.scope.ownerUserId);
      const shared = admit(request, ownerKey);
      if (shared !== undefined) return shared;
      const promise = work().finally(() => inFlightByOwner.delete(ownerKey));
      inFlightByOwner.set(ownerKey, { signature: request.signature, promise });
      return promise;
    },
  };
}
