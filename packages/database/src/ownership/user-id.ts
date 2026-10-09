// Copyright (c) 2026 Ada Technology. All rights reserved.
import { LOWERCASE_UUID_PATTERN } from '../database.constant.js';
import { InvalidUserIdError } from './invalid-user-id.error.js';

declare const USER_ID_BRAND: unique symbol;

export type UserId = string & { readonly [USER_ID_BRAND]: 'UserId' };

// Interno ao pacote: só o mapeamento de linha de users cunha UserId, nunca payload, query ou path (ADR 0001 §c).
export function userIdFromDatabase(value: string): UserId {
  if (!LOWERCASE_UUID_PATTERN.test(value)) throw new InvalidUserIdError();
  return value as UserId;
}
