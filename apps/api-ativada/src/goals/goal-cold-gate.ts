// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OwnerScope } from '@ativada/database';

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

// O portão compartilhado: metas e prazos dividem o mesmo teto global e a mesma vaga por usuário, cada um com o seu tipo de resultado.
export type ColdEvaluationGates = {
  readonly forResult: <TResult>() => ColdEvaluationGate<TResult>;
};

// Uma avaliação a frio em voo por usuário (de qualquer tipo), no máximo `maxConcurrent` no total, e cada uma gasta o orçamento do dono.
// Quem pede o mesmo que já voa recebe a mesma avaliação (sem gastar nada); outra avaliação do mesmo dono espera (429).
export function createColdEvaluationGates(params: ColdEvaluationGateParams): ColdEvaluationGates {
  const busyOwners = new Set<string>();

  return {
    forResult: <TResult>(): ColdEvaluationGate<TResult> => {
      const inFlightByOwner = new Map<string, InFlight<TResult>>();

      function admit(
        request: ColdEvaluationRequest,
        ownerKey: string,
      ): Promise<TResult> | undefined {
        const existing = inFlightByOwner.get(ownerKey);
        if (existing?.signature === request.signature) return existing.promise;
        if (busyOwners.has(ownerKey)) {
          throw new RateLimitedError(GOAL_EVALUATION_IN_FLIGHT_RETRY_AFTER_SECONDS);
        }
        if (busyOwners.size >= params.maxConcurrent) throw new GoalEvaluationBusyError();
        params.budget.charge(request.scope);
        return undefined;
      }

      return {
        run: async (request, work): Promise<TResult> => {
          const ownerKey = String(request.scope.ownerUserId);
          const shared = admit(request, ownerKey);
          if (shared !== undefined) return shared;
          busyOwners.add(ownerKey);
          const promise = work().finally(() => {
            inFlightByOwner.delete(ownerKey);
            busyOwners.delete(ownerKey);
          });
          inFlightByOwner.set(ownerKey, { signature: request.signature, promise });
          return promise;
        },
      };
    },
  };
}

// Um portão só para um tipo de resultado (testes e quem não divide a vaga com outro).
export function createColdEvaluationGate<TResult>(
  params: ColdEvaluationGateParams,
): ColdEvaluationGate<TResult> {
  return createColdEvaluationGates(params).forResult<TResult>();
}
