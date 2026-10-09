// Copyright (c) 2026 Ada Technology. All rights reserved.
import { eq, type Column, type SQL } from 'drizzle-orm';

import type { UserId } from './user-id.js';

declare const OWNER_SCOPE_BRAND: unique symbol;

export type OwnerScope = {
  readonly ownerUserId: UserId;
  readonly [OWNER_SCOPE_BRAND]: 'OwnerScope';
};

export function createOwnerScope(ownerUserId: UserId): OwnerScope {
  return Object.freeze({ ownerUserId }) as OwnerScope;
}

export function ownerCondition(scope: OwnerScope, userIdColumn: Column): SQL {
  return eq(userIdColumn, scope.ownerUserId);
}
