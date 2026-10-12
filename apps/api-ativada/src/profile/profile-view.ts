// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ProfileRecord } from '@ativada/database';

export type ProfileView = {
  readonly id: string;
  readonly displayName: string | null;
  readonly displayCurrency: string;
  readonly timezone: string;
  readonly alertTelegramEnabled: boolean;
  readonly telegramLinked: boolean;
  readonly createdAt: string;
};

export function toProfileView(record: ProfileRecord): ProfileView {
  return {
    id: record.id,
    displayName: record.displayName ?? null,
    displayCurrency: record.displayCurrency,
    timezone: record.timezone,
    alertTelegramEnabled: record.alertTelegramEnabled,
    telegramLinked: record.isTelegramLinked,
    createdAt: record.createdAt.toISOString(),
  };
}
