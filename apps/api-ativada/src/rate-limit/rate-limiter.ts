// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MILLISECONDS_PER_SECOND } from '@ativada/environment';

import { createRecencyMap, type RecencyMap } from '../shared/collections/recency-map.js';
import type { RateLimitPolicy } from './rate-limit-policy.constant.js';

export type RateLimitDecision =
  { readonly isAllowed: true } | { readonly isAllowed: false; readonly retryAfterSeconds: number };

export type ConsumeParams = {
  readonly policy: RateLimitPolicy;
  readonly key: string;
};

export type RateLimiter = {
  readonly consume: (params: ConsumeParams) => RateLimitDecision;
  readonly peek: (params: ConsumeParams) => RateLimitDecision;
  readonly trackedKeyCount: (policy: RateLimitPolicy) => number;
};

type Bucket = {
  tokens: number;
  updatedAtMilliseconds: number;
};

function refill(bucket: Bucket, policy: RateLimitPolicy, nowMilliseconds: number): number {
  const elapsed = Math.max(0, nowMilliseconds - bucket.updatedAtMilliseconds);
  const refilled = (elapsed * policy.limit) / policy.windowMilliseconds;
  return Math.min(policy.limit, bucket.tokens + refilled);
}

function decide(availableTokens: number, policy: RateLimitPolicy): RateLimitDecision {
  if (availableTokens >= 1) return { isAllowed: true };
  const missingTokens = 1 - availableTokens;
  const millisecondsPerToken = policy.windowMilliseconds / policy.limit;
  return {
    isAllowed: false,
    retryAfterSeconds: Math.ceil((missingTokens * millisecondsPerToken) / MILLISECONDS_PER_SECOND),
  };
}

export type RateLimiterOptions = {
  readonly now: () => number;
  // Só o desenvolvimento passa de 1 (o ambiente recusa fora de ENV=dev): multiplica o teto de cada política.
  readonly limitMultiplier?: number;
};

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const multiplier = options.limitMultiplier ?? 1;
  const scaled = (policy: RateLimitPolicy): RateLimitPolicy => ({
    ...policy,
    limit: policy.limit * multiplier,
  });
  // Um mapa por política, cada um com o próprio teto: uma enxurrada de chaves novas numa política não despeja a outra.
  const bucketsByPolicy = new Map<string, RecencyMap<Bucket>>();

  function bucketsOf(policy: RateLimitPolicy): RecencyMap<Bucket> {
    const existing = bucketsByPolicy.get(policy.name);
    if (existing !== undefined) return existing;
    const created = createRecencyMap<Bucket>({
      maximumEntries: policy.maxTrackedKeys,
      isIdle: (bucket) => options.now() - bucket.updatedAtMilliseconds >= policy.windowMilliseconds,
    });
    bucketsByPolicy.set(policy.name, created);
    return created;
  }

  function consume(params: ConsumeParams): RateLimitDecision {
    const policy = scaled(params.policy);
    const nowMilliseconds = options.now();
    const buckets = bucketsOf(policy);
    const bucket = buckets.get(params.key) ?? {
      tokens: policy.limit,
      updatedAtMilliseconds: nowMilliseconds,
    };
    const availableTokens = refill(bucket, policy, nowMilliseconds);
    const decision = decide(availableTokens, policy);
    bucket.tokens = decision.isAllowed ? availableTokens - 1 : availableTokens;
    bucket.updatedAtMilliseconds = nowMilliseconds;
    buckets.set(params.key, bucket);
    return decision;
  }

  function peek(params: ConsumeParams): RateLimitDecision {
    const policy = scaled(params.policy);
    const bucket = bucketsOf(policy).get(params.key);
    if (bucket === undefined) return { isAllowed: true };
    return decide(refill(bucket, policy, options.now()), policy);
  }

  return { consume, peek, trackedKeyCount: (policy) => bucketsOf(policy).size() };
}
