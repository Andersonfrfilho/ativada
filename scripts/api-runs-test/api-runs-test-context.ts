// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  closeDatabase,
  createCandleRepository,
  openDatabase,
  type DatabaseHandle,
} from '../../packages/database/src/index.js';
import type { EngineCandle } from '../../packages/strategy-engine/src/index.js';
import {
  createTestSigningKey,
  signTestToken,
  TEST_ISSUER,
  type TestSigningKey,
} from '../../test/fixtures/token-signing.fixture.js';
import {
  startJwksTestServer,
  type JwksTestServer,
} from '../../test/fixtures/jwks-test-server.fixture.js';
import { startApi, type RunningApi } from '../session-test/start-api.js';
import { EXCHANGE } from './api-runs-test.constant.js';

export type ApiResponse = {
  readonly status: number;
  readonly headers: Headers;
  readonly text: string;
  readonly json: unknown;
};

export type CallParams = {
  readonly subject?: string;
  // Declarações extras do token (por exemplo, o papel `admin` e `acr`).
  readonly claims?: Readonly<Record<string, unknown>>;
  // Validade do access token em segundos (o padrão é 5 min): o stream fecha o socket quando o token vence.
  readonly lifetimeSeconds?: number;
  readonly method?: string;
  readonly path: string;
  readonly body?: unknown;
};

export type ApiRunsContext = {
  readonly databaseUrl: string;
  readonly handle: DatabaseHandle;
  readonly client: Bun.SQL;
  readonly api: RunningApi;
  readonly jwks: JwksTestServer;
  readonly call: (params: CallParams) => Promise<ApiResponse>;
  readonly stop: () => Promise<void>;
};

function parseJson(text: string): unknown {
  try {
    return text.length === 0 ? undefined : (JSON.parse(text) as unknown);
  } catch {
    return undefined;
  }
}

async function request(
  baseUrl: string,
  key: TestSigningKey,
  params: CallParams,
): Promise<ApiResponse> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (params.subject !== undefined) {
    headers.set(
      'Authorization',
      `Bearer ${await signTestToken({
        key,
        claims: { sub: params.subject, ...params.claims },
        ...(params.lifetimeSeconds === undefined
          ? {}
          : { lifetimeSeconds: params.lifetimeSeconds }),
      })}`,
    );
  }
  const response = await fetch(`${baseUrl}${params.path}`, {
    method: params.method ?? 'GET',
    headers,
    ...(params.body === undefined ? {} : { body: JSON.stringify(params.body) }),
  });
  const text = await response.text();
  return { status: response.status, headers: response.headers, text, json: parseJson(text) };
}

// Sobe a API DE VERDADE (main da produção, só sem o processo à parte) com autenticação de teste: o token é assinado por
// uma JWKS local, como nos contratos de rota, e a API o valida pelo mesmo caminho do Keycloak.
export async function createApiRunsContext(databaseUrl: string): Promise<ApiRunsContext> {
  const key = await createTestSigningKey('key-api-runs');
  const jwks = startJwksTestServer([key]);
  Bun.env['DATABASE_URL'] = databaseUrl;
  Bun.env['KEYCLOAK_ISSUER'] = TEST_ISSUER;
  Bun.env['KEYCLOAK_JWKS_URL'] = jwks.url;
  const api = startApi();
  const handle = openDatabase(databaseUrl);
  const client = new Bun.SQL(databaseUrl);
  return {
    databaseUrl,
    handle,
    client,
    api,
    jwks,
    call: (params) => request(api.baseUrl, key, params),
    stop: async (): Promise<void> => {
      await api.stop();
      await jwks.stop();
      await client.close();
      await closeDatabase(handle);
    },
  };
}

export async function seedCandles(
  context: ApiRunsContext,
  candles: readonly EngineCandle[],
): Promise<void> {
  const repository = createCandleRepository(context.handle, { now: () => Date.now() });
  await repository.upsertCandles(
    candles.map((candle) => ({
      exchange: EXCHANGE,
      symbol: candle.symbol,
      timeframe: candle.timeframe,
      openTime: candle.openTime,
      closeTime: candle.closeTime,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      tradeCount: 1,
    })),
  );
}

export function assertCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function reportLine(message: string): void {
  process.stdout.write(`api-runs-test: ${message}\n`);
}

type CountRow = { readonly total: number };

export async function countRows(client: Bun.SQL, table: string, runId: string): Promise<number> {
  const rows: unknown = await client.unsafe(
    `SELECT count(*)::int AS total FROM ${table} WHERE run_id = $1`,
    [runId],
  );
  return (rows as readonly CountRow[])[0]?.total ?? 0;
}
