// Copyright (c) 2026 Ada Technology. All rights reserved.
export const FAKE_BOT_TOKEN = '123456789:FAKE_contract_token_only';
export const FAKE_WEBHOOK_SECRET = 'fake_contract_webhook_secret_0001';

export type SentTelegramMessage = {
  readonly path: string;
  readonly chatId: string;
  readonly text: string;
};

export type FakeTelegram = {
  readonly baseUrl: string;
  readonly sentMessages: SentTelegramMessage[];
  readonly setFailing: (isFailing: boolean) => void;
  readonly stop: () => Promise<void>;
};

type SendMessageBody = { readonly chat_id?: unknown; readonly text?: unknown };

export function startFakeTelegram(): FakeTelegram {
  const sentMessages: SentTelegramMessage[] = [];
  let isFailing = false;
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request): Promise<Response> {
      const path = new URL(request.url).pathname;
      if (isFailing) return Response.json({ ok: false }, { status: 500 });
      if (path !== `/bot${FAKE_BOT_TOKEN}/sendMessage`) {
        return Response.json({ ok: false }, { status: 404 });
      }
      const body = (await request.json()) as SendMessageBody;
      sentMessages.push({ path, chatId: String(body.chat_id), text: String(body.text) });
      return Response.json({ ok: true, result: {} });
    },
  });
  return {
    baseUrl: `http://127.0.0.1:${server.port}`,
    sentMessages,
    setFailing: (nextFailing): void => {
      isFailing = nextFailing;
    },
    stop: async (): Promise<void> => {
      await server.stop(true);
    },
  };
}
