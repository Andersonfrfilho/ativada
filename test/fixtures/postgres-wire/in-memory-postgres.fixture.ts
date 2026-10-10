// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createHash, createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

import type {
  OpenTransport,
  PostgresTransport,
  TlsUpgradeOptions,
  TransportEvents,
} from '../../../packages/database/src/notifications/postgres-transport.types.js';

// Um Postgres em memória: fala o protocolo v3 do lado do servidor (SSLRequest, startup, SCRAM-SHA-256, LISTEN,
// NotificationResponse), sem soquete. Independente do código de produção: usa só `node:crypto` e `DataView`.
const SSL_REQUEST_CODE = 80_877_103;
const PROTOCOL_VERSION = 196_608;
const SCRAM_ITERATIONS = 4_096;
const SCRAM_MECHANISM = 'SCRAM-SHA-256';
const CLIENT_KEY_LABEL = 'Client Key';
const SERVER_KEY_LABEL = 'Server Key';
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

export type FakeAuthentication = 'trust' | 'scram' | 'md5' | 'cleartext' | 'too-many-connections';
export type FakeTls = 'unsupported' | 'supported' | 'handshake-fails';

export type FakePostgresOptions = {
  readonly authentication: FakeAuthentication;
  readonly password?: string;
  readonly tls?: FakeTls;
};

export type FakeConnectionRecord = {
  sslRequests: number;
  startupMessages: number;
  startupUser: string | undefined;
  startupDatabase: string | undefined;
  readonly queries: string[];
  readonly tlsUpgrades: TlsUpgradeOptions[];
  passwordMessages: number;
  isTerminated: boolean;
  isOpen: boolean;
  isListening: boolean;
};

export type FakePostgres = {
  readonly openTransport: OpenTransport;
  readonly connections: FakeConnectionRecord[];
  readonly notify: (payload: string, channel?: string) => void;
  readonly dropConnections: () => void;
  readonly sendRaw: (bytes: Uint8Array) => void;
  readonly setRefusing: (isRefusing: boolean) => void;
  readonly setSilent: (isSilent: boolean) => void;
  // Segura a resposta ao LISTEN (e solta ao passar `false`): o escutador só pode se dizer pronto depois dela.
  readonly holdListenAcknowledgement: (isHeld: boolean) => void;
  readonly setPassword: (password: string) => void;
  readonly listeningCount: () => number;
};

function int32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setInt32(0, value);
  return bytes;
}

function cString(text: string): Uint8Array {
  return Uint8Array.from([...TEXT_ENCODER.encode(text), 0]);
}

function concat(...parts: readonly Uint8Array[]): Uint8Array {
  return Uint8Array.from(parts.flatMap((part) => [...part]));
}

function message(type: string, ...body: readonly Uint8Array[]): Uint8Array {
  const payload = concat(...body);
  return concat(Uint8Array.of(type.charCodeAt(0)), int32(payload.length + 4), payload);
}

function authentication(code: number, ...data: readonly Uint8Array[]): Uint8Array {
  return message('R', int32(code), ...data);
}

function errorResponse(sqlState: string): Uint8Array {
  return message(
    'E',
    Uint8Array.of(83),
    cString('FATAL'),
    Uint8Array.of(67),
    cString(sqlState),
    Uint8Array.of(77),
    cString('mensagem do servidor falso'),
    Uint8Array.of(0),
  );
}

const READY_SEQUENCE: readonly Uint8Array[] = [
  authentication(0),
  message('S', cString('server_version'), cString('18.0')),
  message('K', int32(4242), int32(7)),
  message('Z', Uint8Array.of(73)),
];

type ScramExchange = {
  readonly clientFirstBare: string;
  readonly serverFirst: string;
  readonly serverNonce: string;
};

function sha256(data: Uint8Array): Buffer {
  return createHash('sha256').update(data).digest();
}

function hmac(key: Uint8Array, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

function parseAttributes(text: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const part of text.split(',')) attributes.set(part.slice(0, 1), part.slice(2));
  return attributes;
}

class FakeConnection {
  private buffer: Uint8Array = new Uint8Array(0);
  private hasStarted = false;
  private scram: ScramExchange | undefined;

  constructor(
    private readonly server: FakeServerState,
    readonly record: FakeConnectionRecord,
    private readonly events: TransportEvents,
  ) {}

  sendToClient(...parts: readonly Uint8Array[]): void {
    const bytes = concat(...parts);
    queueMicrotask(() => {
      if (this.record.isOpen) this.events.onData(bytes);
    });
  }

