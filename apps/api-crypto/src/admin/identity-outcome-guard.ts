// Copyright (c) 2026 Ada Technology. All rights reserved.
import { IDENTITY_OUTCOME, type IdentityOutcome } from '@crypto/identity-admin';

import { IdentityProviderUnavailableError } from './admin.error.js';

export function requireValue<TValue>(outcome: IdentityOutcome<TValue>): TValue {
  if (outcome.status === IDENTITY_OUTCOME.OK) return outcome.value;
  throw new IdentityProviderUnavailableError();
}

export function requireDone(outcome: IdentityOutcome<undefined>): void {
  if (
    outcome.status === IDENTITY_OUTCOME.UNAVAILABLE ||
    outcome.status === IDENTITY_OUTCOME.CONFLICT
  ) {
    throw new IdentityProviderUnavailableError();
  }
}
