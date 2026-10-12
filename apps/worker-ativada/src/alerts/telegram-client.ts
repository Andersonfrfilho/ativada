// Copyright (c) 2026 Ada Technology. All rights reserved.
import { HTTP_METHOD, z } from '@ativada/environment';

import {
  ALERT_ERROR_CODE,
  ALERT_REQUEST_TIMEOUT_MILLISECONDS,
  MILLISECONDS_PER_SECOND,
} from './alerts.constant.js';

const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR_FLOOR = 500;
const HTTP_SUCCESS_FLOOR = 200;
const HTTP_SUCCESS_CEILING = 300;
const TRAILING_SLASHES = /\/+$/u;

export type SendMessageParams = { readonly chatId: string; readonly text: string };

// `retry`: falha passageira (rede, 429, 5xx) e, quando o Telegram disse, quanto esperar. `rejected`: o Telegram recusou de
// vez (token, chat, pedido) e repetir não adianta. O resultado só carrega CÓDIGOS: nunca token, chat, URL nem texto de erro.
export type TelegramSendResult =
  | { readonly kind: 'sent' }
  | {
      readonly kind: 'retry';
      readonly code: string;
      readonly retryAfterMilliseconds: number | undefined;
    }
  | { readonly kind: 'rejected'; readonly code: string };

export type TelegramClient = {
  readonly sendMessage: (params: SendMessageParams) => Promise<TelegramSendResult>;
};

export type TelegramClientSettings = {
  readonly apiBaseUrl: string;
  readonly botToken: string;
  readonly timeoutMilliseconds?: number;
};

const botResponseSchema = z.looseObject({
  ok: z.boolean(),
  parameters: z.looseObject({ retry_after: z.number().nonnegative() }).optional(),
});

async function readBotResponse(
  response: Response,
): Promise<z.infer<typeof botResponseSchema> | undefined> {
  try {
    const parsed = botResponseSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function retry(code: string, retryAfterSeconds?: number): TelegramSendResult {
  const retryAfterMilliseconds =
    retryAfterSeconds === undefined ? undefined : retryAfterSeconds * MILLISECONDS_PER_SECOND;
  return { kind: 'retry', code, retryAfterMilliseconds };
}

async function classify(response: Response): Promise<TelegramSendResult> {
  const { status } = response;
  if (status >= HTTP_SUCCESS_FLOOR && status < HTTP_SUCCESS_CEILING) {
    const body = await readBotResponse(response);
    return body?.ok === true ? { kind: 'sent' } : retry(ALERT_ERROR_CODE.BAD_RESPONSE);
  }
  if (status === HTTP_TOO_MANY_REQUESTS) {
    const body = await readBotResponse(response);
    return retry(ALERT_ERROR_CODE.RATE_LIMITED, body?.parameters?.retry_after);
  }
  if (status >= HTTP_SERVER_ERROR_FLOOR) return retry(ALERT_ERROR_CODE.SERVER_ERROR);
  return { kind: 'rejected', code: `http_${status}` };
}

// A Bot API direta por `fetch` (plan D8): o token vai no caminho da URL, então o erro do `fetch` (que cita a URL) NUNCA sai
// daqui — é engolido e vira o código `network`. Redirecionamento é recusado: seguiria o token para outro host.
export function createTelegramClient(settings: TelegramClientSettings): TelegramClient {
  const baseUrl = settings.apiBaseUrl.replace(TRAILING_SLASHES, '');
  const timeout = settings.timeoutMilliseconds ?? ALERT_REQUEST_TIMEOUT_MILLISECONDS;
  return {
    sendMessage: async (params): Promise<TelegramSendResult> => {
      try {
        const response = await fetch(`${baseUrl}/bot${settings.botToken}/sendMessage`, {
          method: HTTP_METHOD.POST,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: params.chatId, text: params.text }),
          redirect: 'error',
          signal: AbortSignal.timeout(timeout),
        });
        return await classify(response);
      } catch {
        return retry(ALERT_ERROR_CODE.NETWORK);
      }
    },
  };
}
