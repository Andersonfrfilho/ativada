// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { KeycloakTokenClient } from './keycloak-token-client.js';
import { REVOCATION_STATUS } from './session.constant.js';
import { SessionUnavailableError } from './session.error.js';

export type EndSessionUseCase = (refreshToken: string | undefined) => Promise<void>;

export function createEndSessionUseCase(tokenClient: KeycloakTokenClient): EndSessionUseCase {
  return async (refreshToken) => {
    if (refreshToken === undefined) return;
    const revocation = await tokenClient.revoke(refreshToken);
    if (revocation.status === REVOCATION_STATUS.UNAVAILABLE) throw new SessionUnavailableError();
  };
}
