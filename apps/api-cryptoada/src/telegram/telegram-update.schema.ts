// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

import {
  LINK_CODE_PATTERN,
  PRIVATE_CHAT_TYPE,
  START_COMMAND_PATTERN,
} from './telegram.constant.js';

export const telegramUpdateSchema = z.looseObject({
  message: z
    .looseObject({
      text: z.string().max(256).optional(),
      chat: z.looseObject({ id: z.number().int(), type: z.string() }),
    })
    .optional(),
});

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;

export type StartCommand = {
  readonly chatId: string;
  readonly code: string;
};

export function readStartCommand(update: TelegramUpdate): StartCommand | undefined {
  const message = update.message;
  if (message === undefined || message.chat.type !== PRIVATE_CHAT_TYPE) return undefined;
  const code = START_COMMAND_PATTERN.exec(message.text ?? '')?.[1];
  if (code === undefined || !LINK_CODE_PATTERN.test(code)) return undefined;
  return { chatId: String(message.chat.id), code };
}
