// Copyright (c) 2026 Ada Technology. All rights reserved.
// Superfície pública de @crypto/database: só o que as apps podem usar (ADR 0001 §c e §e).
export { parseAccountId, type AccountId } from './admin/admin-account-id.js';
export { InvalidUserIdError } from './ownership/invalid-user-id.error.js';
export { createOwnerScope, type OwnerScope } from './ownership/owner-scope.js';
export type { UserId } from './ownership/user-id.js';
