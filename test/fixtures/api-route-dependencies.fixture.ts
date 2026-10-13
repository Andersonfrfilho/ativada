// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RunQueueSummary } from '../../packages/database/src/run-queue/run-queue.types.js';
import type { ListenerHealth } from '../../apps/api-ativada/src/stream/listener-health.js';
import type { ApiRouteDependencies } from '../../apps/api-ativada/src/routes/create-api-routes.js';
import { createStreamTicketStore } from '../../apps/api-ativada/src/stream/stream-ticket-store.js';

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

export const HEALTHY_LISTENER: ListenerHealth = { state: 'up', reason: null };

export function buildApiRouteDependencies(
  checkDatabase: () => Promise<boolean>,
  isDocumentationEnabled = false,
  queueSummary: RunQueueSummary = EMPTY_QUEUE_SUMMARY,
  listenerHealth: ListenerHealth = HEALTHY_LISTENER,
): ApiRouteDependencies {
  const notUsed = (): Promise<never> => Promise.reject(new Error('not used'));
  return {
    checkDatabase,
    readRunQueueSummary: () => Promise.resolve(queueSummary),
    readListenerHealth: () => listenerHealth,
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
    sentiment: { getSentiment: notUsed },
    strategies: {
      createStrategy: notUsed,
      listStrategies: notUsed,
      getStrategy: notUsed,
      listVersions: notUsed,
      addVersion: notUsed,
      deleteStrategy: notUsed,
    },
    goals: {
      enabledSymbols: ENABLED_MARKETS.symbols,
      createGoal: notUsed,
      listGoals: notUsed,
      getGoal: notUsed,
      updateGoal: notUsed,
      deleteGoal: notUsed,
      evaluateGoal: notUsed,
      getGoalPlan: notUsed,
    },
    horizons: { enabledSymbols: ENABLED_MARKETS.symbols, evaluateHorizons: notUsed },
    assets: {
      enabledSymbols: ENABLED_MARKETS.symbols,
      listAssets: notUsed,
      getAssetSummary: notUsed,
      getAsset: notUsed,
      replaceAsset: notUsed,
      tradeAsset: notUsed,
      deleteAsset: notUsed,
    },
    priceAlerts: {
      enabledSymbols: ENABLED_MARKETS.symbols,
      createPriceAlert: notUsed,
      listPriceAlerts: notUsed,
      getPriceAlert: notUsed,
      updatePriceAlert: notUsed,
      deletePriceAlert: notUsed,
      clearFiredPriceAlerts: notUsed,
    },
    runs: {
      routes: {
        enabled: ENABLED_MARKETS,
        createRun: notUsed,
        listRuns: notUsed,
        getRun: notUsed,
        stopRun: notUsed,
        deleteRun: notUsed,
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
      chart: notUsed,
    },
    isDocumentationEnabled,
  };
}
