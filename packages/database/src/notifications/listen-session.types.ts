// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { FrameReader } from './postgres-wire-decode.js';
import type { ConnectionSettings } from './parse-connection-url.js';
import type { OpenTransport, PostgresTransport } from './postgres-transport.types.js';
import type { ScramClient } from './scram-sha-256.js';
import type { SessionEnd, SessionEndReason } from './session-end.js';

export const SESSION_PHASE = {
  CONNECTING: 'connecting',
  SSL: 'ssl',
  TLS: 'tls',
  STARTUP: 'startup',
  AUTHENTICATING: 'authenticating',
  AWAITING_READY: 'awaiting-ready',
  SUBSCRIBING: 'subscribing',
  LISTENING: 'listening',
  ENDED: 'ended',
} as const;

export type SessionPhase = (typeof SESSION_PHASE)[keyof typeof SESSION_PHASE];

export type SessionHandlers = {
  readonly onNotification: (payload: string) => void;
  readonly onListening: () => void;
  readonly onEnded: (end: SessionEnd) => void;
};

export type ListenSessionParams = {
  readonly settings: ConnectionSettings;
  readonly channel: string;
  readonly openTransport: OpenTransport;
  readonly handlers: SessionHandlers;
};

export type ListenSession = {
  // `false` quando a checagem anterior não foi respondida (ou a conexão não avançou): a conexão está morta.
  readonly checkAlive: () => boolean;
  readonly stop: (reason?: SessionEndReason) => void;
};

export type SessionContext = {
  readonly params: ListenSessionParams;
  readonly reader: FrameReader;
  phase: SessionPhase;
  transport: PostgresTransport | undefined;
  scram: ScramClient | undefined;
  // O hash tls-server-end-point do certificado do servidor, quando há TLS e sabemos calculá-lo: a ligação ao canal do SCRAM.
  channelBindingHash: Uint8Array | undefined;
  isServerVerified: boolean;
  wasListening: boolean;
  isPingPending: boolean;
  lastCheckedPhase: SessionPhase | undefined;
};
