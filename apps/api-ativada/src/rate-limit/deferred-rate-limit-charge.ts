// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RateLimitPolicy } from './rate-limit-policy.constant.js';
import { RateLimitedError } from './rate-limited.error.js';
import type { RateLimiter } from './rate-limiter.js';

export type DeferredRateLimitChargeParams = {
  readonly rateLimiter: RateLimiter;
  readonly policy: RateLimitPolicy;
  readonly key: string;
  readonly inFlightKeys: Set<string>;
};

const IN_FLIGHT_RETRY_AFTER_SECONDS = 1;

// Cobra a cota só depois do sucesso: falha de dependência não gasta a cota de 1 por hora.
// A cota é conferida antes (peek) e um mesmo dono não roda dois trabalhos ao mesmo tempo.
export async function runWithDeferredCharge<TResult>(
  params: DeferredRateLimitChargeParams,
  work: () => Promise<TResult>,
): Promise<TResult> {
  const { rateLimiter, policy, key, inFlightKeys } = params;
  const inFlightKey = `${policy.name}:${key}`;
  const decision = rateLimiter.peek({ policy, key });
  if (!decision.isAllowed) throw new RateLimitedError(decision.retryAfterSeconds);
  if (inFlightKeys.has(inFlightKey)) throw new RateLimitedError(IN_FLIGHT_RETRY_AFTER_SECONDS);
  inFlightKeys.add(inFlightKey);
  try {
    const result = await work();
    rateLimiter.consume({ policy, key });
    return result;
  } finally {
    inFlightKeys.delete(inFlightKey);
  }
}
