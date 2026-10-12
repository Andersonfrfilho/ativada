// Copyright (c) 2026 Ada Technology. All rights reserved.
import { generateLinkCode, hashLinkCode } from '../../apps/api-ativada/src/telegram/link-code.js';
import {
  createTelegramLinkConsumer,
  createTelegramLinkRepository,
  LINK_OUTCOME,
} from '../../packages/database/src/index.js';
import type { LiveUser } from '../live-test/live-test-context.js';
import { CHAT_OF_A, CHAT_OF_B, CHAT_STRANGER } from './telegram-test.constant.js';
import {
  assertCondition,
  reportTelegramLine,
  type TelegramTestContext,
} from './telegram-test-context.js';

const TEN_MINUTES_MILLISECONDS = 600_000;
const HASH_LENGTH = 64;

async function readChat(context: TelegramTestContext, user: LiveUser): Promise<string | null> {
  const rows: unknown = await context.live.client`SELECT telegram_chat_id FROM users
    WHERE keycloak_sub = ${user.subject}`;
  return (rows as readonly { telegram_chat_id: string | null }[])[0]?.telegram_chat_id ?? null;
}

async function readStoredHashes(context: TelegramTestContext): Promise<readonly string[]> {
  const rows: unknown = await context.live.client`SELECT code_hash FROM telegram_link_codes`;
  return (rows as readonly { code_hash: string }[]).map((row) => row.code_hash);
}

type Issue = { readonly user: LiveUser; readonly expiresInMilliseconds: number };

async function issue(context: TelegramTestContext, params: Issue): Promise<string> {
  const code = generateLinkCode();
  await createTelegramLinkRepository(context.live.handle).issueCode(params.user.scope, {
    codeHash: hashLinkCode(code),
    expiresAt: new Date(Date.now() + params.expiresInMilliseconds),
  });
  return code;
}

function consume(
  context: TelegramTestContext,
  params: { readonly code: string; readonly chatId: string },
): Promise<string> {
  return createTelegramLinkConsumer(context.live.handle).consumeCode({
    codeHash: hashLinkCode(params.code),
    chatId: params.chatId,
    now: new Date(),
  });
}

async function checkCodeLifecycle(context: TelegramTestContext, user: LiveUser): Promise<void> {
  const code = await issue(context, { user, expiresInMilliseconds: TEN_MINUTES_MILLISECONDS });
  const stored = await readStoredHashes(context);
  assertCondition(
    stored.length === 1 && stored[0]?.length === HASH_LENGTH && !stored[0].includes(code),
    'só o hash do código é guardado, nunca o código',
  );
  const wrong = await consume(context, { code: generateLinkCode(), chatId: CHAT_OF_A });
  assertCondition(wrong === LINK_OUTCOME.REJECTED, 'código desconhecido foi aceito');
  assertCondition((await readChat(context, user)) === null, 'código errado vinculou o chat');
  const linked = await consume(context, { code, chatId: CHAT_OF_A });
  assertCondition(linked === LINK_OUTCOME.LINKED, 'código válido recusado');
  assertCondition((await readChat(context, user)) === CHAT_OF_A, 'chat de A não foi gravado');
  assertCondition((await readStoredHashes(context)).length === 0, 'o código usado não sumiu');
  const reused = await consume(context, { code, chatId: CHAT_STRANGER });
  assertCondition(reused === LINK_OUTCOME.REJECTED, 'código de uso único foi reutilizado');
  assertCondition((await readChat(context, user)) === CHAT_OF_A, 'a reutilização trocou o chat');
}

async function checkExpiredAndConflict(
  context: TelegramTestContext,
  users: { readonly a: LiveUser; readonly b: LiveUser },
): Promise<void> {
  const expired = await issue(context, { user: users.b, expiresInMilliseconds: -SECOND_BACK });
  const late = await consume(context, { code: expired, chatId: CHAT_OF_B });
  assertCondition(late === LINK_OUTCOME.REJECTED, 'código vencido foi aceito');
  assertCondition((await readChat(context, users.b)) === null, 'código vencido vinculou o chat');
  const stolen = await issue(context, {
    user: users.b,
    expiresInMilliseconds: TEN_MINUTES_MILLISECONDS,
  });
  const taken = await consume(context, { code: stolen, chatId: CHAT_OF_A });
  assertCondition(taken === LINK_OUTCOME.REJECTED, 'o chat de A foi vinculado a B também');
  assertCondition((await readChat(context, users.a)) === CHAT_OF_A, 'A perdeu o chat');
  const own = await consume(context, { code: stolen, chatId: CHAT_OF_B });
  assertCondition(own === LINK_OUTCOME.LINKED, 'B não conseguiu vincular o próprio chat');
}

const SECOND_BACK = 1_000;

export async function checkLinkFlow(
  context: TelegramTestContext,
  users: { readonly a: LiveUser; readonly b: LiveUser },
): Promise<void> {
  await checkCodeLifecycle(context, users.a);
  await checkExpiredAndConflict(context, users);
  reportTelegramLine(
    'vínculo por código: só o hash no banco, uso único, vencido e reutilizado recusados, um chat não vincula a dois donos',
  );
}
