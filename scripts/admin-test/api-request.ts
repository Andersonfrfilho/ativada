// Copyright (c) 2026 Ada Technology. All rights reserved.
import { REQUESTED_WITH_VALUE } from './admin-test.constant.js';

export type ApiRequest = {
  readonly baseUrl: string;
  readonly path: string;
  readonly method?: string;
  readonly token?: string;
  readonly body?: unknown;
  readonly origin?: string;
  readonly headers?: Readonly<Record<string, string>>;
};

export type ApiAnswer = {
  readonly status: number;
  readonly text: string;
  readonly json: Record<string, unknown>;
};

export async function requestApi(request: ApiRequest): Promise<ApiAnswer> {
  const headers = new Headers({ 'Content-Type': 'application/json', ...request.headers });
  if (request.token !== undefined) headers.set('Authorization', `Bearer ${request.token}`);
  if (request.origin !== undefined) {
    headers.set('Origin', request.origin);
    headers.set('X-Requested-With', REQUESTED_WITH_VALUE);
  }
  const response = await fetch(`${request.baseUrl}${request.path}`, {
    method: request.method ?? (request.body === undefined ? 'GET' : 'POST'),
    headers,
    ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
  });
  const text = await response.text();
  const parsed: unknown = text.length === 0 ? {} : JSON.parse(text);
  const json =
    typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  return { status: response.status, text, json };
}

export function readData(answer: ApiAnswer): Record<string, unknown> {
  const data = answer.json['data'];
  return typeof data === 'object' && data !== null && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
}

export function readErrorCode(answer: ApiAnswer): string {
  const error = answer.json['error'];
  const code =
    typeof error === 'object' && error !== null ? (error as Record<string, unknown>)['code'] : '';
  return typeof code === 'string' ? code : '';
}
