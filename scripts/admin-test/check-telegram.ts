// Copyright (c) 2026 Ada Technology. All rights reserved.
import { assertCondition } from '../identity-test/identity-test.error.js';
import {
  ME_PATH,
  TELEGRAM_LINK_PATH,
  TELEGRAM_WEBHOOK_PATH,
  WEBHOOK_SECRET_HEADER,
} from './admin-test.constant.js';
import { reportAdminStep, type AdminTestContext, type TestActors } from './admin-test-context.js';
import { readData, requestApi } from './api-request.js';

export const TEST_CHAT_ID = '710001';

type CountRow = { readonly total: number };

export type FakeTelegramServer = {
  readonly sentTexts: string[];
  readonly stop: () => Promise<void>;
};

export function startFakeTelegramServer(apiBaseUrl: string): FakeTelegramServer {
  const sentTexts: string[] = [];
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: Number(new URL(apiBaseUrl).port),
    async fetch(request): Promise<Response> {
      const body = (await request.json()) as { text?: unknown };
      sentTexts.push(String(body.text));
      return Response.json({ ok: true, result: {} });
    },
  });
  return { sentTexts, stop: async (): Promise<void> => void (await server.stop(true)) };
}

function postWebhook(
  context: AdminTestContext,
  params: { readonly secret: string; readonly code: string },
): ReturnType<typeof requestApi> {
  return requestApi({
    baseUrl: context.api.baseUrl,
    path: TELEGRAM_WEBHOOK_PATH,
    method: 'POST',
    headers: { [WEBHOOK_SECRET_HEADER]: params.secret },
    body: {
      update_id: 1,
      message: {
        chat: { id: Number(TEST_CHAT_ID), type: 'private' },
        text: `/start ${params.code}`,
      },
    },
  });
}

function countSentTexts(telegram: FakeTelegramServer): number {
  return telegram.sentTexts.length;
}

async function countLinkedChats(context: AdminTestContext): Promise<number> {
  const rows: unknown =
    await context.sql`SELECT count(*)::int AS total FROM users WHERE telegram_chat_id IS NOT NULL`;
  return (rows as readonly CountRow[])[0]?.total ?? 0;
}

export async function checkTelegramLinking(
  context: AdminTestContext,
  params: { readonly actors: TestActors; readonly telegram: FakeTelegramServer },
): Promise<void> {
  const { baseUrl, environment } = context.api;
  const secret = environment.TELEGRAM_WEBHOOK_SECRET ?? '';
  const token = params.actors.member.accessToken;
  const issued = await requestApi({ baseUrl, path: TELEGRAM_LINK_PATH, method: 'POST', token });
  const code = String(readData(issued)['code']);
  assertCondition(issued.status === 201 && /^[A-Z2-7]{8,}$/.test(code), `código: ${issued.status}`);
  const rejected = await postWebhook(context, { secret: 'wrong_secret_value_for_the_test', code });
  assertCondition(
    rejected.status === 401 && (await countLinkedChats(context)) === 0,
    'segredo errado',
  );
  const accepted = await postWebhook(context, { secret, code });
  assertCondition(accepted.status === 200, `webhook: ${accepted.status}`);
  const me = await requestApi({ baseUrl, path: ME_PATH, token });
  assertCondition(readData(me)['telegramLinked'] === true, 'telegramLinked deveria ser true');
  assertCondition(!me.text.includes(TEST_CHAT_ID), 'o chat vazou em /v1/me');
  assertCondition((await countLinkedChats(context)) === 1, 'só o membro deveria ter chat');
  assertCondition(
    countSentTexts(params.telegram) === 1,
    'confirmação não chegou ao Telegram falso',
  );
  const reuse = await postWebhook(context, { secret, code });
  assertCondition(
    reuse.status === 200 && countSentTexts(params.telegram) === 2,
    'reuso responde igual',
  );
  const unlinked = await requestApi({ baseUrl, path: TELEGRAM_LINK_PATH, method: 'DELETE', token });
  assertCondition(
    unlinked.status === 204 && (await countLinkedChats(context)) === 0,
    'desvincular',
  );
  reportAdminStep(
    'Telegram',
    'código de uso único vincula o chat no Postgres real; segredo errado 401; reuso recusado; desvincular',
  );
}
