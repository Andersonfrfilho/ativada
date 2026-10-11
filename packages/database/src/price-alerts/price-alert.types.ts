// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OwnerScope } from '../ownership/owner-scope.js';
import type {
  PRICE_ALERT_CREATE_OUTCOME,
  PRICE_ALERT_UPDATE_OUTCOME,
  PriceAlertDirection,
  PriceAlertOrigin,
} from './price-alert.constant.js';

// `value` é texto decimal exato (o `numeric` do banco): nenhum preço passa por `number`.
export type PriceAlertRecord = {
  readonly id: string;
  readonly symbol: string;
  readonly direction: PriceAlertDirection;
  readonly value: string;
  readonly origin: PriceAlertOrigin;
  readonly isEnabled: boolean;
  readonly triggeredAt: Date | undefined;
  readonly createdAt: Date;
};

export type PriceAlertFields = {
  readonly symbol: string;
  readonly direction: PriceAlertDirection;
  readonly value: string;
  readonly origin: PriceAlertOrigin;
};

// `maxEnabled`: o teto de alertas LIGADOS do dono, conferido sob trava na MESMA transação do INSERT.
export type CreatePriceAlertParams = PriceAlertFields & { readonly maxEnabled: number };

export type CreatePriceAlertResult =
  | {
      readonly outcome: typeof PRICE_ALERT_CREATE_OUTCOME.CREATED;
      readonly alert: PriceAlertRecord;
    }
  | { readonly outcome: typeof PRICE_ALERT_CREATE_OUTCOME.LIMIT_REACHED };

// Religar (`isEnabled: true`) REARMA: limpa o disparo anterior e também respeita o teto.
export type PriceAlertPatch = Partial<{
  readonly direction: PriceAlertDirection;
  readonly value: string;
  readonly isEnabled: boolean;
}>;

export type UpdatePriceAlertParams = {
  readonly alertId: string;
  readonly patch: PriceAlertPatch;
  readonly maxEnabled: number;
};

export type UpdatePriceAlertResult =
  | {
      readonly outcome: typeof PRICE_ALERT_UPDATE_OUTCOME.UPDATED;
      readonly alert: PriceAlertRecord;
    }
  | { readonly outcome: typeof PRICE_ALERT_UPDATE_OUTCOME.NOT_FOUND }
  | { readonly outcome: typeof PRICE_ALERT_UPDATE_OUTCOME.LIMIT_REACHED };

export type PriceAlertCursor = { readonly createdAt: string; readonly id: string };

export type ListPriceAlertsParams = {
  readonly limit: number;
  readonly after: PriceAlertCursor | undefined;
};

export type PriceAlertsPage = {
  readonly alerts: readonly PriceAlertRecord[];
  readonly nextCursor: PriceAlertCursor | undefined;
};

// Toda leitura e escrita é filtrada pelo dono; alerta alheio ou inexistente é `undefined` / `not_found`, sem distinção.
export type PriceAlertRepository = {
  readonly createPriceAlert: (
    scope: OwnerScope,
    params: CreatePriceAlertParams,
  ) => Promise<CreatePriceAlertResult>;
  readonly findPriceAlert: (
    scope: OwnerScope,
    alertId: string,
  ) => Promise<PriceAlertRecord | undefined>;
  readonly listPriceAlertsPage: (
    scope: OwnerScope,
    params: ListPriceAlertsParams,
  ) => Promise<PriceAlertsPage>;
  readonly updatePriceAlert: (
    scope: OwnerScope,
    params: UpdatePriceAlertParams,
  ) => Promise<UpdatePriceAlertResult>;
  readonly deletePriceAlert: (scope: OwnerScope, alertId: string) => Promise<boolean>;
  // Limpeza: apaga os alertas do dono que já dispararam (têm `triggeredAt`) e devolve quantos. Armados e desligados à mão ficam.
  readonly deleteFiredPriceAlerts: (scope: OwnerScope) => Promise<number>;
};
