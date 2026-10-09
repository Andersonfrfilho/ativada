// Copyright (c) 2026 Ada Technology. All rights reserved.
import { assertCondition } from '../identity-test/identity-test.error.js';
import { parseJsonRecord, readString, type HttpResult } from '../identity-test/http-client.js';
import { requestTokenGrant } from '../identity-test/keycloak-client.js';
import { callApi, readCookieValue, type ApiCallResult } from './api-client.js';
import type { AuthorizationGrant } from './obtain-authorization-code.js';
import {
  EXPECTED_COOKIE_ATTRIBUTES,
  SESSION_CLIENT_ID,
  SESSION_COOKIE_NAME,
  SESSION_PATH,
  SESSION_REFRESH_PATH,
} from './session-test.constant.js';
import { reportSessionStep, type SessionFlowContext } from './session-flow-context.js';
import { assertAccessTokenIsAccepted } from './verify-with-real-jwks.js';

type CallOptions = { readonly cookie?: string; readonly body?: unknown };

function call(
  flow: SessionFlowContext,
  request: { readonly path: string; readonly method: string } & CallOptions,
): Promise<ApiCallResult> {
  return callApi({ baseUrl: flow.api.baseUrl, origin: flow.origin, ...request });
}

function readAccessToken(result: ApiCallResult): string {
  const body = parseJsonRecord({
    status: result.status,
    headers: new Headers(),
    text: result.text,
  });
  const data = body['data'];
  assertCondition(typeof data === 'object' && data !== null, 'resposta sem data');
  return readString(data as Record<string, unknown>, 'accessToken');
}

function assertRefreshStaysInCookie(result: ApiCallResult): string {
  const refreshToken = readCookieValue(result.setCookie);
  assertCondition(refreshToken.length > 20, 'o cookie não trouxe o refresh token');
  for (const attribute of EXPECTED_COOKIE_ATTRIBUTES) {
    assertCondition(result.setCookie.split('; ').includes(attribute), `cookie sem ${attribute}`);
  }
  assertCondition(!result.setCookie.includes('Domain'), 'o cookie não pode ter Domain');
  assertCondition(result.setCookie.startsWith(`${SESSION_COOKIE_NAME}=`), 'nome do cookie');
  assertCondition(!result.text.includes(refreshToken), 'o refresh apareceu no corpo');
  assertCondition(result.cacheControl === 'no-store', `Cache-Control: ${result.cacheControl}`);
  return refreshToken;
}

export async function openSession(
  flow: SessionFlowContext,
  grant: AuthorizationGrant,
): Promise<string> {
  const result = await call(flow, {
    path: SESSION_PATH,
    method: 'POST',
    body: {
      code: grant.code,
      codeVerifier: grant.pkce.verifier,
      redirectUri: flow.api.environment.SESSION_ALLOWED_REDIRECT_URIS[0],
    },
  });
  assertCondition(result.status === 200, `POST /v1/session: ${result.status} ${result.text}`);
  const refreshToken = assertRefreshStaysInCookie(result);
  await assertAccessTokenIsAccepted(flow, readAccessToken(result));
  reportSessionStep(
    'POST /v1/session',
    'código real trocado; refresh só no cookie; token aceito pela JWKS real',
  );
  return refreshToken;
}

export async function refreshTwiceInParallel(
  flow: SessionFlowContext,
  cookie: string,
): Promise<string> {
  const [first, second] = await Promise.all(
    [0, 1].map(() => call(flow, { path: SESSION_REFRESH_PATH, method: 'POST', cookie })),
  );
  assertCondition(
    first?.status === 200 && second?.status === 200,
    `refresh paralelo: ${first?.status}/${second?.status}`,
  );
  const rotated = assertRefreshStaysInCookie(first);
  assertCondition(
    readCookieValue(second.setCookie) === rotated,
    'os dois receberam cookies diferentes',
  );
  assertCondition(readAccessToken(first) === readAccessToken(second), 'access tokens diferentes');
  assertCondition(rotated !== cookie, 'o refresh não foi rotacionado');
  await assertAccessTokenIsAccepted(flow, readAccessToken(first));
  reportSessionStep(
    'POST /v1/session/refresh x2 em paralelo',
    'duas respostas 200 com o mesmo par; uma troca no Keycloak',
  );
  return rotated;
}

export async function refreshWithRotatedCookie(
  flow: SessionFlowContext,
  cookie: string,
): Promise<string> {
  const result = await call(flow, { path: SESSION_REFRESH_PATH, method: 'POST', cookie });
  assertCondition(result.status === 200, `refresh com o cookie rotacionado: ${result.status}`);
  reportSessionStep('refresh com o cookie rotacionado', 'novo par entregue');
  return assertRefreshStaysInCookie(result);
}

async function refreshDirectlyAtKeycloak(
  flow: SessionFlowContext,
  refreshToken: string,
): Promise<HttpResult> {
  return requestTokenGrant(flow.identity.environment, {
    grant_type: 'refresh_token',
    client_id: SESSION_CLIENT_ID,
    client_secret: flow.identity.environment.sessionClientSecret,
    refresh_token: refreshToken,
  });
}

export async function endSession(flow: SessionFlowContext, latestCookie: string): Promise<void> {
  const result = await call(flow, { path: SESSION_PATH, method: 'DELETE', cookie: latestCookie });
  assertCondition(result.status === 204, `DELETE /v1/session: ${result.status}`);
  assertCondition(result.setCookie.includes('Max-Age=0'), 'o cookie não foi apagado');
  const direct = await refreshDirectlyAtKeycloak(flow, latestCookie);
  assertCondition(direct.status === 400, `o refresh revogado ainda funciona: ${direct.status}`);
  const throughApi = await call(flow, {
    path: SESSION_REFRESH_PATH,
    method: 'POST',
    cookie: latestCookie,
  });
  assertCondition(throughApi.status === 401, `refresh após logout: ${throughApi.status}`);
  const again = await call(flow, { path: SESSION_PATH, method: 'DELETE' });
  assertCondition(again.status === 204, `DELETE sem cookie: ${again.status}`);
  reportSessionStep(
    'DELETE /v1/session',
    '204, cookie apagado, refresh revogado (400 no Keycloak, 401 na API)',
  );
}

export async function checkDefenses(flow: SessionFlowContext): Promise<void> {
  const withoutHeader = await callApi({
    baseUrl: flow.api.baseUrl,
    origin: flow.origin,
    path: SESSION_PATH,
    method: 'DELETE',
    omitRequestedWith: true,
  });
  const foreignOrigin = await callApi({
    baseUrl: flow.api.baseUrl,
    origin: 'http://evil.invalid',
    path: SESSION_PATH,
    method: 'DELETE',
  });
  assertCondition(withoutHeader.status === 403, `sem X-Requested-With: ${withoutHeader.status}`);
  assertCondition(foreignOrigin.status === 403, `Origin estranha: ${foreignOrigin.status}`);
  reportSessionStep('CSRF', 'sem X-Requested-With e com Origin estranha: 403');
}
