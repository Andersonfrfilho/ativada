// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { loadEnvironment, resolveAuthorizeUrl } from '../src/environment.js';

const LOCAL = 'http://127.0.0.1:56180/realms/ativada/protocol/openid-connect/auth';
const TUNNEL = 'https://kc.trycloudflare.com/realms/ativada/protocol/openid-connect/auth';

function environmentWith(byOrigin?: string): ReturnType<typeof loadEnvironment> {
  return loadEnvironment({
    VITE_API_URL: 'http://127.0.0.1:56101',
    VITE_KEYCLOAK_AUTHORIZE_URL: LOCAL,
    ...(byOrigin === undefined ? {} : { VITE_KEYCLOAK_AUTHORIZE_URL_BY_ORIGIN: byOrigin }),
  });
}

describe('o login segue o endereço do painel', () => {
  test('the listed origin logs in through its own Keycloak, any other origin through the default', () => {
    const environment = environmentWith(`https://panel.trycloudflare.com|${TUNNEL}`);
    expect(resolveAuthorizeUrl(environment, 'https://panel.trycloudflare.com')).toBe(TUNNEL);
    expect(resolveAuthorizeUrl(environment, 'http://127.0.0.1:56100')).toBe(LOCAL);
  });

  test('without the map, or with a broken entry, everyone uses the default', () => {
    expect(resolveAuthorizeUrl(environmentWith(), 'https://panel.trycloudflare.com')).toBe(LOCAL);
    const broken = environmentWith('https://panel.trycloudflare.com|');
    expect(resolveAuthorizeUrl(broken, 'https://panel.trycloudflare.com')).toBe(LOCAL);
  });
});
