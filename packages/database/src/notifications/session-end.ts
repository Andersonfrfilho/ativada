// Copyright (c) 2026 Ada Technology. All rights reserved.

export const SESSION_END_REASON = {
  CONNECTION_FAILED: 'connection_failed',
  TLS_UNAVAILABLE: 'tls_unavailable',
  TLS_FAILED: 'tls_failed',
  AUTHENTICATION_FAILED: 'authentication_failed',
  UNSUPPORTED_AUTHENTICATION: 'unsupported_authentication',
  PROTOCOL_ERROR: 'protocol_error',
  SERVER_ERROR: 'server_error',
  CLOSED_BY_SERVER: 'closed_by_server',
  UNRESPONSIVE: 'unresponsive',
  STOPPED: 'stopped',
} as const;

export type SessionEndReason = (typeof SESSION_END_REASON)[keyof typeof SESSION_END_REASON];

// Só o motivo, o SQLSTATE do servidor e se a conexão já escutava: nada de texto do servidor, de URL ou de senha.
export type SessionEnd = {
  readonly reason: SessionEndReason;
  readonly sqlState: string | undefined;
  readonly wasListening: boolean;
};
