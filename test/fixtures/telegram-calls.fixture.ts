// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  TELEGRAM_LINK_PATH,
  TELEGRAM_WEBHOOK_PATH,
} from '../../apps/api-ativada/src/telegram/telegram.constant.js';
import { userIdFromDatabase } from '../../packages/database/src/ownership/user-id.js';
import { FAKE_WEBHOOK_SECRET } from './fake-telegram.fixture.js';
import type { TelegramHarness } from './telegram-harness.fixture.js';

export const WEBHOOK_HEADER = 'X-Telegram-Bot-Api-Secret-Token';
export const CHAT_OF_A = '700000001';
export const CHAT_OF_B = '700000002';

export type WebhookCall = {
  readonly secret?: string | null;
  readonly body: unknown;
  readonly rawBody?: string;
  readonly socketAddress?: string;
};

export function buildStartUpdate(params: { chatId: string; code: string }): unknown {
  return {
    update_id: 1,
    message: {
      message_id: 10,
      chat: { id: Number(params.chatId), type: 'private' },
      text: `/start ${params.code}`,
    },
  };
}

export async function issueLinkCode(harness: TelegramHarness, subject: string): Promise<string> {
  const response = await harness.api.sendThroughHandler({
    path: TELEGRAM_LINK_PATH,
    method: 'POST',
    token: await harness.tokenFor(subject),
  });
  const body = (await response.json()) as { data: { code: string } };
  return body.data.code;
}

export function callWebhook(harness: TelegramHarness, call: WebhookCall): Promise<Response> {
  const secret = call.secret === undefined ? FAKE_WEBHOOK_SECRET : call.secret;
  return harness.api.sendThroughHandler({
    path: TELEGRAM_WEBHOOK_PATH,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret === null ? {} : { [WEBHOOK_HEADER]: secret }),
    },
    body: call.rawBody ?? JSON.stringify(call.body),
    socketAddress: call.socketAddress ?? '203.0.113.50',
  });
}

export function submitCode(
  harness: TelegramHarness,
  params: { chatId: string; code: string },
): Promise<Response> {
  return callWebhook(harness, { body: buildStartUpdate(params) });
}

export function linkedChatOf(harness: TelegramHarness, userId: string): string | undefined {
  return harness.users.users.get(userIdFromDatabase(userId))?.telegramChatId;
}
