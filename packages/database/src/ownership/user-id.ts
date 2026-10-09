// Copyright (c) 2026 Ada Technology. All rights reserved.
import { InvalidUserIdError } from './invalid-user-id.error.js';

declare const USER_ID_BRAND: unique symbol;

export type UserId = string & { readonly [USER_ID_BRAND]: 'UserId' };

const LOWERCASE_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Só o mapeamento de linha da tabela users cunha UserId; nunca a partir de payload, query ou path (ADR 0001).
export function userIdFromDatabase(value: string): UserId {
  if (!LOWERCASE_UUID_PATTERN.test(value)) throw new InvalidUserIdError();
  return value as UserId;
}
