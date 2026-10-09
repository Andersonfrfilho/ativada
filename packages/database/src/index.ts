// Copyright (c) 2026 Ada Technology. All rights reserved.
// Superfície pública de @crypto/database: só o que as apps podem usar (ADR 0001 §c e §e).
export { parseAccountId, type AccountId } from './admin/admin-account-id.js';
export {
  closeDatabase,
  openDatabase,
  pingDatabase,
  type DatabaseHandle,
} from './database-handle.js';
export { InvalidUserIdError } from './ownership/invalid-user-id.error.js';
export type { OwnerScope } from './ownership/owner-scope.js';
export type { UserId } from './ownership/user-id.js';
export { USER_RESOLUTION_STATUS } from './users/user-resolution.constant.js';
export { resolveUserBySubject, type UserResolution } from './users/resolve-user-by-subject.js';
