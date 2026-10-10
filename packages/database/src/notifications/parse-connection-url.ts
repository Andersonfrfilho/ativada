// Copyright (c) 2026 Ada Technology. All rights reserved.
const DEFAULT_PORT = 5432;
const POSTGRES_PROTOCOLS: readonly string[] = ['postgres:', 'postgresql:'];

export const SSL_MODE = {
  DISABLE: 'disable',
  PREFER: 'prefer',
  REQUIRE: 'require',
  VERIFY: 'verify',
} as const;

export type SslMode = (typeof SSL_MODE)[keyof typeof SSL_MODE];

const SSL_MODE_BY_NAME: Readonly<Record<string, SslMode>> = {
  disable: SSL_MODE.DISABLE,
  allow: SSL_MODE.PREFER,
  prefer: SSL_MODE.PREFER,
  require: SSL_MODE.REQUIRE,
  'verify-ca': SSL_MODE.VERIFY,
  'verify-full': SSL_MODE.VERIFY,
};

export type ConnectionSettings = {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: string;
  readonly database: string;
  readonly sslMode: SslMode;
};

// Mensagem fixa: a URL traz a senha e nunca volta num erro.
export class InvalidConnectionUrlError extends Error {
  constructor() {
    super(
      'DATABASE_URL inválida para a conexão de escuta (postgres://usuario:senha@host[:porta]/banco).',
    );
    this.name = 'InvalidConnectionUrlError';
  }
}

function readSslMode(parsed: URL): SslMode {
  const name = parsed.searchParams.get('sslmode');
  if (name === null) return SSL_MODE.PREFER;
  const mode = SSL_MODE_BY_NAME[name];
  if (mode === undefined) throw new InvalidConnectionUrlError();
  return mode;
}

function stripIpv6Brackets(hostname: string): string {
  const isIpv6Literal = hostname.startsWith('[') && hostname.endsWith(']');
  return isIpv6Literal ? hostname.slice(1, -1) : hostname;
}

export function parseConnectionUrl(databaseUrl: string): ConnectionSettings {
  if (!URL.canParse(databaseUrl)) throw new InvalidConnectionUrlError();
  const parsed = new URL(databaseUrl);
  const database = decodeURIComponent(parsed.pathname.slice(1));
  const user = decodeURIComponent(parsed.username);
  if (!POSTGRES_PROTOCOLS.includes(parsed.protocol)) throw new InvalidConnectionUrlError();
  if (user.length === 0 || database.length === 0 || parsed.hostname.length === 0) {
    throw new InvalidConnectionUrlError();
  }
  return {
    host: stripIpv6Brackets(parsed.hostname),
    port: parsed.port === '' ? DEFAULT_PORT : Number(parsed.port),
    user,
    password: decodeURIComponent(parsed.password),
    database,
    sslMode: readSslMode(parsed),
  };
}
