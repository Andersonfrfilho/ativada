// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createHash, randomBytes } from 'node:crypto';
import type { IdentityEnvironment } from './identity-environment.js';
import { buildRealmUrl, PANEL_CLIENT_ID } from './keycloak-client.js';
import { sendRequest, type HttpResult } from './http-client.js';
import { IdentityTestError } from './identity-test.error.js';

const FORM_ACTION_PATTERN = /<form[^>]*\saction="([^"]+)"/;

export type PkcePair = {
  readonly verifier: string;
  readonly challenge: string;
};

export type LoginStep =
  | { readonly kind: 'page'; readonly html: string; readonly cookies: string }
  | { readonly kind: 'redirect'; readonly location: string };

export type StartLoginParams = {
  readonly environment: IdentityEnvironment;
  readonly pkce: PkcePair | undefined;
  readonly acrValues?: string;
  readonly clientId?: string;
};

export function createPkcePair(): PkcePair {
  const verifier = randomBytes(48).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export function buildPanelRedirectUri(environment: IdentityEnvironment): string {
  return `${environment.panelOrigin}/auth/callback`;
}

export function buildAuthorizationUrl(
  environment: IdentityEnvironment,
  parameters: Readonly<Record<string, string>>,
): string {
  const query = new URLSearchParams({
    client_id: PANEL_CLIENT_ID,
    redirect_uri: buildPanelRedirectUri(environment),
    response_type: 'code',
    scope: 'openid',
    state: 'identity-test',
    ...parameters,
  });
  return `${buildRealmUrl(environment)}/protocol/openid-connect/auth?${query.toString()}`;
}

function collectCookies(result: HttpResult, previous: string): string {
  const jar = new Map<string, string>();
  for (const pair of previous.split('; ').filter((entry) => entry.length > 0)) {
    jar.set(pair.slice(0, pair.indexOf('=')), pair);
  }
  for (const header of result.headers.getSetCookie()) {
    const pair = header.split(';')[0] ?? '';
    jar.set(pair.slice(0, pair.indexOf('=')), pair);
  }
  return [...jar.values()].join('; ');
}

function classify(result: HttpResult, cookies: string): LoginStep {
  const location = result.headers.get('location');
  if (result.status >= 300 && result.status < 400 && location !== null) {
    return { kind: 'redirect', location };
  }
  if (result.status !== 200) {
    throw new IdentityTestError(`login respondeu ${result.status}: ${result.text.slice(0, 200)}`);
  }
  return { kind: 'page', html: result.text, cookies };
}

export async function startLogin(params: StartLoginParams): Promise<LoginStep> {
  const query: Record<string, string> = {};
  if (params.pkce !== undefined) {
    query['code_challenge'] = params.pkce.challenge;
    query['code_challenge_method'] = 'S256';
  }
  if (params.acrValues !== undefined) query['acr_values'] = params.acrValues;
  if (params.clientId !== undefined) query['client_id'] = params.clientId;
  const result = await sendRequest({ url: buildAuthorizationUrl(params.environment, query) });
  return classify(result, collectCookies(result, ''));
}

export async function submitLoginForm(
  page: Extract<LoginStep, { kind: 'page' }>,
  fields: Readonly<Record<string, string>>,
): Promise<LoginStep> {
  const action = FORM_ACTION_PATTERN.exec(page.html)?.[1]?.replaceAll('&amp;', '&');
  if (action === undefined) throw new IdentityTestError('página de login sem formulário');
  let cookies = page.cookies;
  let result = await sendRequest({ url: action, form: fields, cookies });
  cookies = collectCookies(result, cookies);
  const keycloakOrigin = new URL(action).origin;
  let location = result.headers.get('location');
  while (location !== null && new URL(location).origin === keycloakOrigin) {
    result = await sendRequest({ url: location, cookies });
    cookies = collectCookies(result, cookies);
    location = result.headers.get('location');
  }
  return classify(result, cookies);
}

export function readAuthorizationCode(location: string): string {
  const code = new URL(location).searchParams.get('code');
  if (code === null) throw new IdentityTestError(`redirect sem code: ${location}`);
  return code;
}
