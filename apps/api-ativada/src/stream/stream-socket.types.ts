// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { UserId } from '@ativada/database';

// O que a conexão carrega: quem é (do ticket, nunca do cliente), até quando o token vale e o que ela já fez.
export type StreamSocketData = {
  readonly connectionId: string;
  readonly userId: UserId;
  readonly keycloakSubject: string;
  expiresAtMilliseconds: number;
  lastActivityAtMilliseconds: number;
  messageWindowStartMilliseconds: number;
  messageCount: number;
  readonly subscribedPairs: Set<string>;
};

// O recorte do `ServerWebSocket` do Bun de que o hub precisa: os contratos o substituem por um soquete falso.
export type StreamSocket = {
  readonly data: StreamSocketData;
  readonly send: (text: string) => unknown;
  readonly close: (code: number, reason?: string) => unknown;
  readonly ping: () => unknown;
};

export type UpgradeServer = {
  readonly upgrade: (request: Request, options: { readonly data: StreamSocketData }) => boolean;
};
