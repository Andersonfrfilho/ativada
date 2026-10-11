// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { PriceAlertRecord } from '@cryptoada/database';

// O que a API devolve: sem dono (dado interno que a exportação também não leva).
export type PriceAlertView = {
  readonly id: string;
  readonly symbol: string;
  readonly direction: string;
  readonly value: string;
  readonly origin: string;
  readonly isEnabled: boolean;
  readonly triggeredAt: string | null;
  readonly createdAt: string;
};

export function toPriceAlertView(record: PriceAlertRecord): PriceAlertView {
  return {
    id: record.id,
    symbol: record.symbol,
    direction: record.direction,
    value: record.value,
    origin: record.origin,
    isEnabled: record.isEnabled,
    triggeredAt: record.triggeredAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}