  closeFromServer(isAbrupt: boolean): void {
    if (!this.record.isOpen) return;
    this.record.isOpen = false;
    this.record.isListening = false;
    this.events.onClose(isAbrupt);
  }

  receive(bytes: Uint8Array): void {
    this.buffer = concat(this.buffer, bytes);
    while (this.consumeOne()) {
      // consome todas as mensagens completas do buffer
    }
  }

  private consumeOne(): boolean {
    if (!this.hasStarted) return this.consumeStartup();
    if (this.buffer.length < 5) return false;
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset);
    const total = 1 + view.getInt32(1);
    if (this.buffer.length < total) return false;
    const type = String.fromCharCode(this.buffer[0] ?? 0);
    const body = this.buffer.slice(5, total);
    this.buffer = this.buffer.slice(total);
    this.handleMessage(type, body);
    return true;
  }

  private consumeStartup(): boolean {
    if (this.buffer.length < 8) return false;
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset);
    const length = view.getInt32(0);
    const code = view.getInt32(4);
    if (this.buffer.length < length) return false;
    const body = this.buffer.slice(8, length);
    this.buffer = this.buffer.slice(length);
    if (code === SSL_REQUEST_CODE) {
      this.record.sslRequests += 1;
      const answer = this.server.tls === 'unsupported' ? 78 : 83;
      this.sendToClient(Uint8Array.of(answer));
      return true;
    }
    if (code !== PROTOCOL_VERSION) return this.fail('08P01');
    this.hasStarted = true;
    this.record.startupMessages += 1;
    const fields = TEXT_DECODER.decode(body).split('\0');
    this.record.startupUser = fields[fields.indexOf('user') + 1];
    this.record.startupDatabase = fields[fields.indexOf('database') + 1];
    this.startAuthentication();
    return true;
  }

  private fail(sqlState: string): boolean {
    this.sendToClient(errorResponse(sqlState));
    queueMicrotask(() => this.closeFromServer(false));
    return false;
  }

  private startAuthentication(): void {
    const mode = this.server.authentication;
    if (mode === 'trust') this.sendToClient(...READY_SEQUENCE);
    else if (mode === 'scram') {
      this.sendToClient(authentication(10, cString(SCRAM_MECHANISM), Uint8Array.of(0)));
    } else if (mode === 'md5') this.sendToClient(authentication(5, randomBytes(4)));
    else if (mode === 'cleartext') this.sendToClient(authentication(3));
    else this.fail('53300');
  }

  private handleMessage(type: string, body: Uint8Array): void {
    if (type === 'X') {
      this.record.isTerminated = true;
      this.closeFromServer(false);
    } else if (type === 'p') {
      this.record.passwordMessages += 1;
      this.handleSasl(body);
    } else if (type === 'Q') this.handleQuery(TEXT_DECODER.decode(body).replace(/\0$/, ''));
  }

  private handleSasl(body: Uint8Array): void {
    if (this.scram === undefined) {
      const mechanismEnd = body.indexOf(0);
      const data = TEXT_DECODER.decode(body.slice(mechanismEnd + 1 + 4));
      this.startScram(data);
      return;
    }
    this.finishScram(TEXT_DECODER.decode(body));
  }

  private startScram(clientFirst: string): void {
    const clientFirstBare = clientFirst.replace(/^n,,/, '');
    const clientNonce = parseAttributes(clientFirstBare).get('r') ?? '';
    const serverNonce = `${clientNonce}${randomBytes(12).toString('base64')}`;
    const serverFirst = `r=${serverNonce},s=${this.server.salt.toString('base64')},i=${SCRAM_ITERATIONS}`;
    this.scram = { clientFirstBare, serverFirst, serverNonce };
    this.sendToClient(authentication(11, TEXT_ENCODER.encode(serverFirst)));
  }

  private finishScram(clientFinal: string): void {
    const exchange = this.scram;
    if (exchange === undefined) return;
    const attributes = parseAttributes(clientFinal);
    const withoutProof = clientFinal.slice(0, clientFinal.lastIndexOf(',p='));
    const authMessage = `${exchange.clientFirstBare},${exchange.serverFirst},${withoutProof}`;
    const salted = pbkdf2Sync(
      this.server.password,
      this.server.salt,
      SCRAM_ITERATIONS,
      32,
      'sha256',
    );
    const clientKey = hmac(salted, CLIENT_KEY_LABEL);
    const signature = hmac(sha256(clientKey), authMessage);
    const proof = Buffer.from(attributes.get('p') ?? '', 'base64');
    const expectedProof = Buffer.from(
      clientKey.map((byte, index) => byte ^ (signature[index] ?? 0)),
    );
    const isValid =
      attributes.get('r') === exchange.serverNonce &&
      proof.length === expectedProof.length &&
      timingSafeEqual(proof, expectedProof);
    if (!isValid) {
      this.fail('28P01');
      return;
    }
    const serverSignature = hmac(hmac(salted, SERVER_KEY_LABEL), authMessage).toString('base64');
    this.sendToClient(authentication(12, TEXT_ENCODER.encode(`v=${serverSignature}`)));
    this.sendToClient(...READY_SEQUENCE);
  }

  private handleQuery(text: string): void {
    this.record.queries.push(text);
    if (this.server.isSilent) return;
    const listenMatch = /^LISTEN "([^"]+)"$/.exec(text);
    if (listenMatch !== null) {
      const acknowledge = (): void => {
        this.record.isListening = true;
        this.sendToClient(message('C', cString('LISTEN')), message('Z', Uint8Array.of(73)));
      };
      if (this.server.isListenAckHeld) this.server.heldAcknowledgements.push(acknowledge);
      else acknowledge();
    } else if (text === '') {
      this.sendToClient(message('I'), message('Z', Uint8Array.of(73)));
    }
  }
}

