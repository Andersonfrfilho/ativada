// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  ProfilePatch,
  ProfileRecord,
  ProfileRepository,
} from '../../packages/database/src/index.js';
import { DISPLAY_CURRENCY } from '../../packages/database/src/users/display-currency.constant.js';
import type { OwnerScope } from '../../packages/database/src/ownership/owner-scope.js';
import { userIdFromDatabase } from '../../packages/database/src/ownership/user-id.js';
import type { UserId } from '../../packages/database/src/ownership/user-id.js';

export type StoredUser = {
  readonly id: UserId;
  readonly keycloakSubject: string;
  displayName: string | undefined;
  displayCurrency: ProfileRecord['displayCurrency'];
  timezone: string;
  alertTelegramEnabled: boolean;
  telegramChatId: string | undefined;
  readonly createdAt: Date;
};

export type InMemoryUserStore = {
  readonly users: Map<UserId, StoredUser>;
  readonly seedUser: (params: { readonly id: string; readonly subject: string }) => StoredUser;
  readonly profiles: ProfileRepository;
};

function toRecord(stored: StoredUser): ProfileRecord {
  return {
    id: stored.id,
    displayName: stored.displayName,
    displayCurrency: stored.displayCurrency,
    timezone: stored.timezone,
    alertTelegramEnabled: stored.alertTelegramEnabled,
    isTelegramLinked: stored.telegramChatId !== undefined,
    createdAt: stored.createdAt,
  };
}

function applyPatch(stored: StoredUser, patch: ProfilePatch): void {
  if (patch.displayName !== undefined) stored.displayName = patch.displayName ?? undefined;
  if (patch.displayCurrency !== undefined) stored.displayCurrency = patch.displayCurrency;
  if (patch.timezone !== undefined) stored.timezone = patch.timezone;
  if (patch.alertTelegramEnabled !== undefined) {
    stored.alertTelegramEnabled = patch.alertTelegramEnabled;
  }
}

export function createInMemoryUserStore(): InMemoryUserStore {
  const users = new Map<UserId, StoredUser>();

  function findOwned(scope: OwnerScope): StoredUser | undefined {
    return users.get(scope.ownerUserId);
  }

  return {
    users,
    seedUser: ({ id, subject }): StoredUser => {
      const stored: StoredUser = {
        id: userIdFromDatabase(id),
        keycloakSubject: subject,
        displayName: undefined,
        displayCurrency: DISPLAY_CURRENCY.BRL,
        timezone: 'America/Sao_Paulo',
        alertTelegramEnabled: true,
        telegramChatId: undefined,
        createdAt: new Date('2026-10-01T12:00:00.000Z'),
      };
      users.set(stored.id, stored);
      return stored;
    },
    profiles: {
      findProfile: (scope): Promise<ProfileRecord | undefined> => {
        const stored = findOwned(scope);
        return Promise.resolve(stored === undefined ? undefined : toRecord(stored));
      },
      updateProfile: (scope, patch): Promise<ProfileRecord | undefined> => {
        const stored = findOwned(scope);
        if (stored === undefined) return Promise.resolve(undefined);
        applyPatch(stored, patch);
        return Promise.resolve(toRecord(stored));
      },
    },
  };
}
