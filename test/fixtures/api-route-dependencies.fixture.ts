// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RunQueueSummary } from '../../packages/database/src/run-queue/run-queue.types.js';
import type { ApiRouteDependencies } from '../../apps/api-cryptoada/src/routes/create-api-routes.js';
import { createStreamTicketStore } from '../../apps/api-cryptoada/src/stream/stream-ticket-store.js';

const ENABLED_MARKETS = {
  symbols: ['BTCUSDT', 'ETHUSDT'],
  timeframes: ['15m', '1h', '4h', '1d'],
};

export const EMPTY_QUEUE_SUMMARY: RunQueueSummary = {
  queued: 0,
  running: 0,
  byKind: {
    backtest: { queued: 0, running: 0 },
    walk_forward: { queued: 0, running: 0 },
    live_paper: { queued: 0, running: 0 },
  },
};

export function buildApiRouteDependencies(
  checkDatabase: () => Promise<boolean>,
  isDocumentationEnabled = false,
  queueSummary: RunQueueSummary = EMPTY_QUEUE_SUMMARY,
): ApiRouteDependencies {
  const notUsed = (): Promise<never> => Promise.reject(new Error('not used'));
  return {
    checkDatabase,
    readRunQueueSummary: () => Promise.resolve(queueSummary),
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
    markets: { enabled: ENABLED_MARKETS, listCandles: notUsed },
    strategies: {
      createStrategy: notUsed,
      listStrategies: notUsed,
      getStrategy: notUsed,
      listVersions: notUsed,
      addVersion: notUsed,
    },
    runs: {
      routes: {
        enabled: ENABLED_MARKETS,
        createRun: notUsed,
        listRuns: notUsed,
        getRun: notUsed,
        stopRun: notUsed,
      },
      series: {
        equity: notUsed,
        trades: notUsed,
        signals: notUsed,
        orders: notUsed,
        fills: notUsed,
        windows: notUsed,
      },
      exportRunCsv: notUsed,
    },
    isDocumentationEnabled,
  };
}
