// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RateLimitPolicy } from './rate-limit-policy.constant.js';
import { RateLimitedError } from './rate-limited.error.js';
import type { RateLimiter } from './rate-limiter.js';

export type EnforceRateLimitParams = {
  readonly rateLimiter: RateLimiter;
  readonly policy: RateLimitPolicy;
  readonly key: string;
};

export function enforceRateLimit(params: EnforceRateLimitParams): void {
  const decision = params.rateLimiter.consume({ policy: params.policy, key: params.key });
  if (!decision.isAllowed) throw new RateLimitedError(decision.retryAfterSeconds);
}
