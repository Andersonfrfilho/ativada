// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  AccountDeletionRepository,
  AccountExportRepository,
  AuditEventInput,
  AuditEventRepository,
  ExportRow,
} from '../../packages/database/src/index.js';
import type { UserId } from '../../packages/database/src/ownership/user-id.js';
import type { StoredLinkCode } from './in-memory-telegram-store.fixture.js';
import type { StoredUser } from './in-memory-user-store.fixture.js';

export const LINK_CODE_CREATED_AT = new Date('2026-10-02T09:00:00.000Z');

export type InMemoryAccountStore = {
  readonly exports: AccountExportRepository;
  readonly deletions: AccountDeletionRepository;
  readonly audit: AuditEventRepository;
  readonly auditLog: AuditEventInput[];
  readonly exportCalls: UserId[];
};

export type InMemoryAccountStoreParams = {
  readonly users: Map<UserId, StoredUser>;
  readonly linkCodes: Map<UserId, StoredLinkCode>;
  readonly events: string[];
};

function toAccountRow(user: StoredUser): ExportRow {
  return {
    displayName: user.displayName ?? null,
    displayCurrency: user.displayCurrency,
    timezone: user.timezone,
    telegramChatId: user.telegramChatId ?? null,
    alertTelegramEnabled: user.alertTelegramEnabled,
    createdAt: user.createdAt,
  };
}

function toActorRow(event: AuditEventInput): ExportRow {
  return {
    actorKind: event.actorKind,
    targetKind: event.targetKind,
    action: event.action,
    ip: event.ip ?? null,
    payload: event.payload,
  };
}

function toTargetRow(event: AuditEventInput): ExportRow {
  return {
    actorKind: event.actorKind,
    targetKind: event.targetKind,
    action: event.action,
    payload: event.payload,
  };
}

export function createInMemoryAccountStore(
  params: InMemoryAccountStoreParams,
): InMemoryAccountStore {
  const { users, linkCodes, events } = params;
  const auditLog: AuditEventInput[] = [];
  const exportCalls: UserId[] = [];
  return {
    auditLog,
    exportCalls,
    audit: {
      record: (event): Promise<void> => {
        events.push(`audit:${event.action}`);
        auditLog.push(structuredClone(event));
        return Promise.resolve();
      },
    },
    deletions: {
      markDeleted: (scope): Promise<Date | undefined> => {
        const user = users.get(scope.ownerUserId);
        if (user === undefined) return Promise.resolve(undefined);
        user.deletedAt ??= new Date();
        events.push(`database:deleted:${user.id}`);
        return Promise.resolve(user.deletedAt);
      },
    },
    exports: {
      exportOwnerData: (scope): ReturnType<AccountExportRepository['exportOwnerData']> => {
        exportCalls.push(scope.ownerUserId);
        const user = users.get(scope.ownerUserId);
        if (user === undefined) return Promise.resolve(undefined);
        const code = linkCodes.get(scope.ownerUserId);
        return Promise.resolve({
          account: toAccountRow(user),
          tables: {
            telegram_link_codes:
              code === undefined
                ? []
                : [
                    {
                      expiresAt: code.expiresAt,
                      attempts: code.attempts,
                      createdAt: LINK_CODE_CREATED_AT,
                    },
                  ],
          },
          auditEvents: {
            asActor: auditLog.filter((e) => e.actorUserId === scope.ownerUserId).map(toActorRow),
            asTarget: auditLog
              .filter(
                (e) => e.targetId === scope.ownerUserId && e.actorUserId !== scope.ownerUserId,
              )
              .map(toTargetRow),
          },
        });
      },
    },
  };
}
