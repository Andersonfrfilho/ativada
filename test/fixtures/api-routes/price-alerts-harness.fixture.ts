// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Route } from '../../../apps/api-cryptoada/src/router/route.types.js';
import {
  createInMemoryPriceAlerts,
  type InMemoryPriceAlerts,
} from './in-memory-price-alerts.fixture.js';
import { createRunsHarness, type RunsHarness } from './runs-harness.fixture.js';

export type PriceAlertsHarness = RunsHarness & { readonly priceAlerts: InMemoryPriceAlerts };

export async function createPriceAlertsHarness(
  options: { readonly maxEnabled?: number; readonly maxDisabled?: number } = {},
): Promise<PriceAlertsHarness> {
  const priceAlerts = createInMemoryPriceAlerts();
  const harness = await createRunsHarness({
    extraRoutes: (app): readonly Route[] => {
      const useCases = app.priceAlertUseCases;
      const base = {
        priceAlerts: priceAlerts.repository,
        maxEnabled: options.maxEnabled ?? 50,
        maxDisabled: options.maxDisabled ?? 1_000,
      };
      return app.priceAlertRoutes.createPriceAlertRoutes({
        enabledSymbols: ['BTCUSDT', 'ETHUSDT'],
        createPriceAlert: useCases.createCreatePriceAlertUseCase(base),
        listPriceAlerts: useCases.createListPriceAlertsUseCase(base),
        getPriceAlert: useCases.createGetPriceAlertUseCase(base),
        updatePriceAlert: useCases.createUpdatePriceAlertUseCase(base),
        deletePriceAlert: useCases.createDeletePriceAlertUseCase(base),
        clearFiredPriceAlerts: useCases.createClearFiredPriceAlertsUseCase(base),
      });
    },
  });
  return { ...harness, priceAlerts };
}
