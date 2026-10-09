// Copyright (c) 2026 Ada Technology. All rights reserved.
import { assertCondition } from '../identity-test/identity-test.error.js';
import { reportAdminStep, type AdminTestContext, type TestActors } from './admin-test-context.js';

const EXPECTED_ACTIONS: readonly string[] = [
  'invitation.sent',
  'invitation.sent',
  'account.blocked',
  'account.unblocked',
];

type AuditRow = {
  readonly action: string;
  readonly actor_kind: string;
  readonly ip: string | null;
  readonly payload_type: string;
  readonly payload_text: string;
};

export async function checkAuditTrail(context: AdminTestContext): Promise<void> {
  const rows: unknown = await context.sql`
    SELECT action, actor_kind, host(ip) AS ip, jsonb_typeof(payload) AS payload_type,
           payload::text AS payload_text
    FROM audit_events ORDER BY created_at, id`;
  const events = rows as readonly AuditRow[];
  assertCondition(
    events.map((event) => event.action).join() === EXPECTED_ACTIONS.join(),
    `ações auditadas: ${events.map((event) => event.action).join()}`,
  );
  for (const event of events) {
    assertCondition(event.actor_kind === 'admin' && event.ip !== null, 'ator ou IP ausente');
    assertCondition(event.payload_type === 'object', 'payload não é objeto jsonb');
    assertCondition(!/@|example\.test/.test(event.payload_text), 'dado pessoal no payload');
  }
  reportAdminStep(
    'audit_events',
    `${events.length} ações de admin com ator, IP e payload sem dado pessoal`,
  );
}

export function checkLogsAreClean(
  context: AdminTestContext,
  params: { readonly actors: TestActors; readonly secrets: readonly string[] },
): void {
  const log = context.api.logLines.join('');
  const emails = [params.actors.admin, params.actors.otherAdmin, params.actors.member].map(
    (actor) => actor.email,
  );
  const forbidden = [
    ...emails,
    ...params.secrets,
    params.actors.admin.accessToken,
    params.actors.member.accessToken,
    '@example.test',
  ];
  for (const secret of forbidden) {
    assertCondition(
      secret.length === 0 || !log.includes(secret),
      'dado sensível apareceu no log da API',
    );
  }
  reportAdminStep('log', 'nenhum e-mail, token, chat, código nem segredo nos logs da API');
}
