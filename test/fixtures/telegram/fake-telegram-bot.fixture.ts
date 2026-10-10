// Copyright (c) 2026 Ada Technology. All rights reserved.

// Servidor HTTP falso da Bot API: nenhuma chamada real ao Telegram existe nos testes. Cada resposta roteirizada vale para
// UMA requisição; sem roteiro, responde 200 `{ ok: true }`.
export const BOT_TOKEN = '123456789:FAKE_contract_bot_token_only';

export type ScriptedResponse = {
  readonly status: number;
  readonly body?: unknown;
  readonly rawBody?: string;
  readonly delayMilliseconds?: number;
  readonly headers?: Readonly<Record<string, string>>;
};

export type ReceivedRequest = {
  readonly method: string;
  readonly path: string;
  readonly contentType: string | null;
  readonly body: { readonly chat_id?: unknown; readonly text?: unknown };
};

export type FakeTelegramBot = {
  readonly baseUrl: string;
  readonly requests: ReceivedRequest[];
  readonly script: (...responses: readonly ScriptedResponse[]) => void;
  readonly stop: () => Promise<void>;
};

export const TELEGRAM_OK: ScriptedResponse = { status: 200, body: { ok: true, result: {} } };

export function telegramError(status: number, description = 'erro do bot'): ScriptedResponse {
  return { status, body: { ok: false, error_code: status, description } };
}

export function rateLimited(retryAfterSeconds: number): ScriptedResponse {
  return {
    status: 429,
    body: {
      ok: false,
      error_code: 429,
      description: 'Too Many Requests',
      parameters: { retry_after: retryAfterSeconds },
    },
  };
}

async function readBody(request: Request): Promise<ReceivedRequest['body']> {
  try {
    return (await request.json()) as ReceivedRequest['body'];
  } catch {
    return {};
  }
}

export function startFakeTelegramBot(token: string = BOT_TOKEN): FakeTelegramBot {
  const requests: ReceivedRequest[] = [];
  const scripted: ScriptedResponse[] = [];
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request): Promise<Response> {
      const path = new URL(request.url).pathname;
      requests.push({
        method: request.method,
        path,
        contentType: request.headers.get('content-type'),
        body: await readBody(request),
      });
      if (path !== `/bot${token}/sendMessage`) return Response.json({ ok: false }, { status: 404 });
      const next = scripted.shift() ?? TELEGRAM_OK;
      if (next.delayMilliseconds !== undefined) await Bun.sleep(next.delayMilliseconds);
      const headers = next.headers ?? {};
      if (next.rawBody !== undefined) {
        return new Response(next.rawBody, { status: next.status, headers });
      }
      return Response.json(next.body ?? {}, { status: next.status, headers });
    },
  });
  return {
    baseUrl: `http://127.0.0.1:${server.port}`,
    requests,
    script: (...responses): void => void scripted.push(...responses),
    stop: async (): Promise<void> => {
      await server.stop(true);
    },
  };
}
