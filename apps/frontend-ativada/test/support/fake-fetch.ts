// Copyright (c) 2026 Ada Technology. All rights reserved.
import { HTTP_STATUS } from '@ativada/environment';

export type FetchFunction = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type RecordedCall = {
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly headers: Headers;
  readonly body: unknown;
};

export type FakeResponder = (call: RecordedCall) => Response | Promise<Response>;

export type FakeRoute = {
  readonly method: string;
  readonly path: string;
  readonly respond: FakeResponder;
};

export type FakeFetch = {
  readonly fetch: FetchFunction;
  readonly calls: RecordedCall[];
  readonly callsTo: (method: string, path: string) => RecordedCall[];
};

export function jsonResponse(body: unknown, status: number = HTTP_STATUS.OK): Response {
  return Response.json(body, { status });
}

export function dataResponse(data: unknown, status: number = HTTP_STATUS.OK): Response {
  return jsonResponse({ data }, status);
}

export function pageResponse(
  items: readonly unknown[],
  nextCursor: string | null = null,
): Response {
  return jsonResponse({ data: items, pagination: { nextCursor, perPage: 100 } });
}

export function errorResponse(status: number, code: string): Response {
  return jsonResponse({ error: { code, message: `erro ${code}` } }, status);
}

function readBody(init: RequestInit | undefined): unknown {
  const body = init?.body;
  if (typeof body !== 'string') return undefined;
  const parsed: unknown = JSON.parse(body);
  return parsed;
}

export function createFakeFetch(routes: readonly FakeRoute[]): FakeFetch {
  const calls: RecordedCall[] = [];
  const fetchImplementation: FetchFunction = async (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      'http://127.0.0.1:56103',
    );
    const method = (init?.method ?? 'GET').toUpperCase();
    const call: RecordedCall = {
      method,
      path: url.pathname,
      query: url.searchParams,
      headers: new Headers(init?.headers),
      body: readBody(init),
    };
    calls.push(call);
    const route = routes.find(
      (candidate) => candidate.method === method && candidate.path === url.pathname,
    );
    if (route === undefined) return errorResponse(HTTP_STATUS.NOT_FOUND, 'ROUTE_NOT_FAKED');
    return route.respond(call);
  };
  return {
    fetch: fetchImplementation,
    calls,
    callsTo: (method, path) => calls.filter((call) => call.method === method && call.path === path),
  };
}

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function createFakeAccessToken(claims: Readonly<Record<string, unknown>>): string {
  return `${encodeSegment({ alg: 'RS256' })}.${encodeSegment(claims)}.signature`;
}

export async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error: unknown) {
    return error;
  }
  return undefined;
}
