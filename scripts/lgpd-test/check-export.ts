// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Actor } from '../admin-test/admin-test-context.js';
import {
  PERSISTENCE_TABLES,
  SEEDED_REQUEST,
} from '../../packages/database/test-support/persistence-lgpd-checks.js';
import { assertCondition } from '../identity-test/identity-test.error.js';
import { expectedRowsOf } from './expected-rows.js';
import { readUserId } from './database-reads.js';
import {
  CHAT_OF_A,
  CHAT_OF_B,
  EXPORT_PATH,
  NAME_OF_A,
  NAME_OF_B,
  SECONDS_PER_HOUR,
} from './lgpd-test.constant.js';
import { reportLgpdStep, type LgpdContext, type LgpdOwners } from './lgpd-test-context.js';

type ExportBody = {
  readonly data: {
    readonly account: Record<string, unknown>;
    readonly tables: Record<string, readonly Record<string, unknown>[]>;
    readonly auditEvents: {
      readonly asActor: readonly Record<string, unknown>[];
      readonly asTarget: readonly Record<string, unknown>[];
    };
  };
};

type ExportResponse = {
  readonly status: number;
  readonly headers: Headers;
  readonly text: string;
};

type Side = { readonly actor: Actor; readonly name: string; readonly chat: string };

async function fetchExport(context: LgpdContext, actor: Actor): Promise<ExportResponse> {
  const response = await fetch(`${context.api.baseUrl}${EXPORT_PATH}`, {
    headers: { Authorization: `Bearer ${actor.accessToken}` },
  });
  return { status: response.status, headers: response.headers, text: await response.text() };
}

function assertAttachmentHeaders(headers: Headers): void {
  assertCondition(
    headers.get('cache-control') === 'no-store',
    'Cache-Control deveria ser no-store',
  );
  const disposition = headers.get('content-disposition') ?? '';
  assertCondition(
    /^attachment; filename="cryptoada-export-\d{4}-\d{2}-\d{2}\.json"$/.test(disposition),
    `Content-Disposition: ${disposition}`,
  );
}

function assertOwnData(response: ExportResponse, own: Side): ExportBody {
  assertCondition(response.status === 200, `exportação: ${response.status} ${response.text}`);
  const body = JSON.parse(response.text) as ExportBody;
  const { account, tables } = body.data;
  assertCondition(account['email'] === own.actor.email, 'e-mail do Keycloak ausente');
  assertCondition(account['displayName'] === own.name, 'perfil ausente');
  assertCondition(account['telegramChatId'] === own.chat, 'chat ausente');
  const codes = tables['telegram_link_codes'] ?? [];
  assertCondition(codes.length === 1, `códigos pendentes na exportação: ${codes.length}`);
  const columns = Object.keys(codes[0] ?? {})
    .sort()
    .join();
  assertCondition(columns === 'attempts,createdAt,expiresAt', `colunas do código: ${columns}`);
  assertCondition(!('deletedAt' in account), 'o estado de exclusão da conta não é exportado');
  assertPersistenceTables(tables);
  return body;
}

function assertPersistenceTables(tables: ExportBody['data']['tables']): void {
  for (const table of PERSISTENCE_TABLES) {
    const count = tables[table]?.length ?? -1;
    assertCondition(count === expectedRowsOf(table), `exportação de ${table}: ${count}`);
  }
  const examples = (tables['strategies'] ?? []).filter((row) => row['isExample'] === true);
  assertCondition(examples.length === 1, `estratégia de exemplo na exportação: ${examples.length}`);
  const request = JSON.stringify(tables['runs']?.[0]?.['request']);
  assertCondition(
    request === JSON.stringify(SEEDED_REQUEST),
    `a exportação da execução não traz o pedido (grade e janelas): ${request}`,
  );
}

async function assertNothingForeign(
  context: LgpdContext,
  params: { readonly text: string; readonly own: Side; readonly other: Side },
): Promise<void> {
  const { text, own, other } = params;
  const otherUserId = await readUserId(context, other.actor.keycloakId);
  const ownUserId = await readUserId(context, own.actor.keycloakId);
  const foreign = [other.actor.email, other.actor.keycloakId, otherUserId, other.name, other.chat];
  const internal = [
    own.actor.keycloakId,
    ownUserId,
    'keycloak',
    'codeHash',
    'code_hash',
    'engineState',
    'engine_state',
    'configHash',
    'runHash',
  ];
  for (const value of foreign) {
    assertCondition(!text.includes(value), 'a exportação vazou dado do outro usuário');
  }
  for (const value of internal) {
    assertCondition(!text.includes(value), `a exportação carregou dado interno: ${value}`);
  }
}

function assertAuditAsTarget(body: ExportBody): void {
  const targeted = body.data.auditEvents.asTarget;
  assertCondition(
    targeted.length === 2 && targeted.every((event) => event['actorKind'] === 'admin'),
    `auditoria como alvo (bloquear e desbloquear): ${targeted.length}`,
  );
  assertCondition(
    targeted.every((event) => !('ip' in event) && !('actorUserId' in event)),
    'o alvo não pode receber o IP nem o id do admin',
  );
}

export async function checkExports(context: LgpdContext, owners: LgpdOwners): Promise<void> {
  const sideOfA: Side = { actor: owners.ownerA, name: NAME_OF_A, chat: CHAT_OF_A };
  const sideOfB: Side = { actor: owners.ownerB, name: NAME_OF_B, chat: CHAT_OF_B };
  const exportOfA = await fetchExport(context, owners.ownerA);
  assertAttachmentHeaders(exportOfA.headers);
  const bodyOfA = assertOwnData(exportOfA, sideOfA);
  await assertNothingForeign(context, { text: exportOfA.text, own: sideOfA, other: sideOfB });
  assertAuditAsTarget(bodyOfA);
  reportLgpdStep(
    'GET /v1/me/export de A',
    'attachment no-store com perfil, e-mail, chat, código pendente (sem hash), as 12 tabelas de estratégia/execução/resultado/alerta/meta (sem estado do motor) e a auditoria como alvo sem IP do admin; nada de B',
  );
  const exportOfB = await fetchExport(context, owners.ownerB);
  assertOwnData(exportOfB, sideOfB);
  await assertNothingForeign(context, { text: exportOfB.text, own: sideOfB, other: sideOfA });
  reportLgpdStep('GET /v1/me/export de B', 'só os dados de B; nada de A');
  const repeated = await fetchExport(context, owners.ownerA);
  const retryAfter = Number(repeated.headers.get('retry-after'));
  assertCondition(repeated.status === 429, `segunda exportação na mesma hora: ${repeated.status}`);
  assertCondition(retryAfter > 0 && retryAfter <= SECONDS_PER_HOUR, `Retry-After: ${retryAfter}`);
  reportLgpdStep(
    'rate limit',
    `a segunda exportação de A na mesma hora responde 429, Retry-After ${retryAfter}s`,
  );
}
