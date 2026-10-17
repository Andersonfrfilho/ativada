// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  buildInvalidBody,
  buildRefusalBody,
  buildSuccessBody,
  buildTruncatedBody,
  FAKE_BUY_REPORT,
  FAKE_DEFAULT_USAGE,
  FAKE_PROVIDER,
  type FakeProviderKind,
  type FakeUsage,
} from './fake-provider-payloads.js';

export type FakeBehavior =
  | { readonly kind: 'report'; readonly report?: unknown; readonly usage?: FakeUsage }
  | { readonly kind: 'invalid_output' }
  | { readonly kind: 'refusal' }
  | { readonly kind: 'truncated' }
  | { readonly kind: 'status'; readonly status: number; readonly retryAfterSeconds?: number }
  | { readonly kind: 'hang' }
  | { readonly kind: 'redirect' };

export type RecordedRequest = {
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
};

export type FakeProviderSettings = {
  readonly kind: FakeProviderKind;
  // Chave e id do modelo que o falso aceita: outra chave dá 401, outro id dá 404, como o provedor de verdade.
  readonly expectedKey: string;
  readonly expectedModel: string;
};

export type FakeProviderServer = {
  readonly url: string;
  readonly requests: RecordedRequest[];
  behavior: FakeBehavior;
  readonly stop: () => Promise<void>;
};

const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_FOUND = 302;

function readCredential(kind: FakeProviderKind, request: Request): string {
  if (kind === FAKE_PROVIDER.ANTHROPIC) return request.headers.get('x-api-key') ?? '';
  if (kind === FAKE_PROVIDER.GEMINI) return request.headers.get('x-goog-api-key') ?? '';
  return (request.headers.get('authorization') ?? '').replace(/^Bearer /u, '');
}

function readModel(kind: FakeProviderKind, path: string, body: string): string {
  if (kind === FAKE_PROVIDER.GEMINI)
    return /\/models\/([^:/]+):generateContent$/u.exec(path)?.[1] ?? '';
  const parsed: unknown = JSON.parse(body || '{}');
  const model = (parsed as { model?: unknown }).model;
  return typeof model === 'string' ? model : '';
}

function buildResponse(
  settings: FakeProviderSettings,
  behavior: FakeBehavior,
): Response | undefined {
  const { kind } = settings;
  const usage =
    behavior.kind === 'report' ? (behavior.usage ?? FAKE_DEFAULT_USAGE) : FAKE_DEFAULT_USAGE;
  if (behavior.kind === 'report') {
    return Response.json(buildSuccessBody(kind, behavior.report ?? FAKE_BUY_REPORT, usage));
  }
  if (behavior.kind === 'invalid_output') return Response.json(buildInvalidBody(kind, usage));
  if (behavior.kind === 'refusal') return Response.json(buildRefusalBody(kind, usage));
  if (behavior.kind === 'truncated') return Response.json(buildTruncatedBody(kind, usage));
  if (behavior.kind === 'status') {
    const headers: Record<string, string> =
      behavior.retryAfterSeconds === undefined
        ? {}
        : { 'retry-after': String(behavior.retryAfterSeconds) };
    return new Response(JSON.stringify({ error: { message: 'falso' } }), {
      status: behavior.status,
      headers,
    });
  }
  if (behavior.kind === 'redirect') {
    return new Response(null, { status: HTTP_FOUND, headers: { location: 'http://127.0.0.1:1/' } });
  }
  return undefined;
}

// Um provedor falso local (nunca rede real): grava cada pedido, confere a chave e o id do modelo e responde como `behavior` manda.
export function startFakeProvider(settings: FakeProviderSettings): FakeProviderServer {
  const requests: RecordedRequest[] = [];
  const state: { behavior: FakeBehavior } = { behavior: { kind: 'report' } };
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: async (request) => {
      const path = new URL(request.url).pathname;
      const body = await request.text();
      requests.push({ path, headers: Object.fromEntries(request.headers), body });
      if (readCredential(settings.kind, request) !== settings.expectedKey) {
        return new Response('{}', { status: HTTP_UNAUTHORIZED });
      }
      if (readModel(settings.kind, path, body) !== settings.expectedModel) {
        return new Response('{}', { status: HTTP_NOT_FOUND });
      }
      const response = buildResponse(settings, state.behavior);
      if (response !== undefined) return response;
      return new Promise<Response>(() => undefined);
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}`,
    requests,
    get behavior(): FakeBehavior {
      return state.behavior;
    },
    set behavior(next: FakeBehavior) {
      state.behavior = next;
    },
    stop: () => server.stop(true),
  };
}
