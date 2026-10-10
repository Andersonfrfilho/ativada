// Copyright (c) 2026 Ada Technology. All rights reserved.
import { assertCondition } from '../live-test/live-test-context.js';
import { reportLine, type StreamApiContext } from './stream-api-context.js';
import { PING_INTERVAL_SECONDS, SHORT_TOKEN_SECONDS, SUBJECT } from './stream-api-test.constant.js';

const ADMIN_CLAIMS = { realm_access: { roles: ['user', 'admin'] }, acr: '2' } as const;
const SECOND = 1_000;
const WAIT_FOR_RENEWED_MILLISECONDS = 8_000;

type IdRow = { readonly id: string };

async function accountIdOf(context: StreamApiContext, subject: string): Promise<string> {
  const rows: unknown = await context.api.client.unsafe(
    'SELECT id::text AS id FROM users WHERE keycloak_sub = $1',
    [subject],
  );
  const id = (rows as readonly IdRow[])[0]?.id;
  if (id === undefined) throw new Error('usuário sem linha');
  return id;
}

async function checkTokenExpiry(context: StreamApiContext): Promise<void> {
  const ticket = await context.issueTicket({
    subject: SUBJECT.EXPIRING,
    lifetimeSeconds: SHORT_TOKEN_SECONDS,
  });
  const openedAt = Date.now();
  const socket = context.connect({ ticket });
  await socket.opened;
  const closed = await socket.closed;
  const lived = closed.closedAt - openedAt;
  const ceiling = (SHORT_TOKEN_SECONDS + Number(PING_INTERVAL_SECONDS)) * SECOND + 3 * SECOND;
  assertCondition(closed.code === 4401, `token vencido fechou com ${closed.code}`);
  assertCondition(lived <= ceiling, `o socket viveu ${lived} ms depois de o token vencer`);
  reportLine(
    `token no socket: sem renovação, o socket fecha com 4401 quando o token (${SHORT_TOKEN_SECONDS} s) vence (${lived} ms)`,
  );
}

async function checkRenewal(context: StreamApiContext): Promise<void> {
  const ticket = await context.issueTicket({
    subject: SUBJECT.RENEWING,
    lifetimeSeconds: SHORT_TOKEN_SECONDS,
  });
  const socket = context.connect({ ticket });
  await socket.opened;
  const renewal = await context.issueTicket({ subject: SUBJECT.RENEWING });
  socket.send(JSON.stringify({ type: 'renew', ticket: renewal }));
  await Bun.sleep(WAIT_FOR_RENEWED_MILLISECONDS);
  const message = socket.received.find(
    (item) => (item.message as { type?: string }).type === 'renewed',
  );
  assertCondition(message !== undefined, 'o socket não confirmou a renovação');
  assertCondition(
    socket.socket.readyState === WebSocket.OPEN,
    'o socket renovado fechou ao passar o vencimento do token antigo',
  );
  socket.socket.close();
  await socket.closed;
  reportLine(
    `renovação no socket: {type:'renew', ticket} novo antes do vencimento -> o socket passa do vencimento do token antigo (${SHORT_TOKEN_SECONDS} s) e continua aberto`,
  );
}

async function checkBlockedByAdmin(context: StreamApiContext): Promise<void> {
  const blocked = context.connect({
    ticket: await context.issueTicket({ subject: SUBJECT.BLOCKED }),
  });
  const bystander = context.connect({
    ticket: await context.issueTicket({ subject: SUBJECT.BYSTANDER }),
  });
  await Promise.all([blocked.opened, bystander.opened]);
  const accountId = await accountIdOf(context, SUBJECT.BLOCKED);
  const response = await context.api.call({
    subject: SUBJECT.ADMIN,
    claims: ADMIN_CLAIMS,
    method: 'POST',
    path: `/v1/admin/accounts/${accountId}/block`,
  });
  assertCondition(response.status === 200, `bloqueio pelo admin: ${response.status}`);
  const closed = await blocked.closed;
  assertCondition(closed.code === 4403, `conta bloqueada fechou com ${closed.code}`);
  await Bun.sleep(300);
  assertCondition(
    bystander.socket.readyState === WebSocket.OPEN,
    'o bloqueio fechou o socket de outro usuário',
  );
  const after = await context.api.call({ subject: SUBJECT.BLOCKED, path: '/v1/runs' });
  assertCondition(after.status === 403, `a conta bloqueada ainda acessa a API: ${after.status}`);
  bystander.socket.close();
  await bystander.closed;
  reportLine(
    'conta bloqueada pelo admin (POST /v1/admin/accounts/:id/block): os sockets dela fecham com 4403 na hora, o socket de outro usuário segue aberto e a API passa a responder 403 à conta',
  );
}

async function checkRenewalOfBlocked(context: StreamApiContext): Promise<void> {
  const socket = context.connect({
    ticket: await context.issueTicket({ subject: SUBJECT.RENEW_BLOCKED }),
  });
  await socket.opened;
  const renewal = await context.issueTicket({ subject: SUBJECT.RENEW_BLOCKED });
  await context.api.client.unsafe('UPDATE users SET blocked_at = now() WHERE keycloak_sub = $1', [
    SUBJECT.RENEW_BLOCKED,
  ]);
  socket.send(JSON.stringify({ type: 'renew', ticket: renewal }));
  const closed = await socket.closed;
  assertCondition(closed.code === 4403, `renovação de conta bloqueada fechou com ${closed.code}`);
  reportLine(
    'renovação de conta bloqueada no meio do caminho (UPDATE no banco): o socket fecha com 4403',
  );
}

export async function checkLifecycle(context: StreamApiContext): Promise<void> {
  await checkTokenExpiry(context);
  await checkRenewal(context);
  await checkBlockedByAdmin(context);
  await checkRenewalOfBlocked(context);
}
