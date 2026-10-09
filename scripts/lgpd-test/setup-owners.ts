// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createActor } from '../admin-test/setup-actors.js';
import {
  ACCOUNTS_PATH,
  ME_PATH,
  TELEGRAM_LINK_PATH,
  TELEGRAM_WEBHOOK_PATH,
  WEBHOOK_SECRET_HEADER,
} from '../admin-test/admin-test.constant.js';
import type { Actor } from '../admin-test/admin-test-context.js';
import { readData, requestApi } from '../admin-test/api-request.js';
import { assertCondition } from '../identity-test/identity-test.error.js';
import { readUserId } from './database-reads.js';
import { CHAT_OF_A, CHAT_OF_B, NAME_OF_A, NAME_OF_B } from './lgpd-test.constant.js';
import { reportLgpdStep, type LgpdContext, type LgpdOwners } from './lgpd-test-context.js';

type OwnerSeed = { readonly actor: Actor; readonly name: string; readonly chat: string };

async function issueLinkCode(context: LgpdContext, actor: Actor): Promise<string> {
  const issued = await requestApi({
    baseUrl: context.api.baseUrl,
    path: TELEGRAM_LINK_PATH,
    method: 'POST',
    token: actor.accessToken,
  });
  assertCondition(issued.status === 201, `código do Telegram: ${issued.status}`);
  return String(readData(issued)['code']);
}

async function linkChat(context: LgpdContext, seed: OwnerSeed): Promise<void> {
  const code = await issueLinkCode(context, seed.actor);
  const webhook = await requestApi({
    baseUrl: context.api.baseUrl,
    path: TELEGRAM_WEBHOOK_PATH,
    method: 'POST',
    headers: { [WEBHOOK_SECRET_HEADER]: context.api.environment.TELEGRAM_WEBHOOK_SECRET ?? '' },
    body: {
      update_id: 1,
      message: { chat: { id: Number(seed.chat), type: 'private' }, text: `/start ${code}` },
    },
  });
  assertCondition(webhook.status === 200, `webhook do Telegram: ${webhook.status}`);
}

async function seedOwner(context: LgpdContext, seed: OwnerSeed): Promise<void> {
  const patch = await requestApi({
    baseUrl: context.api.baseUrl,
    path: ME_PATH,
    method: 'PATCH',
    token: seed.actor.accessToken,
    body: { displayName: seed.name },
  });
  assertCondition(patch.status === 200, `PATCH /v1/me: ${patch.status} ${patch.text}`);
  await linkChat(context, seed);
  await issueLinkCode(context, seed.actor);
}

async function blockAndUnblock(
  context: LgpdContext,
  params: {
    readonly admin: Actor;
    readonly target: Actor;
  },
): Promise<void> {
  const accountId = await readUserId(context, params.target.keycloakId);
  for (const action of ['block', 'unblock']) {
    const answer = await requestApi({
      baseUrl: context.api.baseUrl,
      path: `${ACCOUNTS_PATH}/${accountId}/${action}`,
      method: 'POST',
      token: params.admin.accessToken,
    });
    assertCondition(answer.status === 200, `${action}: ${answer.status} ${answer.text}`);
  }
}

export async function setUpOwners(context: LgpdContext): Promise<LgpdOwners> {
  const admin = await createActor(context, 'admin-with-otp', '2');
  const ownerA = await createActor(context, 'user', undefined);
  const ownerB = await createActor(context, 'user', undefined);
  await seedOwner(context, { actor: ownerA, name: NAME_OF_A, chat: CHAT_OF_A });
  await seedOwner(context, { actor: ownerB, name: NAME_OF_B, chat: CHAT_OF_B });
  await blockAndUnblock(context, { admin, target: ownerA });
  await blockAndUnblock(context, { admin, target: ownerB });
  reportLgpdStep(
    'dados de A e de B',
    'perfil, chat do Telegram, código de vínculo pendente e ações do admin (bloquear/desbloquear) para os dois',
  );
  return { admin, ownerA, ownerB };
}
