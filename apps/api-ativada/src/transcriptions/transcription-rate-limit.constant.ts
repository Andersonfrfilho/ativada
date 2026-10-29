// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  DEFAULT_MAX_TRACKED_KEYS,
  ONE_MINUTE_MILLISECONDS,
  RATE_LIMIT_KEY_SCOPE,
  type RateLimitPolicy,
} from '../rate-limit/rate-limit-policy.constant.js';

// Pergunta por voz: cada transcrição ocupa a CPU da instância por alguns segundos (whisper.cpp local).
export const TRANSCRIPTION_RATE_LIMIT_POLICY: RateLimitPolicy = {
  name: 'transcription',
  limit: 6,
  windowMilliseconds: ONE_MINUTE_MILLISECONDS,
  keyScope: RATE_LIMIT_KEY_SCOPE.SUBJECT,
  maxTrackedKeys: DEFAULT_MAX_TRACKED_KEYS,
};
