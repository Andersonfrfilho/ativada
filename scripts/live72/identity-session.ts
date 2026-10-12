// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createPkcePair,
  readAuthorizationCode,
  startLogin,
  submitLoginForm,
} from '../identity-test/browser-login.js';
import { readString, sendRequest, type JsonRecord } from '../identity-test/http-client.js';
import type { IdentityEnvironment } from '../identity-test/identity-environment.js';
import { buildAdminUrl, fetchMasterAdminToken } from '../identity-test/keycloak-client.js';
import { readData, requestApi } from '../admin-test/api-request.js';
import { HTTP_CREATED } from './live72.constant.js';

const SESSION_CLIENT_ID = 'ativada-session';
const SESSION_PATH = '/v1/session';
const ME_PATH = '/v1/me';
const TELEGRAM_LINK_PATH = '/v1/me/telegram-link';
const TELEGRAM_WEBHOOK_PATH = '/v1/telegram/webhook';
const WEBHOOK_SECRET_HEADER = 'X-Telegram-Bot-Api-Secret-Token';
const FAKE_CHAT_ID = 720072;
const HTTP_CREATED_USER = 201;

export type Live72Credentials = {
  readonly username: string;
  readonly email: string;
  readonly password: string;
};

export type Session = {
  readonly accessToken: string;
  readonly userId: string;
  readonly isTelegramLinked: boolean;
};

async function findUserId(
  identity: IdentityEnvironment,
  username: string,
): Promise<string | undefined> {
  const adminToken = await fetchMasterAdminToken(identity);
  const found = await sendRequest({
    url: `${buildAdminUrl(identity)}/users?username=${encodeURIComponent(username)}&exact=true`,
    token: adminToken,
  });
  const parsed: unknown = JSON.parse(found.text);
  const first: unknown = Array.isArray(parsed) ? parsed[0] : undefined;
  if (typeof first !== 'object' || first === null) return undefined;
  return readString(first as JsonRecord, 'id');
}

// Cria o usuário só se ainda não existir; a senha vem do env da infra de desenvolvimento e nunca é impressa.
export async function ensureKeycloakUser(
  identity: IdentityEnvironment,
  credentials: Live72Credentials,
): Promise<'created' | 'existing'> {
  if ((await findUserId(identity, credentials.username)) !== undefined) return 'existing';
  const adminToken = await fetchMasterAdminToken(identity);
  const created = await sendRequest({
    url: `${buildAdminUrl(identity)}/users`,
    token: adminToken,
    json: {
      username: credentials.username,
      email: credentials.email,
      firstName: 'Live72',
      lastName: 'Responsavel',
      enabled: true,
      emailVerified: true,
      requiredActions: [],
      credentials: [{ type: 'password', value: credentials.password, temporary: false }],
    },
  });
  if (created.status !== HTTP_CREATED_USER) {
    throw new Error(`criar o usuário de teste no Keycloak: HTTP ${created.status}`);
  }
  return 'created';
}

async function loginForAccessToken(params: {
  readonly identity: IdentityEnvironment;
  readonly apiBaseUrl: string;
  readonly credentials: Live72Credentials;
}): Promise<string> {
  const { identity, apiBaseUrl, credentials } = params;
  const pkce = createPkcePair();
  const first = await startLogin({ environment: identity, pkce, clientId: SESSION_CLIENT_ID });
  if (first.kind !== 'page') throw new Error('o login não abriu o formulário');
  const outcome = await submitLoginForm(first, {
    username: credentials.username,
    password: credentials.password,
    credentialId: '',
  });
  if (outcome.kind !== 'redirect') throw new Error('o login não terminou em redirect');
  const answer = await requestApi({
    baseUrl: apiBaseUrl,
    path: SESSION_PATH,
    method: 'POST',
    origin: identity.panelOrigin,
    body: {
      code: readAuthorizationCode(outcome.location),
      codeVerifier: pkce.verifier,
      redirectUri: `${identity.panelOrigin}/auth/callback`,
    },
  });
  const accessToken = readData(answer)['accessToken'];
  if (typeof accessToken !== 'string')
    throw new Error(`POST ${SESSION_PATH}: HTTP ${answer.status}`);
  return accessToken;
}

export async function openSession(params: {
  readonly identity: IdentityEnvironment;
  readonly apiBaseUrl: string;
  readonly credentials: Live72Credentials;
}): Promise<Session> {
  const accessToken = await loginForAccessToken(params);
  const me = await requestApi({ baseUrl: params.apiBaseUrl, path: ME_PATH, token: accessToken });
  const data = readData(me);
  const userId = data['id'];
  if (me.status !== 200 || typeof userId !== 'string')
    throw new Error(`GET ${ME_PATH}: HTTP ${me.status}`);
  return { accessToken, userId, isTelegramLinked: data['telegramLinked'] === true };
}

// Vincula um chat FALSO pelo webhook da própria API: sem vínculo o passo ao vivo não enfileira alerta.
export async function linkFakeTelegram(params: {
  readonly apiBaseUrl: string;
  readonly accessToken: string;
  readonly webhookSecret: string;
}): Promise<void> {
  const { apiBaseUrl, accessToken, webhookSecret } = params;
  const issued = await requestApi({
    baseUrl: apiBaseUrl,
    path: TELEGRAM_LINK_PATH,
    method: 'POST',
    token: accessToken,
  });
  const code = readData(issued)['code'];
  if (issued.status !== HTTP_CREATED || typeof code !== 'string') {
    throw new Error(`código de vínculo: HTTP ${issued.status}`);
  }
  const accepted = await requestApi({
    baseUrl: apiBaseUrl,
    path: TELEGRAM_WEBHOOK_PATH,
    method: 'POST',
    headers: { [WEBHOOK_SECRET_HEADER]: webhookSecret },
    body: {
      update_id: 1,
      message: { chat: { id: FAKE_CHAT_ID, type: 'private' }, text: `/start ${code}` },
    },
  });
  if (accepted.status !== 200) throw new Error(`webhook de vínculo: HTTP ${accepted.status}`);
}
