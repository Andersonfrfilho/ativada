// Copyright (c) 2026 Ada Technology. All rights reserved.

export type TransportEvents = {
  readonly onData: (chunk: Uint8Array) => void;
  // `true` quando a conexão caiu sem que quem a usa a tivesse fechado.
  readonly onClose: (isAbrupt: boolean) => void;
};

export type TlsUpgradeOptions = {
  readonly shouldVerify: boolean;
  readonly serverName: string;
};

export type PostgresTransport = {
  readonly write: (bytes: Uint8Array) => void;
  // Troca o soquete por TLS depois de o servidor aceitar o SSLRequest; rejeita se o handshake falhar.
  readonly upgradeToTls: (options: TlsUpgradeOptions) => Promise<void>;
  readonly close: () => void;
};

export type OpenTransportParams = {
  readonly host: string;
  readonly port: number;
  readonly events: TransportEvents;
};

export type OpenTransport = (params: OpenTransportParams) => Promise<PostgresTransport>;
