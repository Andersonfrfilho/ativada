// Copyright (c) 2026 Ada Technology. All rights reserved.
export const PROTOCOL_VERSION_3 = 196_608;
export const SSL_REQUEST_CODE = 80_877_103;
export const SSL_ACCEPTED_BYTE = 83;
export const SSL_REFUSED_BYTE = 78;
export const NULL_BYTE = 0;
export const INT32_BYTES = 4;
export const FRAME_HEADER_BYTES = 5;
// Uma notificação carrega no máximo 8.000 bytes; o resto do que o servidor manda nesta conexão é pequeno.
export const DEFAULT_MAX_FRAME_BYTES = 65_536;

export const BACKEND_MESSAGE = {
  AUTHENTICATION: 'R',
  ERROR: 'E',
  NOTIFICATION: 'A',
  READY_FOR_QUERY: 'Z',
  EMPTY_QUERY: 'I',
  COMMAND_COMPLETE: 'C',
} as const;

export const FRONTEND_MESSAGE = {
  QUERY: 'Q',
  PASSWORD: 'p',
  TERMINATE: 'X',
} as const;

export const AUTHENTICATION_CODE = {
  OK: 0,
  CLEARTEXT_PASSWORD: 3,
  MD5_PASSWORD: 5,
  SASL: 10,
  SASL_CONTINUE: 11,
  SASL_FINAL: 12,
} as const;

export const ERROR_FIELD_SQLSTATE = 'C';
export const ERROR_FIELD_TERMINATOR = 0;
