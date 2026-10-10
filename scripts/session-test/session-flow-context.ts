// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AccessTokenVerifier } from '../../apps/api-cryptoada/src/authentication/access-token-verifier.js';
import type { IdentityContext } from '../identity-test/identity-context.js';
import type { RunningApi } from './start-api.js';

export type SessionFlowContext = {
  readonly identity: IdentityContext;
  readonly api: RunningApi;
  readonly origin: string;
  readonly verifyAccessToken: AccessTokenVerifier;
};

export function reportSessionStep(step: string, detail: string): void {
  console.log(`session-test: ${step} ok - ${detail}`);
}
