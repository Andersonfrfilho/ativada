// Copyright (c) 2026 Ada Technology. All rights reserved.
import { HTTP_METHOD } from '../shared/http/http.constant.js';
import { BOT_REQUEST_TIMEOUT_MILLISECONDS } from './telegram.constant.js';

export type SendMessageParams = {
  readonly chatId: string;
  readonly text: string;
};

export type TelegramBotClient = {
  readonly sendMessage: (params: SendMessageParams) => Promise<boolean>;
};

export type TelegramBotClientSettings = {
  readonly apiBaseUrl: string;
  readonly botToken: string;
};

export function createTelegramBotClient(settings: TelegramBotClientSettings): TelegramBotClient {
  const baseUrl = settings.apiBaseUrl.replace(/\/+$/, '');
  return {
    sendMessage: async (params): Promise<boolean> => {
      try {
        const response = await fetch(`${baseUrl}/bot${settings.botToken}/sendMessage`, {
          method: HTTP_METHOD.POST,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: params.chatId, text: params.text }),
          signal: AbortSignal.timeout(BOT_REQUEST_TIMEOUT_MILLISECONDS),
        });
        return response.ok;
      } catch {
        return false;
      }
    },
  };
}
