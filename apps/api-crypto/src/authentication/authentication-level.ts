// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  AUTHENTICATION_LEVEL,
  MULTI_FACTOR_ACR_VALUES,
  type AuthenticationLevel,
} from './authentication.constant.js';

export function normalizeAuthenticationLevel(acr: string | undefined): AuthenticationLevel {
  if (acr !== undefined && MULTI_FACTOR_ACR_VALUES.has(acr))
    return AUTHENTICATION_LEVEL.MULTI_FACTOR;
  return AUTHENTICATION_LEVEL.PASSWORD;
}
