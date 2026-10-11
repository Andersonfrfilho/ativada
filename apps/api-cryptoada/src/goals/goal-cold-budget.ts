// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OwnerScope } from '@cryptoada/database';

import {
  RATE_LIMIT_POLICY,
  type RateLimitPolicy,
} from '../rate-limit/rate-limit-policy.constant.js';
import { enforceRateLimit } from '../rate-limit/enforce-rate-limit.js';
import type { RateLimiter } from '../rate-limit/rate-limiter.js';

export type GoalColdBudget = {
  // Gasta uma avaliação a frio do dono; lança o 429 com Retry-After quando o orçamento acabou.
  readonly charge: (scope: OwnerScope) => void;
};

export type GoalColdBudgetParams = {
  readonly rateLimiter: RateLimiter;
  readonly policy?: RateLimitPolicy;
};

// Um orçamento por dono (o id do banco, o mesmo em toda rota): a avaliação a frio e o PATCH que invalida o cache gastam dele.
export function createGoalColdBudget(params: GoalColdBudgetParams): GoalColdBudget {
  const policy = params.policy ?? RATE_LIMIT_POLICY.GOAL_EVALUATION_COLD;
  return {
    charge: (scope): void =>
      enforceRateLimit({
        rateLimiter: params.rateLimiter,
        policy,
        key: String(scope.ownerUserId),
      }),
  };
}
