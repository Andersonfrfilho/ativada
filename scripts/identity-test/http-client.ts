// Copyright (c) 2026 Ada Technology. All rights reserved.

export type HttpRequest = {
  readonly url: string;
  readonly method?: string;
  readonly token?: string;
  readonly json?: unknown;
  readonly form?: Readonly<Record<string, string>>;
  readonly cookies?: string;
};

export type HttpResult = {
  readonly status: number;
  readonly headers: Headers;
  readonly text: string;
};

export type JsonRecord = Readonly<Record<string, unknown>>;

export function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function sendRequest(request: HttpRequest): Promise<HttpResult> {
  const headers = new Headers();
  if (request.token !== undefined) headers.set('authorization', `Bearer ${request.token}`);
  if (request.cookies !== undefined) headers.set('cookie', request.cookies);
  let body: string | undefined;
  if (request.json !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(request.json);
  }
  if (request.form !== undefined) {
    headers.set('content-type', 'application/x-www-form-urlencoded');
    body = new URLSearchParams(request.form).toString();
  }
  const response = await fetch(request.url, {
    method: request.method ?? (body === undefined ? 'GET' : 'POST'),
    headers,
    redirect: 'manual',
    ...(body === undefined ? {} : { body }),
  });
  return { status: response.status, headers: response.headers, text: await response.text() };
}

export function parseJsonRecord(result: HttpResult): JsonRecord {
  const parsed: unknown = JSON.parse(result.text);
  if (!isJsonRecord(parsed)) throw new Error(`resposta não é um objeto JSON: ${result.text}`);
  return parsed;
}

export function readText(record: JsonRecord, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

export function readString(record: JsonRecord, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') throw new Error(`campo ${key} ausente ou não textual`);
  return value;
}
