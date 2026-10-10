// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ApiRouteDependencies } from '../../apps/api-cryptoada/src/routes/create-api-routes.js';
import { createStreamTicketStore } from '../../apps/api-cryptoada/src/stream/stream-ticket-store.js';

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
    account: { exportAccount: notUsed, deleteAccount: notUsed },
    profile: { getProfile: notUsed, updateProfile: notUsed },
    telegram: { unlinkTelegram: notUsed, issueLinkCode: undefined, webhook: undefined },
    admin: {
      inviteUser: notUsed,
      listAccounts: notUsed,
      blockAccount: notUsed,
      unblockAccount: notUsed,
    },
    streamTicketStore: createStreamTicketStore({ now: () => Date.now() }),
  };
}
