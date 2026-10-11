// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createCandleRepository,
  createPriceAlertRepository,
  createSentimentObservationRepository,
  createStrategyRepository,
  createUserAssetRepository,
  type DatabaseHandle,
} from '@cryptoada/database';

import { createAssetRuleCache } from '../assets/asset-rule.js';
import { createGetAssetSummaryUseCase } from '../assets/asset-summary.use-case.js';
import {
  createDeleteAssetUseCase,
  createGetAssetUseCase,
  createListAssetsUseCase,
  createReplaceAssetUseCase,
  createTradeAssetUseCase,
} from '../assets/asset.use-cases.js';
import type { AssetRouteDependencies } from '../assets/assets.routes.js';
import type { Environment } from '../environment.js';
import {
  createCreatePriceAlertUseCase,
  createClearFiredPriceAlertsUseCase,
  createDeletePriceAlertUseCase,
  createGetPriceAlertUseCase,
  createListPriceAlertsUseCase,
  createUpdatePriceAlertUseCase,
} from '../price-alerts/price-alert.use-cases.js';
import type { PriceAlertRouteDependencies } from '../price-alerts/price-alerts.routes.js';

export type PortfolioRouteParams = {
  readonly environment: Environment;
  readonly database: DatabaseHandle;
  readonly now: () => number;
};

// Alertas de preço (RF14) e ativos do usuário (RF15): o que é dele, com teto por usuário vindo do ambiente.
export function createPriceAlertDependencies(
  params: PortfolioRouteParams,
): PriceAlertRouteDependencies {
  const { database, environment } = params;
  const dependencies = {
    priceAlerts: createPriceAlertRepository(database),
    maxEnabled: environment.PRICE_ALERT_MAX_ENABLED_PER_USER,
  };
  return {
    enabledSymbols: environment.MARKET_SYMBOLS,
    createPriceAlert: createCreatePriceAlertUseCase(dependencies),
    listPriceAlerts: createListPriceAlertsUseCase(dependencies),
    getPriceAlert: createGetPriceAlertUseCase(dependencies),
    updatePriceAlert: createUpdatePriceAlertUseCase(dependencies),
    deletePriceAlert: createDeletePriceAlertUseCase(dependencies),
    clearFiredPriceAlerts: createClearFiredPriceAlertsUseCase(dependencies),
  };
}

export function createAssetDependencies(params: PortfolioRouteParams): AssetRouteDependencies {
  const { database, environment } = params;
  const assets = createUserAssetRepository(database);
  const dependencies = { assets, maxAssets: environment.USER_ASSET_MAX_PER_USER };
  return {
    enabledSymbols: environment.MARKET_SYMBOLS,
    listAssets: createListAssetsUseCase(dependencies),
    getAsset: createGetAssetUseCase(dependencies),
    replaceAsset: createReplaceAssetUseCase(dependencies),
    tradeAsset: createTradeAssetUseCase(dependencies),
    deleteAsset: createDeleteAssetUseCase(dependencies),
    getAssetSummary: createGetAssetSummaryUseCase({
      assets,
      strategies: createStrategyRepository(database),
      candles: createCandleRepository(database),
      sentiments: createSentimentObservationRepository(database),
      exchange: environment.MARKET_EXCHANGE,
      symbols: environment.MARKET_SYMBOLS,
      now: params.now,
      cache: createAssetRuleCache(),
    }),
  };
}
