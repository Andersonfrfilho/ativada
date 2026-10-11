// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  PRICE_ALERT_CREATE_OUTCOME,
  PRICE_ALERT_UPDATE_OUTCOME,
} from '../../../packages/database/src/price-alerts/price-alert.constant.js';
import type {
  PriceAlertRecord,
  PriceAlertRepository,
} from '../../../packages/database/src/price-alerts/price-alert.types.js';
import type { OwnerScope } from '../../../packages/database/src/ownership/owner-scope.js';
import type { UserId } from '../../../packages/database/src/ownership/user-id.js';

type Stored = { readonly userId: UserId; record: PriceAlertRecord };

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EPOCH_MILLISECONDS = 1_700_000_000_000;
const MILLISECONDS_PER_ROW = 1_000;

// O Postgres recusa texto que não é UUID (22P02, vira 500): a rota precisa barrar o id malformado ANTES de chegar aqui.
function assertUuid(alertId: unknown): void {
  if (typeof alertId !== 'string' || !UUID_SHAPE.test(alertId)) {
    throw new Error('invalid input syntax for type uuid');
  }
}

export type InMemoryPriceAlerts = {
  readonly repository: PriceAlertRepository;
  readonly allOf: (scope: OwnerScope) => readonly PriceAlertRecord[];
  // Como a avaliação do tick deixa o alerta: desligado, com o instante do disparo.
  readonly markTriggered: (alertId: string) => void;
};

// Espelha as regras do repositório real: tudo filtrado pelo dono, alerta alheio some como se não existisse, o teto vale
// para os LIGADOS (criar e religar), religar rearma e a página vai dos mais novos para os mais antigos.
export function createInMemoryPriceAlerts(): InMemoryPriceAlerts {
  const stored: Stored[] = [];
  let sequence = 0;

  function ownedBy(scope: OwnerScope): Stored[] {
    return stored.filter((entry) => entry.userId === scope.ownerUserId);
  }
  const enabledCount = (scope: OwnerScope): number =>
    ownedBy(scope).filter((entry) => entry.record.isEnabled).length;

  const repository: PriceAlertRepository = {
    createPriceAlert: (scope, params) => {
      if (enabledCount(scope) >= params.maxEnabled) {
        return Promise.resolve({ outcome: PRICE_ALERT_CREATE_OUTCOME.LIMIT_REACHED });
      }
      sequence += 1;
      const alert: PriceAlertRecord = {
        id: crypto.randomUUID(),
        symbol: params.symbol,
        direction: params.direction,
        value: params.value,
        origin: params.origin,
        isEnabled: true,
        triggeredAt: undefined,
        createdAt: new Date(EPOCH_MILLISECONDS + sequence * MILLISECONDS_PER_ROW),
      };
      stored.push({ userId: scope.ownerUserId, record: alert });
      return Promise.resolve({ outcome: PRICE_ALERT_CREATE_OUTCOME.CREATED, alert });
    },
    findPriceAlert: (scope, alertId) => {
      assertUuid(alertId);
      return Promise.resolve(ownedBy(scope).find((entry) => entry.record.id === alertId)?.record);
    },
    listPriceAlertsPage: (scope, params) => {
      const owned = ownedBy(scope)
        .map((entry) => entry.record)
        .reverse();
      const start =
        params.after === undefined ? 0 : owned.findIndex((row) => row.id === params.after?.id) + 1;
      const page = owned.slice(start, start + params.limit);
      const last = page.at(-1);
      const hasMore = start + params.limit < owned.length;
      return Promise.resolve({
        alerts: page,
        nextCursor:
          hasMore && last !== undefined
            ? { createdAt: last.createdAt.toISOString(), id: last.id }
            : undefined,
      });
    },
    updatePriceAlert: (scope, params) => {
      assertUuid(params.alertId);
      const entry = ownedBy(scope).find((candidate) => candidate.record.id === params.alertId);
      if (entry === undefined) {
        return Promise.resolve({ outcome: PRICE_ALERT_UPDATE_OUTCOME.NOT_FOUND });
      }
      const isRearming = params.patch.isEnabled === true && !entry.record.isEnabled;
      if (isRearming && enabledCount(scope) >= params.maxEnabled) {
        return Promise.resolve({ outcome: PRICE_ALERT_UPDATE_OUTCOME.LIMIT_REACHED });
      }
      const disabledByHand = ownedBy(scope).filter(
        (candidate) =>
          candidate !== entry &&
          !candidate.record.isEnabled &&
          candidate.record.triggeredAt === undefined,
      ).length;
      if (
        params.patch.isEnabled === false &&
        params.maxDisabled !== undefined &&
        disabledByHand >= params.maxDisabled
      ) {
        return Promise.resolve({ outcome: PRICE_ALERT_UPDATE_OUTCOME.DISABLED_LIMIT_REACHED });
      }
      entry.record = {
        ...entry.record,
        ...params.patch,
        ...(params.patch.isEnabled === true ? { triggeredAt: undefined } : {}),
      };
      return Promise.resolve({ outcome: PRICE_ALERT_UPDATE_OUTCOME.UPDATED, alert: entry.record });
    },
    deletePriceAlert: (scope, alertId) => {
      assertUuid(alertId);
      const index = stored.findIndex(
        (entry) => entry.userId === scope.ownerUserId && entry.record.id === alertId,
      );
      if (index === -1) return Promise.resolve(false);
      stored.splice(index, 1);
      return Promise.resolve(true);
    },
    deleteFiredPriceAlerts: (scope) => {
      const fired = stored.filter(
        (entry) => entry.userId === scope.ownerUserId && entry.record.triggeredAt !== undefined,
      );
      for (const entry of fired) stored.splice(stored.indexOf(entry), 1);
      return Promise.resolve(fired.length);
    },
  };
  return {
    repository,
    allOf: (scope) => ownedBy(scope).map((entry) => entry.record),
    markTriggered: (alertId): void => {
      const entry = stored.find((candidate) => candidate.record.id === alertId);
      if (entry === undefined) throw new Error('alerta desconhecido');
      entry.record = {
        ...entry.record,
        isEnabled: false,
        triggeredAt: new Date(EPOCH_MILLISECONDS),
      };
    },
  };
}
