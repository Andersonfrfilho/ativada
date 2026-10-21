// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { UserId } from '../ownership/user-id.js';
import type { DisplayCurrency } from './display-currency.constant.js';

export type ProfileRecord = {
  readonly id: UserId;
  readonly displayName: string | undefined;
  readonly displayCurrency: DisplayCurrency;
  readonly timezone: string;
  readonly alertTelegramEnabled: boolean;
  readonly isTelegramLinked: boolean;
  // Teto do usuário de simulações ao vivo na fila ou rodando (`users.limits`, com o padrão quando inválido).
  readonly maxActiveLivePaperRuns: number;
  readonly createdAt: Date;
};

export type ProfilePatch = {
  readonly displayName?: string | null;
  readonly displayCurrency?: DisplayCurrency;
  readonly timezone?: string;
  readonly alertTelegramEnabled?: boolean;
};
