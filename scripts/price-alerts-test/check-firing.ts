// Copyright (c) 2026 Ada Technology. All rights reserved.
import { SYMBOL, OTHER_SYMBOL, CHAT_OF_A, CHAT_OF_B } from './price-alerts-test.constant.js';
import {
  assertCondition,
  countOutbox,
  createAlert,
  dispatchUntilQuiet,
  messagesTo,
  pushTick,
  readAlertState,
  reportLine,
  waitForEvents,
  type PriceAlertsTestContext,
  type PriceUser,
} from './price-alerts-test-context.js';

// Cruzar o valor dispara UMA vez, mesmo com ticks repetidos; só o dono recebe; o que não cruzou segue armado.
export async function checkFiringOnce(
  context: PriceAlertsTestContext,
  users: { readonly a: PriceUser; readonly b: PriceUser },
): Promise<void> {
  const [first] = context.instances;
  const above = await createAlert(context, { user: users.a, direction: 'above', value: '70000' });
  const farAbove = await createAlert(context, {
    user: users.a,
    direction: 'above',
    value: '80000',
  });
  const below = await createAlert(context, { user: users.a, direction: 'below', value: '65000' });
  const ofB = await createAlert(context, { user: users.b, direction: 'above', value: '73000' });
  await pushTick(context, { instance: first, price: '69999.99000000' });
  assertCondition((await readAlertState(context, above)).is_enabled, 'abaixo do valor não dispara');
  for (let repeat = 0; repeat < 5; repeat += 1) {
    await pushTick(context, { instance: first, price: '70001.25000000' });
  }
  const fired = await readAlertState(context, above);
  assertCondition(
    !fired.is_enabled && fired.triggered_at !== null,
    'cruzou: desligado e carimbado',
  );
  assertCondition(
    (await countOutbox(context, above)) === 1,
    'cinco ticks acima = UM aviso na caixa de saída',
  );
  await waitForEvents(context, 1);
  assertCondition(context.events[0]?.alertId === above, 'o NOTIFY aponta o alerta que disparou');
  assertCondition(
    (await readAlertState(context, farAbove)).is_enabled &&
      (await readAlertState(context, below)).is_enabled &&
      (await readAlertState(context, ofB)).is_enabled,
    'os alertas que o preço não cruzou seguem armados (inclusive o de outro usuário)',
  );
  await pushTick(context, { instance: first, price: '65000.00000000' });
  const crossedBelow = await readAlertState(context, below);
  assertCondition(!crossedBelow.is_enabled, 'cair ao valor exato dispara o "abaixo de"');
  await waitForEvents(context, 2);
  const sent = await dispatchUntilQuiet(context);
  assertCondition(sent === 2, `${sent} mensagens enviadas; esperava 2`);
  const toA = messagesTo(context, CHAT_OF_A);
  assertCondition(toA.length === 2, 'as duas mensagens vão ao chat do dono A');
  assertCondition(
    messagesTo(context, CHAT_OF_B).length === 0,
    'o alerta de A nunca é entregue ao chat de B',
  );
  assertCondition(
    toA.some((text) => text.includes('subiu acima de 70000') && text.includes('70001.25000000')),
    `texto do "acima de": ${toA.join(' | ')}`,
  );
  assertCondition(
    toA.some((text) => text.includes('caiu abaixo de 65000')),
    'texto do "abaixo de"',
  );
  reportLine(
    'cruzar o valor dispara UMA vez (5 ticks repetidos), só no chat do dono, e o resto segue armado',
  );
}

// O alerta de B dispara só para B; ticks de outro par e alerta desligado não disparam nada.
export async function checkIsolationAndSymbols(
  context: PriceAlertsTestContext,
  users: { readonly a: PriceUser; readonly b: PriceUser },
): Promise<void> {
  const [first] = context.instances;
  const before = context.events.length;
  await pushTick(context, { instance: first, price: '99999', symbol: OTHER_SYMBOL });
  assertCondition(context.events.length === before, 'tick de outro par não dispara alerta do BTC');
  const ofB =
    (await context.client`SELECT id FROM price_alerts WHERE user_id = ${users.b.id}`) as readonly {
      id: string;
    }[];
  const bAlert = ofB[0]?.id;
  if (bAlert === undefined) throw new Error('alerta de B sumiu');
  await pushTick(context, { instance: first, price: '73500.00000000' });
  await waitForEvents(context, before + 1);
  await dispatchUntilQuiet(context);
  assertCondition(
    messagesTo(context, CHAT_OF_B).length === 1,
    'B recebe o próprio alerta, uma vez',
  );
  assertCondition(
    messagesTo(context, CHAT_OF_A).length === 2,
    'e A não recebe nada a mais com o disparo de B',
  );
  const disabled = await createAlert(context, { user: users.a, direction: 'above', value: '10' });
  await context.client`UPDATE price_alerts SET is_enabled = false WHERE id = ${disabled}`;
  await pushTick(context, { instance: first, price: '73600.00000000' });
  assertCondition(
    (await countOutbox(context, disabled)) === 0 &&
      !(await readAlertState(context, disabled)).is_enabled,
    'alerta desligado não dispara',
  );
  assertCondition(
    (await readAlertState(context, disabled)).triggered_at === null,
    'e continua sem carimbo de disparo',
  );
  reportLine(
    'alerta de outro usuário nunca dispara para este; outro par e alerta desligado não disparam',
  );
}

export { SYMBOL };
