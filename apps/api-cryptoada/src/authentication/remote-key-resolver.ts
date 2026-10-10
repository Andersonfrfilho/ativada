// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';

import {
  JWKS_CACHE_MAX_AGE_MILLISECONDS,
  JWKS_COOLDOWN_MILLISECONDS,
  JWKS_TIMEOUT_MILLISECONDS,
} from './authentication.constant.js';

export type RemoteKeyResolverSettings = {
  readonly jwksUrl: string;
  readonly timeoutMilliseconds?: number;
  readonly cooldownMilliseconds?: number;
};

export function createRemoteKeyResolver(settings: RemoteKeyResolverSettings): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(settings.jwksUrl), {
    cacheMaxAge: JWKS_CACHE_MAX_AGE_MILLISECONDS,
    cooldownDuration: settings.cooldownMilliseconds ?? JWKS_COOLDOWN_MILLISECONDS,
    timeoutDuration: settings.timeoutMilliseconds ?? JWKS_TIMEOUT_MILLISECONDS,
  });
}
