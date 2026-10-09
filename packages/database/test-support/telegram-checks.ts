// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createHash } from 'node:crypto';

import type { DatabaseHandle } from '../src/database-handle.js';
import type { OwnerScope } from '../src/ownership/owner-scope.js';
import { createTelegramLinkConsumer } from '../src/telegram/telegram-link-consumer.js';
import { createTelegramLinkRepository } from '../src/telegram/telegram-link.repository.js';
import {
  LINK_OUTCOME,
  MAX_ATTEMPTS_PER_LINK_CODE,
} from '../src/telegram/telegram-link.constant.js';
import { resolveUserBySubject } from '../src/users/resolve-user-by-subject.js';
import { USER_RESOLUTION_STATUS } from '../src/users/user-resolution.constant.js';

const SUBJECT_OF_A = 'subject-telegram-a';
const SUBJECT_OF_B = 'subject-telegram-b';
const CHAT_X = '710000001';
const CHAT_Y = '710000002';
const CHAT_Z = '710000003';
const TEN_MINUTES_MILLISECONDS = 600_000;
const RACE_ROUNDS = 10;
const CONCURRENT_ISSUES = 10;

export type TelegramCheckContext = {
  readonly handle: DatabaseHandle;
  readonly client: Bun.SQL;
  readonly assertCondition: (condition: boolean, message: string) => void;
  readonly reportCheck: (message: string) => void;
};

type CountRow = { readonly total: number };
type ChatRow = { readonly telegram_chat_id: string | null };
type HashRow = { readonly code_hash: string };

function hashOf(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

async function resolveScope(handle: DatabaseHandle, subject: string): Promise<OwnerScope> {
  const resolution = await resolveUserBySubject(handle, subject);
  if (resolution.status !== USER_RESOLUTION_STATUS.ACTIVE) throw new Error('usuário não ativo');
  return resolution.scope;
}

async function readChat(client: Bun.SQL, subject: string): Promise<string | null | undefined> {
  const rows: unknown =
    await client`SELECT telegram_chat_id FROM users WHERE keycloak_sub = ${subject}`;
  return (rows as readonly ChatRow[])[0]?.telegram_chat_id;
}

async function countCodes(client: Bun.SQL): Promise<number> {
  const rows: unknown = await client`SELECT count(*)::int AS total FROM telegram_link_codes`;
  return (rows as readonly CountRow[])[0]?.total ?? 0;
}

export async function checkTelegramLink(context: TelegramCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const links = createTelegramLinkRepository(handle);
  const consumer = createTelegramLinkConsumer(handle);
  const scopeOfA = await resolveScope(handle, SUBJECT_OF_A);
  const scopeOfB = await resolveScope(handle, SUBJECT_OF_B);
  const future = (): Date => new Date(Date.now() + TEN_MINUTES_MILLISECONDS);
  const consume = (code: string, chatId: string): Promise<string> =>
    consumer.consumeCode({ codeHash: hashOf(code), chatId, now: new Date() });

  await links.issueCode(scopeOfA, { codeHash: hashOf('CODE-A1'), expiresAt: future() });
  const stored: unknown = await client`SELECT code_hash FROM telegram_link_codes`;
  assertCondition((stored as readonly HashRow[])[0]?.code_hash === hashOf('CODE-A1'), 'só o hash');
  assertCondition((await consume('OTHER', CHAT_X)) === LINK_OUTCOME.REJECTED, 'código inexistente');
  assertCondition((await consume('CODE-A1', CHAT_X)) === LINK_OUTCOME.LINKED, 'vínculo');
  assertCondition((await readChat(client, SUBJECT_OF_A)) === CHAT_X, 'chat gravado no dono');
  assertCondition((await readChat(client, SUBJECT_OF_B)) === null, 'B não pode receber o chat');
  assertCondition((await consume('CODE-A1', CHAT_Y)) === LINK_OUTCOME.REJECTED, 'uso único');
  assertCondition((await countCodes(client)) === 0, 'código consumido deve sumir');
  reportCheck('telegram: só o hash no banco; vínculo no dono; código de uso único');

  await links.issueCode(scopeOfB, { codeHash: hashOf('CODE-B-OLD'), expiresAt: new Date(0) });
  assertCondition((await consume('CODE-B-OLD', CHAT_Y)) === LINK_OUTCOME.REJECTED, 'expirado');
  assertCondition((await readChat(client, SUBJECT_OF_B)) === null, 'expirado não vincula');
  await links.issueCode(scopeOfB, { codeHash: hashOf('CODE-B-1'), expiresAt: future() });
  await links.issueCode(scopeOfB, { codeHash: hashOf('CODE-B-2'), expiresAt: future() });
  assertCondition((await consume('CODE-B-1', CHAT_Y)) === LINK_OUTCOME.REJECTED, 'anterior');
  const racers = await Promise.all([consume('CODE-B-2', CHAT_Y), consume('CODE-B-2', '710000009')]);
  assertCondition(racers.filter((o) => o === LINK_OUTCOME.LINKED).length === 1, 'corrida');
  reportCheck('telegram: expiração; o código novo invalida o anterior; corrida vincula uma vez');

  await links.unlink(scopeOfB);
  await links.issueCode(scopeOfB, { codeHash: hashOf('CODE-B-3'), expiresAt: future() });
  for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_LINK_CODE; attempt += 1) {
    assertCondition((await consume('CODE-B-3', CHAT_X)) === LINK_OUTCOME.REJECTED, 'chat de A');
  }
  assertCondition((await countCodes(client)) === 0, 'código morre após as tentativas');
  assertCondition((await readChat(client, SUBJECT_OF_A)) === CHAT_X, 'A segue vinculado');
  await links.unlink(scopeOfB);
  assertCondition((await readChat(client, SUBJECT_OF_A)) === CHAT_X, 'unlink de B não toca A');
  await links.unlink(scopeOfA);
  assertCondition((await readChat(client, SUBJECT_OF_A)) === null, 'unlink de A');
  reportCheck('telegram: chat de outro usuário é recusado; tentativas por código; desvincular');
}

