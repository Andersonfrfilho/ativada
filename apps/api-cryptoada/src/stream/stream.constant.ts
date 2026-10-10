// Copyright (c) 2026 Ada Technology. All rights reserved.
export const STREAM_PATH = '/v1/stream';
export const STREAM_TICKET_PARAMETER = 'ticket';
export const STREAM_LOG_MESSAGE = 'stream';
export const MAX_TICKET_LENGTH = 128;
export const WEBSOCKET_UPGRADE_HEADER_VALUE = 'websocket';
export const MESSAGE_WINDOW_MILLISECONDS = 60_000;

// 4401 e 4403 são os códigos da aplicação (ADR 0001 §e): token vencido e conta bloqueada ou apagada.
export const WEBSOCKET_CLOSE_CODE = {
  GOING_AWAY: 1001,
  POLICY_VIOLATION: 1008,
  MESSAGE_TOO_BIG: 1009,
  TRY_AGAIN_LATER: 1013,
  TOKEN_EXPIRED: 4401,
  ACCOUNT_BLOCKED: 4403,
  PONG_TIMEOUT: 4408,
} as const;

export const CLOSE_REASON = {
  TOKEN_EXPIRED: 'token expirado',
  INVALID_TICKET: 'ticket inválido',
  ACCOUNT_INACTIVE: 'conta inativa',
  PONG_TIMEOUT: 'sem resposta ao ping',
  LIMIT_REACHED: 'limite de conexões',
  MESSAGE_FLOOD: 'mensagens demais',
  SHUTTING_DOWN: 'encerrando',
  UNAVAILABLE: 'indisponível',
} as const;

export const SERVER_MESSAGE_TYPE = {
  EVENT: 'event',
  RESYNC: 'resync',
  RENEWED: 'renewed',
  ERROR: 'error',
} as const;

export const CLIENT_MESSAGE_TYPE = {
  RENEW: 'renew',
} as const;

export const MESSAGE_ERROR_CODE = {
  INVALID_MESSAGE: 'INVALID_MESSAGE',
} as const;

export const RESYNC_REASON = {
  LISTENER_LOST: 'listener_lost',
  LISTENER_RESTORED: 'listener_restored',
} as const;

export const STREAM_LOG_EVENT = {
  UPGRADE_REFUSED: 'stream.upgrade.refused',
  OPENED: 'stream.opened',
  CLOSED: 'stream.closed',
} as const;
