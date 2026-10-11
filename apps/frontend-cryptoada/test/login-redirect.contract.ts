// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { createCodeVerifier, createState, deriveCodeChallenge } from '../src/session/pkce.js';
import {
  buildAuthorizeUrl,
  consumeLoginAttempt,
  startLogin,
} from '../src/session/login-redirect.js';

const RFC7636_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC7636_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const CONFIG = {
  authorizeUrl: 'http://127.0.0.1:56181/realms/cryptoada/protocol/openid-connect/auth',
  clientId: 'cryptoada-session',
};

describe('PKCE', () => {
  test('derives the S256 challenge exactly as RFC 7636 appendix B', async () => {
    expect(await deriveCodeChallenge(RFC7636_VERIFIER)).toBe(RFC7636_CHALLENGE);
  });

  test('creates verifiers inside the 43..128 unreserved alphabet, never repeating', () => {
    const verifiers = Array.from({ length: 20 }, createCodeVerifier);
    for (const verifier of verifiers) {
      expect(verifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);
    }
    expect(new Set(verifiers).size).toBe(verifiers.length);
    expect(createState()).not.toBe(createState());
  });
});

async function startAndReadState(): Promise<string> {
  let destination = '';
  await startLogin({
    config: CONFIG,
    storage: window.sessionStorage,
    navigate: (url) => void (destination = url),
  });
  return new URL(destination).searchParams.get('state') ?? '';
}

describe('login redirect', () => {
  test('builds the authorization URL with code flow, S256 and the exact redirect URI', () => {
    const url = new URL(
      buildAuthorizeUrl({
        config: CONFIG,
        redirectUri: 'http://127.0.0.1:56103/auth/callback',
        state: 'state-1',
        codeChallenge: RFC7636_CHALLENGE,
      }),
    );
    expect(url.origin + url.pathname).toBe(CONFIG.authorizeUrl);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('cryptoada-session');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(RFC7636_CHALLENGE);
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:56103/auth/callback');
    expect(url.searchParams.get('state')).toBe('state-1');
    expect(url.searchParams.get('scope')).toContain('openid');
  });

  test('keeps the verifier only in sessionStorage until the callback consumes it once', async () => {
    const state = await startAndReadState();
    expect(window.localStorage.length).toBe(0);
    const attempt = consumeLoginAttempt(window.sessionStorage, state);
    expect(attempt?.codeVerifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);
    expect(consumeLoginAttempt(window.sessionStorage, state)).toBeUndefined();
  });

  test('a callback with a different state burns the attempt, even for the right state afterwards', async () => {
    const state = await startAndReadState();
    expect(consumeLoginAttempt(window.sessionStorage, 'another-state')).toBeUndefined();
    expect(consumeLoginAttempt(window.sessionStorage, state)).toBeUndefined();
  });
});
