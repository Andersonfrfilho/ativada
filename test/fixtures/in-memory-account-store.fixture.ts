// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  AccountDeletionRepository,
  AccountExportChunk,
  AccountExportRepository,
  AuditEventInput,
  AuditEventRepository,
  ExportRow,
} from '../../packages/database/src/index.js';
import type { OwnerScope } from '../../packages/database/src/ownership/owner-scope.js';
import type { UserId } from '../../packages/database/src/ownership/user-id.js';
import type { StoredLinkCode } from './in-memory-telegram-store.fixture.js';
import type { StoredUser } from './in-memory-user-store.fixture.js';

const DEFAULT_PAGE_SIZE = 500;

export const LINK_CODE_CREATED_AT = new Date('2026-10-02T09:00:00.000Z');

export type InMemoryAccountStore = {
  readonly exports: AccountExportRepository;
  readonly deletions: AccountDeletionRepository;
  readonly audit: AuditEventRepository;
  readonly auditLog: AuditEventInput[];
  readonly exportCalls: UserId[];
  // Linhas extras por tabela do dono (a exportação as pagina); `pagesRead` anota o tamanho de cada página lida.
  readonly bulk: Map<string, ExportRow[]>;
  readonly pagesRead: number[];
  // Quantas leituras paginadas foram ENCERRADAS (terminaram ou foram canceladas): a que o cliente largou também fecha.
  readonly closedReads: { count: number };
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
  const bulk = new Map<string, ExportRow[]>();
  const pagesRead: number[] = [];
  const closedReads = { count: 0 };
  const repositoryRead = (scope: OwnerScope): Promise<ExportRow | undefined> => {
    const user = users.get(scope.ownerUserId);
    return Promise.resolve(user === undefined ? undefined : toAccountRow(user));
  };

  function ownerTables(scope: OwnerScope): Map<string, readonly ExportRow[]> {
    const code = linkCodes.get(scope.ownerUserId);
    const tables = new Map<string, readonly ExportRow[]>();
    tables.set(
      'telegram_link_codes',
      code === undefined
        ? []
        : [{ expiresAt: code.expiresAt, attempts: code.attempts, createdAt: LINK_CODE_CREATED_AT }],
    );
    for (const [name, rows] of bulk) tables.set(name, rows);
    return tables;
  }

  // Paginado como o repositório de verdade: cada página é uma "consulta" (anotada em `pagesRead` com o tamanho).
  async function* pagesOf(scope: OwnerScope, pageSize: number): AsyncGenerator<AccountExportChunk> {
    try {
      yield* pagesBody(scope, pageSize);
    } finally {
      closedReads.count += 1;
    }
  }

  async function* pagesBody(
    scope: OwnerScope,
    pageSize: number,
  ): AsyncGenerator<AccountExportChunk> {
    for (const [table, rows] of ownerTables(scope)) {
      for (let start = 0; start < rows.length; start += pageSize) {
        const page = rows.slice(start, start + pageSize);
        pagesRead.push(page.length);
        yield { kind: 'rows', table, rows: page };
        await Promise.resolve();
      }
    }
    const actor = auditLog.filter((e) => e.actorUserId === scope.ownerUserId).map(toActorRow);
    const target = auditLog
      .filter((e) => e.targetId === scope.ownerUserId && e.actorUserId !== scope.ownerUserId)
      .map(toTargetRow);
    if (actor.length > 0) yield { kind: 'audit', audience: 'asActor', rows: actor };
    if (target.length > 0) yield { kind: 'audit', audience: 'asTarget', rows: target };
  }
  return {
    auditLog,
    exportCalls,
    bulk,
    pagesRead,
    closedReads,
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
      readAccount: (scope): Promise<ExportRow | undefined> => {
        exportCalls.push(scope.ownerUserId);
        const user = users.get(scope.ownerUserId);
        return Promise.resolve(user === undefined ? undefined : toAccountRow(user));
      },
      streamOwnerRows: (scope, options): AsyncIterable<AccountExportChunk> =>
        pagesOf(scope, options?.pageSize ?? DEFAULT_PAGE_SIZE),
      exportOwnerData: async (scope): ReturnType<AccountExportRepository['exportOwnerData']> => {
        const account = await repositoryRead(scope);
        if (account === undefined) return undefined;
        const tables: Record<string, ExportRow[]> = { telegram_link_codes: [] };
        const auditEvents = { asActor: [] as ExportRow[], asTarget: [] as ExportRow[] };
        for await (const chunk of pagesOf(scope, DEFAULT_PAGE_SIZE)) {
          if (chunk.kind === 'rows') (tables[chunk.table] ??= []).push(...chunk.rows);
          else auditEvents[chunk.audience].push(...chunk.rows);
        }
        return { account, tables, auditEvents };
      },
    },
  };
}