export async function checkTelegramRaces(context: TelegramCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const links = createTelegramLinkRepository(handle);
  const consumer = createTelegramLinkConsumer(handle);
  const scopeOfA = await resolveScope(handle, SUBJECT_OF_A);
  const scopeOfB = await resolveScope(handle, SUBJECT_OF_B);
  const expiresAt = new Date(Date.now() + TEN_MINUTES_MILLISECONDS);

  const issues = await Promise.allSettled(
    Array.from({ length: CONCURRENT_ISSUES }, (_, index) =>
      links.issueCode(scopeOfA, { codeHash: hashOf(`RACE-ISSUE-${index}`), expiresAt }),
    ),
  );
  assertCondition(
    issues.every((issue) => issue.status === 'fulfilled'),
    'emissões concorrentes do mesmo dono não podem falhar',
  );
  assertCondition((await countCodes(client)) === 1, 'um único código pendente por dono');

  for (let round = 0; round < RACE_ROUNDS; round += 1) {
    await links.issueCode(scopeOfA, { codeHash: hashOf(`RACE-A-${round}`), expiresAt });
    await links.issueCode(scopeOfB, { codeHash: hashOf(`RACE-B-${round}`), expiresAt });
    const outcomes = await Promise.allSettled([
      consumer.consumeCode({
        codeHash: hashOf(`RACE-A-${round}`),
        chatId: CHAT_Z,
        now: new Date(),
      }),
      consumer.consumeCode({
        codeHash: hashOf(`RACE-B-${round}`),
        chatId: CHAT_Z,
        now: new Date(),
      }),
    ]);
    const linked = outcomes.filter(
      (outcome) => outcome.status === 'fulfilled' && outcome.value === LINK_OUTCOME.LINKED,
    );
    assertCondition(
      outcomes.every((outcome) => outcome.status === 'fulfilled') && linked.length === 1,
      `rodada ${round}: dois donos disputando o mesmo chat -> um vincula e o outro é recusado, sem erro`,
    );
    await links.unlink(scopeOfA);
    await links.unlink(scopeOfB);
  }
  reportCheck('telegram: emissões e vínculos concorrentes terminam definidos, nunca em 23505');
}
