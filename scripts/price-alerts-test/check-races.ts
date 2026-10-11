// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createPriceAlertRepository } from '../../packages/database/src/index.js';
import { CHAT_OF_A, MAX_ENABLED } from './price-alerts-test.constant.js';
import {
  assertCondition,
  countOutbox,
  createAlert,
  dispatchUntilQuiet,
  messagesTo,
  pushTick,
  readAlertState,
  reportLine,
  type PriceAlertsTestContext,
  type PriceUser,
} from './price-alerts-test-context.js';

const RACED_ALERTS = 8;

// Duas instâncias da API recebem o MESMO tick ao mesmo tempo: cada alerta dispara uma vez só.
export async function checkTwoInstances(
  context: PriceAlertsTestContext,
  user: PriceUser,
): Promise<void> {
  const [first, second] = context.instances;
  const ids: string[] = [];
  for (let index = 0; index < RACED_ALERTS; index += 1) {
    ids.push(
      await createAlert(context, { user, direction: 'above', value: String(75000 + index) }),
    );
  }
  const eventTime = context.clock.now + 5_000;
  context.clock.now = eventTime;
  for (const instance of [first, second]) {
    instance.publisher.handleRawTick({
      symbol: 'BTCUSDT',
      price: '76000',
      openPrice: '76000',
      eventTime,
    });
  }
  first.advance(1_000);
  second.advance(1_000);
  await Promise.all(context.pending.splice(0));
  for (const id of ids) {
    assertCondition(!(await readAlertState(context, id)).is_enabled, 'cada alerta cruzado dispara');
    assertCondition(
      (await countOutbox(context, id)) === 1,
      'duas instâncias, o mesmo tick: UMA linha na caixa de saída por alerta',
    );
  }
  let total = 0;
  for (const id of ids) total += await countOutbox(context, id);
  assertCondition(
    total === RACED_ALERTS,
    `${RACED_ALERTS} alertas = ${RACED_ALERTS} avisos no total`,
  );
  const before = messagesTo(context, CHAT_OF_A).length;
  const sent = await dispatchUntilQuiet(context);
  assertCondition(sent === RACED_ALERTS, `${sent} mensagens; esperava ${RACED_ALERTS}`);
  assertCondition(
    messagesTo(context, CHAT_OF_A).length === before + RACED_ALERTS,
    'cada alerta, uma mensagem',
  );
  reportLine(
    `duas instâncias com o mesmo tick: ${RACED_ALERTS} alertas, ${RACED_ALERTS} avisos, nenhum em dobro`,
  );
}

// Religar rearma: o alerta volta a disparar na próxima passagem pelo valor, e o aviso novo é outra linha.
export async function checkRearm(context: PriceAlertsTestContext, user: PriceUser): Promise<void> {
  const [first] = context.instances;
  const alertId = await createAlert(context, { user, direction: 'above', value: '77000' });
  await pushTick(context, { instance: first, price: '77001' });
  assertCondition(!(await readAlertState(context, alertId)).is_enabled, 'disparou');
  await pushTick(context, { instance: first, price: '78000' });
  assertCondition((await countOutbox(context, alertId)) === 1, 'desligado não dispara de novo');
  const rearmed = await createPriceAlertRepository(context.handle).updatePriceAlert(user.scope, {
    alertId,
    patch: { isEnabled: true },
    maxEnabled: MAX_ENABLED,
  });
  assertCondition(rearmed.outcome === 'updated', 'religar aceito');
  const state = await readAlertState(context, alertId);
  assertCondition(
    state.is_enabled && state.triggered_at === null,
    'religar rearma (limpa o carimbo)',
  );
  await pushTick(context, { instance: first, price: '78001' });
  assertCondition(
    !(await readAlertState(context, alertId)).is_enabled,
    'rearmado, dispara de novo',
  );
  assertCondition((await countOutbox(context, alertId)) === 2, 'o segundo disparo é outro aviso');
  const sent = await dispatchUntilQuiet(context);
  assertCondition(sent === 2, `${sent} mensagens dos dois disparos; esperava 2`);
  reportLine(
    'religar rearma: o alerta dispara de novo, com aviso novo, e antes disso não dispara em dobro',
  );
}
