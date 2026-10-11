// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  PRICE_ALERT_CREATE_OUTCOME,
  PRICE_ALERT_UPDATE_OUTCOME,
  type OwnerScope,
  type PriceAlertCursor,
  type PriceAlertPatch,
  type PriceAlertRepository,
} from '@cryptoada/database';

import { encodePriceAlertCursor } from './price-alert-cursor.js';
import type { CreatePriceAlertBody, PatchPriceAlertBody } from './price-alert-requests.js';
import { toPriceAlertView, type PriceAlertView } from './price-alert-views.js';
import { PriceAlertLimitReachedError, PriceAlertNotFoundError } from './price-alert.error.js';

export type PriceAlertUseCaseDependencies = {
  readonly priceAlerts: PriceAlertRepository;
  readonly maxEnabled: number;
};

export type PriceAlertPageInput = {
  readonly limit: number;
  readonly after: PriceAlertCursor | undefined;
};

export type PriceAlertPageOutput = {
  readonly items: readonly PriceAlertView[];
  readonly nextCursor: string | null;
  readonly perPage: number;
};

export type CreatePriceAlertUseCase = (
  scope: OwnerScope,
  body: CreatePriceAlertBody,
) => Promise<PriceAlertView>;
export type ListPriceAlertsUseCase = (
  scope: OwnerScope,
  page: PriceAlertPageInput,
) => Promise<PriceAlertPageOutput>;
export type GetPriceAlertUseCase = (scope: OwnerScope, alertId: string) => Promise<PriceAlertView>;
export type UpdatePriceAlertUseCase = (
  scope: OwnerScope,
  input: { readonly alertId: string; readonly patch: PatchPriceAlertBody },
) => Promise<PriceAlertView>;
export type DeletePriceAlertUseCase = (scope: OwnerScope, alertId: string) => Promise<void>;

export function createCreatePriceAlertUseCase(
  dependencies: PriceAlertUseCaseDependencies,
): CreatePriceAlertUseCase {
  return async (scope, body) => {
    const created = await dependencies.priceAlerts.createPriceAlert(scope, {
      ...body,
      maxEnabled: dependencies.maxEnabled,
    });
    if (created.outcome === PRICE_ALERT_CREATE_OUTCOME.LIMIT_REACHED) {
      throw new PriceAlertLimitReachedError();
    }
    return toPriceAlertView(created.alert);
  };
}

export function createListPriceAlertsUseCase(
  dependencies: PriceAlertUseCaseDependencies,
): ListPriceAlertsUseCase {
  return async (scope, page) => {
    const result = await dependencies.priceAlerts.listPriceAlertsPage(scope, page);
    return {
      items: result.alerts.map(toPriceAlertView),
      nextCursor:
        result.nextCursor === undefined ? null : encodePriceAlertCursor(result.nextCursor),
      perPage: page.limit,
    };
  };
}

export function createGetPriceAlertUseCase(
  dependencies: PriceAlertUseCaseDependencies,
): GetPriceAlertUseCase {
  return async (scope, alertId) => {
    const alert = await dependencies.priceAlerts.findPriceAlert(scope, alertId);
    if (alert === undefined) throw new PriceAlertNotFoundError();
    return toPriceAlertView(alert);
  };
}

// O PATCH grava só o que veio: campo ausente fica como está, nunca vira NULL.
function definedFields(patch: PatchPriceAlertBody): PriceAlertPatch {
  return {
    ...(patch.direction === undefined ? {} : { direction: patch.direction }),
    ...(patch.value === undefined ? {} : { value: patch.value }),
    ...(patch.isEnabled === undefined ? {} : { isEnabled: patch.isEnabled }),
  };
}

export function createUpdatePriceAlertUseCase(
  dependencies: PriceAlertUseCaseDependencies,
): UpdatePriceAlertUseCase {
  return async (scope, input) => {
    const result = await dependencies.priceAlerts.updatePriceAlert(scope, {
      alertId: input.alertId,
      patch: definedFields(input.patch),
      maxEnabled: dependencies.maxEnabled,
    });
    if (result.outcome === PRICE_ALERT_UPDATE_OUTCOME.NOT_FOUND)
      throw new PriceAlertNotFoundError();
    if (result.outcome === PRICE_ALERT_UPDATE_OUTCOME.LIMIT_REACHED) {
      throw new PriceAlertLimitReachedError();
    }
    return toPriceAlertView(result.alert);
  };
}

export function createDeletePriceAlertUseCase(
  dependencies: PriceAlertUseCaseDependencies,
): DeletePriceAlertUseCase {
  return async (scope, alertId) => {
    const isDeleted = await dependencies.priceAlerts.deletePriceAlert(scope, alertId);
    if (!isDeleted) throw new PriceAlertNotFoundError();
  };
}
