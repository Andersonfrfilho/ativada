// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Environment } from '../environment.js';
import type { RecoveryClock } from '../stream/recovery-clock.js';
import { MILLISECONDS_PER_HOUR } from '../worker.constant.js';
import type { GapPolicy } from './gap-policy.js';
import { LIVE_GAP_MINIMUM_AGE_MILLISECONDS } from './live.constant.js';

export function createGapPolicy(params: {
  readonly environment: Pick<
    Environment,
    'LIVE_GAP_CONFIRM_RECOVERIES' | 'STREAM_GAP_LOOKBACK_HOURS'
  >;
  readonly recoveryClock: Pick<RecoveryClock, 'lastCleanRoundAt'>;
}): GapPolicy {
  const { environment, recoveryClock } = params;
  return {
    now: () => Date.now(),
    lastCleanRecoveryAt: recoveryClock.lastCleanRoundAt,
    confirmAfterFailedRecoveries: environment.LIVE_GAP_CONFIRM_RECOVERIES,
    minimumGapAgeMilliseconds: LIVE_GAP_MINIMUM_AGE_MILLISECONDS,
    recoveryLookbackMilliseconds: environment.STREAM_GAP_LOOKBACK_HOURS * MILLISECONDS_PER_HOUR,
  };
}
