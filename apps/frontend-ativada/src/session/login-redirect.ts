// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { ROUTE_PATH } from '../app/app.constant.js';
import { createCodeVerifier, createState, deriveCodeChallenge } from './pkce.js';
import { LOGIN_ATTEMPT_STORAGE_KEY, LOGIN_SCOPE } from './session.constant.js';

export type LoginConfig = {
  readonly authorizeUrl: string;
  readonly clientId: string;
};

export type AuthorizeParams = {
  readonly config: LoginConfig;
  readonly redirectUri: string;
  readonly state: string;
  readonly codeChallenge: string;
};

export type StartLoginParams = {
  readonly config: LoginConfig;
  readonly storage: Storage;
  readonly navigate: (url: string) => void;
};

export type LoginAttempt = { readonly state: string; readonly codeVerifier: string };

const loginAttemptSchema = z.object({ state: z.string(), codeVerifier: z.string() });

export function buildRedirectUri(origin: string): string {
  return `${origin}${ROUTE_PATH.AUTH_CALLBACK}`;
}

export function buildAuthorizeUrl(params: AuthorizeParams): string {
  const url = new URL(params.config.authorizeUrl);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: params.config.clientId,
    redirect_uri: params.redirectUri,
    scope: LOGIN_SCOPE,
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

// O verifier fica em sessionStorage só até o retorno do login (ADR 0001 §a); o token nunca passa por aqui.
export async function startLogin(params: StartLoginParams): Promise<void> {
  const codeVerifier = createCodeVerifier();
  const state = createState();
  const attempt: LoginAttempt = { state, codeVerifier };
  params.storage.setItem(LOGIN_ATTEMPT_STORAGE_KEY, JSON.stringify(attempt));
  params.navigate(
    buildAuthorizeUrl({
      config: params.config,
      redirectUri: buildRedirectUri(window.location.origin),
      state,
      codeChallenge: await deriveCodeChallenge(codeVerifier),
    }),
  );
}

// Uso único: lê e apaga, e só devolve a tentativa se o `state` do retorno for o que saiu daqui.
export function consumeLoginAttempt(storage: Storage, state: string): LoginAttempt | undefined {
  const stored = storage.getItem(LOGIN_ATTEMPT_STORAGE_KEY);
  storage.removeItem(LOGIN_ATTEMPT_STORAGE_KEY);
  if (stored === null) return undefined;
  try {
    const parsed = loginAttemptSchema.safeParse(JSON.parse(stored));
    return parsed.success && parsed.data.state === state ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
