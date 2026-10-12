// Copyright (c) 2026 Ada Technology. All rights reserved.
import { HTTP_HEADER } from '../shared/http/http.constant.js';
import {
  REFRESH_COOKIE_ATTRIBUTES,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_VALUE_PATTERN,
} from './session.constant.js';

export type BuildRefreshCookieParams = {
  readonly value: string;
  readonly maxAgeSeconds: number;
};

export function buildRefreshCookie(params: BuildRefreshCookieParams): string {
  const maxAge = params.maxAgeSeconds > 0 ? [`Max-Age=${params.maxAgeSeconds}`] : [];
  return [`${REFRESH_COOKIE_NAME}=${params.value}`, ...REFRESH_COOKIE_ATTRIBUTES, ...maxAge].join(
    '; ',
  );
}

export function buildClearedRefreshCookie(): string {
  return [`${REFRESH_COOKIE_NAME}=`, ...REFRESH_COOKIE_ATTRIBUTES, 'Max-Age=0'].join('; ');
}

export function readRefreshCookie(request: Request): string | undefined {
  const header = request.headers.get(HTTP_HEADER.COOKIE);
  if (header === null) return undefined;
  const prefix = `${REFRESH_COOKIE_NAME}=`;
  const entry = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  const value = entry?.slice(prefix.length);
  if (value === undefined || !REFRESH_COOKIE_VALUE_PATTERN.test(value)) return undefined;
  return value;
}
