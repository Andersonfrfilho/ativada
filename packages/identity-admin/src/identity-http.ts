// Copyright (c) 2026 Ada Technology. All rights reserved.
import { AUTHORIZATION_HEADER, HTTP_STATUS, type HttpMethod } from './identity-http.constant.js';
import { IDENTITY_REQUEST_TIMEOUT_MILLISECONDS } from './identity-admin.constant.js';
import type { ServiceAccountTokenProvider } from './service-account-token.js';

export type IdentityRequest = {
  readonly method: HttpMethod;
  readonly path: string;
  readonly json?: unknown;
};

export type IdentityResponse = {
  readonly status: number;
  readonly location: string | null;
  readonly body: unknown;
};

export type IdentityHttp = (request: IdentityRequest) => Promise<IdentityResponse | undefined>;

export type IdentityHttpSettings = {
  readonly adminApiUrl: string;
  readonly tokens: ServiceAccountTokenProvider;
};

export function createIdentityHttp(settings: IdentityHttpSettings): IdentityHttp {
  const baseUrl = settings.adminApiUrl.replace(/\/+$/, '');
  return async (request) => {
    const token = await settings.tokens.getToken();
    if (token === undefined) return undefined;
    try {
      const response = await fetch(`${baseUrl}${request.path}`, {
        method: request.method,
        headers: {
          [AUTHORIZATION_HEADER]: `Bearer ${token}`,
          ...(request.json === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(request.json === undefined ? {} : { body: JSON.stringify(request.json) }),
        redirect: 'error',
        signal: AbortSignal.timeout(IDENTITY_REQUEST_TIMEOUT_MILLISECONDS),
      });
      if (response.status === HTTP_STATUS.UNAUTHORIZED) settings.tokens.discardToken();
      const body: unknown = await response.json().catch(() => undefined);
      return {
        status: response.status,
        location: response.headers.get('Location'),
        body,
      };
    } catch {
      return undefined;
    }
  };
}
