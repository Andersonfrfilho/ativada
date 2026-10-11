// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { createKeycloakIdentityAdmin } from '../packages/identity-admin/src/create-keycloak-identity-admin.js';
import { createKeycloakTokenClient } from '../apps/api-cryptoada/src/session/keycloak-token-client.js';
import { createTelegramBotClient } from '../apps/api-cryptoada/src/telegram/telegram-bot-client.js';

const SECRET = 'segredo-que-nao-pode-sair';
const REDIRECT_STATUS = 307;
const OK_STATUS = 200;

type Capture = { readonly path: string; readonly body: string; readonly authorization: string };

const captured: Capture[] = [];
let target: ReturnType<typeof Bun.serve>;
let redirector: ReturnType<typeof Bun.serve>;

function targetUrl(): string {
  return `http://127.0.0.1:${target.port}`;
}

function redirectorUrl(): string {
  return `http://127.0.0.1:${redirector.port}`;
}

beforeAll(() => {
  // O destino do redirecionamento: tudo o que chega aqui é segredo vazado para outro host.
  target = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: async (request): Promise<Response> => {
      captured.push({
        path: new URL(request.url).pathname,
        body: await request.text(),
        authorization: request.headers.get('authorization') ?? '',
      });
      return Response.json({ ok: true }, { status: OK_STATUS });
    },
  });
  redirector = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: (request): Response =>
      new Response(null, {
        status: REDIRECT_STATUS,
        headers: { Location: `${targetUrl()}${new URL(request.url).pathname}` },
      }),
  });
});

beforeEach(() => {
  captured.length = 0;
});

afterAll(async () => {
  await target.stop(true);
  await redirector.stop(true);
});

function leakedSecrets(): readonly Capture[] {
  return captured.filter(
    (entry) => entry.body.includes(SECRET) || entry.authorization.includes(SECRET),
  );
}

describe('chamadas com segredo recusam redirecionamento', () => {
  test('o cliente de token do Keycloak não reenvia o segredo do cliente nem o refresh', async () => {
    const client = createKeycloakTokenClient({
      tokenUrl: `${redirectorUrl()}/token`,
      logoutUrl: `${redirectorUrl()}/logout`,
      clientId: 'cliente',
      clientSecret: SECRET,
    });
    const refreshed = await client.refresh(`refresh-${SECRET}`);
    const revoked = await client.revoke(`refresh-${SECRET}`);
    expect(refreshed.status).toBe('unavailable');
    expect(revoked.status).toBe('unavailable');
    expect(leakedSecrets()).toHaveLength(0);
  });

  test('o cliente do bot do Telegram não reenvia o token que vai no caminho', async () => {
    const client = createTelegramBotClient({ apiBaseUrl: redirectorUrl(), botToken: SECRET });
    expect(await client.sendMessage({ chatId: '1', text: 'oi' })).toBe(false);
    expect(captured.some((entry) => entry.path.includes(SECRET))).toBe(false);
  });

  test('o cliente da Admin API não reenvia o bearer nem o segredo do cliente de serviço', async () => {
    const admin = createKeycloakIdentityAdmin({
      adminApiUrl: `${redirectorUrl()}/admin`,
      tokenUrl: `${redirectorUrl()}/token`,
      clientId: 'servico',
      clientSecret: SECRET,
      now: () => Date.now(),
    });
    expect((await admin.verifyRealm()).status).toBe('unavailable');
    expect(leakedSecrets()).toHaveLength(0);
  });

  test('o bearer já emitido também não segue redirecionamento da Admin API', async () => {
    const issuer = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: (): Response =>
        Response.json({ access_token: `bearer-${SECRET}`, expires_in: 300 }, { status: OK_STATUS }),
    });
    try {
      const admin = createKeycloakIdentityAdmin({
        adminApiUrl: `${redirectorUrl()}/admin`,
        tokenUrl: `http://127.0.0.1:${issuer.port}/token`,
        clientId: 'servico',
        clientSecret: 'outro',
        now: () => Date.now(),
      });
      expect((await admin.verifyRealm()).status).toBe('unavailable');
      expect(leakedSecrets()).toHaveLength(0);
    } finally {
      await issuer.stop(true);
    }
  });
});
