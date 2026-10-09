// Copyright (c) 2026 Ada Technology. All rights reserved.
import { REQUESTED_WITH_VALUE, SESSION_COOKIE_NAME } from './session-test.constant.js';

export type ApiCallParams = {
  readonly baseUrl: string;
  readonly path: string;
  readonly method: string;
  readonly origin: string;
  readonly cookie?: string;
  readonly body?: unknown;
  readonly omitRequestedWith?: boolean;
};

export type ApiCallResult = {
  readonly status: number;
  readonly setCookie: string;
  readonly cacheControl: string;
  readonly text: string;
};

export async function callApi(params: ApiCallParams): Promise<ApiCallResult> {
  const headers = new Headers({ Origin: params.origin, 'Content-Type': 'application/json' });
  if (params.omitRequestedWith !== true) headers.set('X-Requested-With', REQUESTED_WITH_VALUE);
  if (params.cookie !== undefined) headers.set('Cookie', `${SESSION_COOKIE_NAME}=${params.cookie}`);
  const response = await fetch(`${params.baseUrl}${params.path}`, {
    method: params.method,
    headers,
    ...(params.body === undefined ? {} : { body: JSON.stringify(params.body) }),
  });
  return {
    status: response.status,
    setCookie: response.headers.get('Set-Cookie') ?? '',
    cacheControl: response.headers.get('Cache-Control') ?? '',
    text: await response.text(),
  };
}

export function readCookieValue(setCookie: string): string {
  const prefix = `${SESSION_COOKIE_NAME}=`;
  return setCookie.slice(prefix.length, setCookie.indexOf(';'));
}
