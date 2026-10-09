// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MAX_TRACKED_RATE_LIMIT_KEYS, type RateLimitPolicy } from './rate-limit-policy.constant.js';

export type RateLimitDecision =
  { readonly isAllowed: true } | { readonly isAllowed: false; readonly retryAfterSeconds: number };

export type ConsumeParams = {
  readonly policy: RateLimitPolicy;
  readonly key: string;
};

export type RateLimiter = {
  readonly consume: (params: ConsumeParams) => RateLimitDecision;
};

type Bucket = {
  tokens: number;
  updatedAtMilliseconds: number;
  readonly refillWindowMilliseconds: number;
};

const MILLISECONDS_PER_SECOND = 1000;

function refill(bucket: Bucket, policy: RateLimitPolicy, nowMilliseconds: number): number {
  const elapsed = Math.max(0, nowMilliseconds - bucket.updatedAtMilliseconds);
  const refilled = (elapsed * policy.limit) / policy.windowMilliseconds;
  return Math.min(policy.limit, bucket.tokens + refilled);
}

function evictIdleBuckets(buckets: Map<string, Bucket>, nowMilliseconds: number): void {
  for (const [bucketKey, bucket] of buckets) {
    if (nowMilliseconds - bucket.updatedAtMilliseconds >= bucket.refillWindowMilliseconds) {
      buckets.delete(bucketKey);
    }
  }
  const oldestKey = buckets.keys().next().value;
  if (buckets.size >= MAX_TRACKED_RATE_LIMIT_KEYS && oldestKey !== undefined) {
    buckets.delete(oldestKey);
  }
}

export function createRateLimiter(options: { readonly now: () => number }): RateLimiter {
  const buckets = new Map<string, Bucket>();

  function consume(params: ConsumeParams): RateLimitDecision {
    const nowMilliseconds = options.now();
    const bucketKey = `${params.policy.name}:${params.key}`;
    if (!buckets.has(bucketKey) && buckets.size >= MAX_TRACKED_RATE_LIMIT_KEYS) {
      evictIdleBuckets(buckets, nowMilliseconds);
    }
    const bucket = buckets.get(bucketKey) ?? {
      tokens: params.policy.limit,
      updatedAtMilliseconds: nowMilliseconds,
      refillWindowMilliseconds: params.policy.windowMilliseconds,
    };
    const availableTokens = refill(bucket, params.policy, nowMilliseconds);
    bucket.updatedAtMilliseconds = nowMilliseconds;
    buckets.set(bucketKey, bucket);
    if (availableTokens >= 1) {
      bucket.tokens = availableTokens - 1;
      return { isAllowed: true };
    }
    bucket.tokens = availableTokens;
    const missingTokens = 1 - availableTokens;
    const millisecondsPerToken = params.policy.windowMilliseconds / params.policy.limit;
    return {
      isAllowed: false,
      retryAfterSeconds: Math.ceil(
        (missingTokens * millisecondsPerToken) / MILLISECONDS_PER_SECOND,
      ),
    };
  }

  return { consume };
}
