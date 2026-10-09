// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ApiRouteDependencies } from '../../apps/api-crypto/src/routes/create-api-routes.js';
import { createStreamTicketStore } from '../../apps/api-crypto/src/stream/stream-ticket-store.js';

export function buildApiRouteDependencies(
  checkDatabase: () => Promise<boolean>,
): ApiRouteDependencies {
  const notUsed = (): Promise<never> => Promise.reject(new Error('not used'));
  return {
    checkDatabase,
    session: {
      createSession: notUsed,
      refreshSession: notUsed,
      endSession: notUsed,
      allowedOrigins: new Set(),
    },
    profile: { getProfile: notUsed, updateProfile: notUsed },
    streamTicketStore: createStreamTicketStore({ now: () => Date.now() }),
  };
}
