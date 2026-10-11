// Copyright (c) 2026 Ada Technology. All rights reserved.
import { priceAlerts } from '../schema/price-alerts.schema.js';
import type { PriceAlertDirection, PriceAlertOrigin } from './price-alert.constant.js';
import type { PriceAlertRecord } from './price-alert.types.js';

export const PRICE_ALERT_COLUMNS = {
  id: priceAlerts.id,
  symbol: priceAlerts.symbol,
  direction: priceAlerts.direction,
  value: priceAlerts.value,
  origin: priceAlerts.origin,
  isEnabled: priceAlerts.isEnabled,
  triggeredAt: priceAlerts.triggeredAt,
  createdAt: priceAlerts.createdAt,
} as const;

type PriceAlertRow = Omit<typeof priceAlerts.$inferSelect, 'userId' | 'lastFiredAt'>;

// Os CHECKs do banco garantem os vocabulários; o mapeamento só os estreita para o tipo.
export function toPriceAlertRecord(row: PriceAlertRow): PriceAlertRecord {
  return {
    id: row.id,
    symbol: row.symbol,
    direction: row.direction as PriceAlertDirection,
    value: row.value,
    origin: row.origin as PriceAlertOrigin,
    isEnabled: row.isEnabled,
    triggeredAt: row.triggeredAt ?? undefined,
    createdAt: row.createdAt,
  };
}
