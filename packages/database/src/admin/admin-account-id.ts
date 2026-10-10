// Copyright (c) 2026 Ada Technology. All rights reserved.
import { LOWERCASE_UUID_PATTERN } from '../database.constant.js';

declare const ACCOUNT_ID_BRAND: unique symbol;

// Alvo de ação administrativa: vem da requisição e por isso nunca vira escopo de dono (ADR 0001 §f).
export type AccountId = string & { readonly [ACCOUNT_ID_BRAND]: 'AccountId' };

export function parseAccountId(value: string): AccountId | undefined {
  return LOWERCASE_UUID_PATTERN.test(value) ? (value as AccountId) : undefined;
}

export const INVALID_USER_ID_MESSAGE = 'users.id fora do formato UUID em minúsculas';
