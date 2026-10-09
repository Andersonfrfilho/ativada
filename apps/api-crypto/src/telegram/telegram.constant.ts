// Copyright (c) 2026 Ada Technology. All rights reserved.
export const TELEGRAM_LINK_PATH = '/v1/me/telegram-link';
export const TELEGRAM_WEBHOOK_PATH = '/v1/telegram/webhook';
export const WEBHOOK_SECRET_HEADER = 'X-Telegram-Bot-Api-Secret-Token';
export const DEFAULT_TELEGRAM_API_BASE_URL = 'https://api.telegram.org';

export const LINK_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const LINK_CODE_LENGTH = 10;
export const LINK_CODE_TIME_TO_LIVE_SECONDS = 600;
export const LINK_CODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const START_COMMAND_PATTERN = /^\/start(?:@\w+)?\s+(\S+)$/;
export const PRIVATE_CHAT_TYPE = 'private';

export const CHAT_FAILURE_LIMIT = 5;
export const CHAT_FAILURE_WINDOW_MILLISECONDS = 600_000;
export const CHAT_BLOCK_MILLISECONDS = 3_600_000;
export const MAX_TRACKED_CHATS = 10_000;

export const BOT_REQUEST_TIMEOUT_MILLISECONDS = 5_000;
export const MILLISECONDS_PER_SECOND = 1_000;

export const BOT_MESSAGE = {
  LINKED: 'Conta vinculada com sucesso. Os alertas do simulador chegarão neste chat.',
  REJECTED: 'Não foi possível vincular. Gere um novo código no painel e envie /start com ele.',
} as const;