type FakeServerState = {
  authentication: FakeAuthentication;
  password: string;
  tls: FakeTls;
  salt: Buffer;
  isSilent: boolean;
  isRefusing: boolean;
  isListenAckHeld: boolean;
  heldAcknowledgements: (() => void)[];
};

export function createInMemoryPostgres(options: FakePostgresOptions): FakePostgres {
  const state: FakeServerState = {
    authentication: options.authentication,
    password: options.password ?? '',
    tls: options.tls ?? 'unsupported',
    salt: randomBytes(16),
    isSilent: false,
    isRefusing: false,
    isListenAckHeld: false,
    heldAcknowledgements: [],
  };
  const connections: FakeConnectionRecord[] = [];
  const live: FakeConnection[] = [];

  const openTransport: OpenTransport = (params) => {
    if (state.isRefusing) return Promise.reject(new Error('conexão recusada'));
    const record: FakeConnectionRecord = {
      sslRequests: 0,
      startupMessages: 0,
      startupUser: undefined,
      startupDatabase: undefined,
      queries: [],
      tlsUpgrades: [],
      passwordMessages: 0,
      isTerminated: false,
      isOpen: true,
      isListening: false,
    };
    const connection = new FakeConnection(state, record, params.events);
    connections.push(record);
    live.push(connection);
    const transport: PostgresTransport = {
      write: (bytes) => {
        const copy = Uint8Array.from(bytes);
        queueMicrotask(() => {
          if (record.isOpen) connection.receive(copy);
        });
      },
      upgradeToTls: (tlsOptions) => {
        record.tlsUpgrades.push(tlsOptions);
        return state.tls === 'handshake-fails'
          ? Promise.reject(new Error('handshake TLS falhou'))
          : Promise.resolve();
      },
      // Como `end()` do soquete: o que já foi escrito chega antes de a conexão fechar.
      close: () => {
        queueMicrotask(() => {
          if (!record.isOpen) return;
          record.isOpen = false;
          record.isListening = false;
        });
      },
    };
    return Promise.resolve(transport);
  };

  return {
    openTransport,
    connections,
    notify: (payload, channel = 'test_channel'): void => {
      const bytes = message('A', int32(4242), cString(channel), cString(payload));
      for (const connection of live) {
        if (connection.record.isListening) connection.sendToClient(bytes);
      }
    },
    dropConnections: (): void => {
      for (const connection of live) connection.closeFromServer(true);
    },
    sendRaw: (bytes): void => {
      for (const connection of live) connection.sendToClient(bytes);
    },
    setRefusing: (isRefusing): void => {
      state.isRefusing = isRefusing;
    },
    setSilent: (isSilent): void => {
      state.isSilent = isSilent;
    },
    holdListenAcknowledgement: (isHeld): void => {
      state.isListenAckHeld = isHeld;
      if (isHeld) return;
      for (const acknowledge of state.heldAcknowledgements.splice(0)) acknowledge();
    },
    setPassword: (password): void => {
      state.password = password;
    },
    listeningCount: (): number => connections.filter((record) => record.isListening).length,
  };
}
