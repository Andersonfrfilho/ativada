// Copyright (c) 2026 Ada Technology. All rights reserved.
import { HTTP_HEADER } from '../shared/http/http.constant.js';
import { AUTHORIZATION_HEADER_MAX_LENGTH } from './authentication.constant.js';

const BEARER_HEADER_PATTERN = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*)$/;

export function extractBearerToken(request: Request): string | undefined {
  const header = request.headers.get(HTTP_HEADER.AUTHORIZATION);
  if (header === null || header.length > AUTHORIZATION_HEADER_MAX_LENGTH) return undefined;
  return BEARER_HEADER_PATTERN.exec(header)?.[1];
}
