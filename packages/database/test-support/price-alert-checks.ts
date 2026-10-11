// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  PRICE_ALERT_CREATE_OUTCOME,
  PRICE_ALERT_UPDATE_OUTCOME,
} from '../src/price-alerts/price-alert.constant.js';
import { createPriceAlertEvaluationRepository } from '../src/price-alerts/price-alert-evaluation.repository.js';
import { createPriceAlertRepository } from '../src/price-alerts/price-alert.repository.js';
import type {
  CreatePriceAlertParams,
  PriceAlertRecord,
} from '../src/price-alerts/price-alert.types.js';
import type { OwnerScope } from '../src/ownership/owner-scope.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import { captureErrorCode, resolvePersistenceOwner } from './persistence-seed.js';

const CHECK_VIOLATION_SQLSTATE = '23514';
const UNIQUE_VIOLATION_SQLSTATE = '23505';
const RACED_ALERTS = 12;
const ALERT_CEILING = 5;
const BASE: CreatePriceAlertParams = {
  symbol: 'BTCUSDT',
  direction: 'above',
  value: '70000.12345678',
  origin: 'manual',
  maxEnabled: 50,
};

async function created(
  repository: ReturnType<typeof createPriceAlertRepository>,
  scope: OwnerScope,
  overrides: Partial<CreatePriceAlertParams> = {},
): Promise<PriceAlertRecord> {
  const result = await repository.createPriceAlert(scope, { ...BASE, ...overrides });
  if (result.outcome !== PRICE_ALERT_CREATE_OUTCOME.CREATED) throw new Error('alerta não criado');
  return result.alert;
}

async function checkRoundTrip(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-price-alert-round-trip');
  const alerts = createPriceAlertRepository(handle);
  const alert = await created(alerts, owner.scope);
  assertCondition(alert.isEnabled && alert.triggeredAt === undefined, 'alerta nasce armado');
  assertCondition(alert.value === '70000.12345678', `valor volta exato: ${alert.value}`);
  const patched = await alerts.updatePriceAlert(owner.scope, {
    alertId: alert.id,
    patch: { value: '65000', direction: 'below' },
    maxEnabled: 50,
  });
  assertCondition(
    patched.outcome === PRICE_ALERT_UPDATE_OUTCOME.UPDATED &&
      patched.alert.value === '65000' &&
      patched.alert.direction === 'below' &&
      patched.alert.symbol === 'BTCUSDT',
    'PATCH grava só o que veio',
  );
  assertCondition(await alerts.deletePriceAlert(owner.scope, alert.id), 'apaga o próprio alerta');
  assertCondition(!(await alerts.deletePriceAlert(owner.scope, alert.id)), 'apagar de novo = não');
  reportCheck('alertas de preço: criar, alterar parcialmente e apagar; valor em texto exato');
}

async function checkIsolation(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-price-alert-owner');
  const stranger = await resolvePersistenceOwner(handle, 'subject-price-alert-stranger');
  const alerts = createPriceAlertRepository(handle);
  const alert = await created(alerts, owner.scope);
  assertCondition(
    (await alerts.findPriceAlert(stranger.scope, alert.id)) === undefined,
    'outro usuário não lê o alerta',
  );
  const foreignUpdate = await alerts.updatePriceAlert(stranger.scope, {
    alertId: alert.id,
    patch: { isEnabled: false },
    maxEnabled: 50,
  });
  assertCondition(
    foreignUpdate.outcome === PRICE_ALERT_UPDATE_OUTCOME.NOT_FOUND,
    'outro usuário não altera o alerta',
  );
  assertCondition(!(await alerts.deletePriceAlert(stranger.scope, alert.id)), 'nem apaga');
  const page = await alerts.listPriceAlertsPage(stranger.scope, { limit: 100, after: undefined });
  assertCondition(
    page.alerts.every((row) => row.id !== alert.id),
    'nem lista',
  );
  reportCheck('alertas de preço: o alerta de A é invisível e intocável para B');
}

async function checkRearm(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-price-alert-rearm');
  const alerts = createPriceAlertRepository(handle);
  const alert = await created(alerts, owner.scope);
  await client`UPDATE price_alerts SET is_enabled = false, triggered_at = now() WHERE id = ${alert.id}`;
  const rearmed = await alerts.updatePriceAlert(owner.scope, {
    alertId: alert.id,
    patch: { isEnabled: true },
    maxEnabled: 50,
  });
  assertCondition(
    rearmed.outcome === PRICE_ALERT_UPDATE_OUTCOME.UPDATED &&
      rearmed.alert.isEnabled &&
      rearmed.alert.triggeredAt === undefined,
    'religar rearma: liga e limpa o disparo',
  );
  reportCheck('alertas de preço: religar limpa triggered_at');
}

async function checkCeilingUnderRace(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-price-alert-ceiling');
  const alerts = createPriceAlertRepository(handle);
  const outcomes = await Promise.all(
    Array.from({ length: RACED_ALERTS }, () =>
      alerts.createPriceAlert(owner.scope, { ...BASE, maxEnabled: ALERT_CEILING }),
    ),
  );
  const total = outcomes.filter(
    (outcome) => outcome.outcome === PRICE_ALERT_CREATE_OUTCOME.CREATED,
  ).length;
  assertCondition(total === ALERT_CEILING, `${total} alertas criados sob corrida`);
  const first = await alerts.listPriceAlertsPage(owner.scope, { limit: 100, after: undefined });
  const target = first.alerts[0];
  if (target === undefined) throw new Error('sem alerta');
  await alerts.updatePriceAlert(owner.scope, {
    alertId: target.id,
    patch: { isEnabled: false },
    maxEnabled: ALERT_CEILING,
  });
  const replacement = await alerts.createPriceAlert(owner.scope, {
    ...BASE,
    maxEnabled: ALERT_CEILING,
  });
  assertCondition(
    replacement.outcome === PRICE_ALERT_CREATE_OUTCOME.CREATED,
    'o teto conta só os alertas LIGADOS: desligar um libera a vaga',
  );
  const blocked = await alerts.updatePriceAlert(owner.scope, {
    alertId: target.id,
    patch: { isEnabled: true },
    maxEnabled: ALERT_CEILING,
  });
  assertCondition(
    blocked.outcome === PRICE_ALERT_UPDATE_OUTCOME.LIMIT_REACHED,
    'religar também respeita o teto de alertas ligados',
  );
  reportCheck(
    `alertas de preço: ${RACED_ALERTS} POST simultâneos respeitam o teto de ${ALERT_CEILING}`,
  );
}

async function checkDatabaseRules(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-price-alert-rules');
  const insert = (fields: {
    symbol: string;
    direction: string;
    value: string;
    origin: string;
    enabled?: boolean;
    triggered?: boolean;
  }): PromiseLike<unknown> =>
    client`INSERT INTO price_alerts (id, user_id, symbol, direction, value, origin, is_enabled, triggered_at)
      VALUES (${crypto.randomUUID()}, ${owner.userId}, ${fields.symbol}, ${fields.direction}, ${fields.value}, ${fields.origin},
        ${fields.enabled ?? true}, ${fields.triggered === true ? new Date() : null})`;
  const valid = { symbol: 'BTCUSDT', direction: 'above', value: '1', origin: 'manual' };
  const invalid: readonly (readonly [string, Parameters<typeof insert>[0]])[] = [
    ['par em minúsculas', { ...valid, symbol: 'btcusdt' }],
    ['direção fora do vocabulário', { ...valid, direction: 'sideways' }],
    ['origem fora do vocabulário', { ...valid, origin: 'robot' }],
    ['valor zero', { ...valid, value: '0' }],
    ['valor negativo', { ...valid, value: '-5' }],
    ['disparado e ainda ligado', { ...valid, triggered: true, enabled: true }],
  ];
  for (const [label, fields] of invalid) {
    const code = await captureErrorCode(insert(fields));
    assertCondition(code === CHECK_VIOLATION_SQLSTATE, `${label}: o banco devia recusar (${code})`);
  }
  assertCondition((await captureErrorCode(insert(valid))) === undefined, 'o alerta válido entra');
  reportCheck(
    'alertas de preço: o banco recusa par, direção, origem, valor e disparo ligado (CHECK)',
  );
}

const FIRING_CHAT = '760000001';

type FiringSetup = {
  readonly alerts: ReturnType<typeof createPriceAlertRepository>;
  readonly evaluation: ReturnType<typeof createPriceAlertEvaluationRepository>;
  readonly withTelegram: Awaited<ReturnType<typeof resolvePersistenceOwner>>;
  readonly withoutTelegram: Awaited<ReturnType<typeof resolvePersistenceOwner>>;
};

async function outboxRows(
  context: LifecycleCheckContext,
  alertId: string,
): Promise<readonly { side: string; candle_time: string; payload: Record<string, string> }[]> {
  const rows: unknown =
    await context.client`SELECT side, candle_time::text, payload FROM alerts WHERE price_alert_id = ${alertId} ORDER BY candle_time`;
  return rows as readonly { side: string; candle_time: string; payload: Record<string, string> }[];
}

async function openFiringSetup(context: LifecycleCheckContext): Promise<FiringSetup> {
  const { handle, client } = context;
  const withTelegram = await resolvePersistenceOwner(handle, 'subject-price-alert-fire-a');
  const withoutTelegram = await resolvePersistenceOwner(handle, 'subject-price-alert-fire-b');
  await client`UPDATE users SET telegram_chat_id = ${FIRING_CHAT}, alert_telegram_enabled = true WHERE id = ${withTelegram.userId}`;
  return {
    alerts: createPriceAlertRepository(handle),
    evaluation: createPriceAlertEvaluationRepository(handle),
    withTelegram,
    withoutTelegram,
  };
}

// A regra de disparo no banco: cruzamento inclusivo nos dois sentidos, uma vez só, só o par do tick, só alerta ligado,
// aviso na caixa de saída só para o dono com Telegram, e dois processos no mesmo tick nunca avisam em dobro.
async function checkFiring(context: LifecycleCheckContext): Promise<void> {
  const { assertCondition, reportCheck } = context;
  const { alerts, evaluation, withTelegram, withoutTelegram } = await openFiringSetup(context);
  const above = await created(alerts, withTelegram.scope, { symbol: 'LTCUSDT', value: '99.5' });
  const below = await created(alerts, withTelegram.scope, {
    symbol: 'LTCUSDT',
    direction: 'below',
    value: '50',
  });
  const otherPair = await created(alerts, withTelegram.scope, { symbol: 'XRPUSDT', value: '1' });
  const noTelegram = await created(alerts, withoutTelegram.scope, {
    symbol: 'LTCUSDT',
    value: '100',
  });
  const fire = (price: string, eventTime: number): Promise<readonly string[]> =>
    evaluation.fireDueAlerts({ symbol: 'LTCUSDT', price, eventTime }).then((r) => r.firedAlertIds);
  assertCondition((await fire('89.99999999', 1)).length === 0, 'entre os valores nada dispara');
  const crossed = await fire('100', 2);
  assertCondition(
    crossed.length === 2 && crossed.includes(above.id) && crossed.includes(noTelegram.id),
    `ao cruzar o valor dispara o "acima de" e o de outro dono: ${crossed.join()}`,
  );
  assertCondition((await fire('100', 3)).length === 0, 'o mesmo cruzamento não dispara de novo');
  assertCondition(
    (await fire('50.00000001', 4)).length === 0,
    'um pouco acima de 50 ainda não cruza o "abaixo de"',
  );
  assertCondition((await fire('50', 5))[0] === below.id, 'no valor exato dispara o "abaixo de"');
  const otherUntouched = await alerts.findPriceAlert(withTelegram.scope, otherPair.id);
  assertCondition(otherUntouched?.isEnabled === true, 'tick de um par não dispara alerta de outro');
  const row = (await outboxRows(context, above.id))[0];
  assertCondition(
    row?.side === 'PRICE' &&
      row.candle_time === '2' &&
      row.payload['threshold'] === '99.5' &&
      row.payload['price'] === '100' &&
      row.payload['direction'] === 'above' &&
      row.payload['symbol'] === 'LTCUSDT',
    'o aviso leva par, sentido, valor do usuário e preço que cruzou',
  );
  assertCondition(
    (await outboxRows(context, noTelegram.id)).length === 0,
    'dono sem Telegram: o alerta dispara, mas nenhum aviso entra na caixa de saída',
  );
  const state = await alerts.findPriceAlert(withoutTelegram.scope, noTelegram.id);
  assertCondition(
    state?.isEnabled === false && state.triggeredAt !== undefined,
    'e fica desligado e carimbado',
  );
  reportCheck(
    'alertas de preço: disparo inclusivo nos dois sentidos, uma vez, só no par do tick, aviso só com Telegram',
  );
}

async function checkFiringRaces(context: LifecycleCheckContext): Promise<void> {
  const { assertCondition, reportCheck } = context;
  const { alerts, evaluation, withTelegram } = await openFiringSetup(context);
  const alert = await created(alerts, withTelegram.scope, { symbol: 'ADAUSDT', value: '2' });
  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      evaluation.fireDueAlerts({ symbol: 'ADAUSDT', price: '2.5', eventTime: 7 }),
    ),
  );
  const total = results.reduce((sum, result) => sum + result.firedAlertIds.length, 0);
  assertCondition(total === 1, `${total} disparos de 10 processos no mesmo tick; esperava 1`);
  assertCondition(
    (await outboxRows(context, alert.id)).length === 1,
    'e UM aviso na caixa de saída',
  );
  const rearmed = await alerts.updatePriceAlert(withTelegram.scope, {
    alertId: alert.id,
    patch: { isEnabled: true },
    maxEnabled: 50,
  });
  assertCondition(rearmed.outcome === PRICE_ALERT_UPDATE_OUTCOME.UPDATED, 'religa');
  await evaluation.fireDueAlerts({ symbol: 'ADAUSDT', price: '2.5', eventTime: 8 });
  assertCondition(
    (await outboxRows(context, alert.id)).length === 2,
    'rearmado, o novo cruzamento é outro aviso (outro instante)',
  );
  await alerts.updatePriceAlert(withTelegram.scope, {
    alertId: alert.id,
    patch: { isEnabled: true },
    maxEnabled: 50,
  });
  await context.client`UPDATE price_alerts SET is_enabled = false WHERE id = ${alert.id}`;
  const none = await evaluation.fireDueAlerts({ symbol: 'ADAUSDT', price: '9', eventTime: 9 });
  assertCondition(none.firedAlertIds.length === 0, 'alerta desligado nunca dispara');
  reportCheck(
    'alertas de preço: 10 processos no mesmo tick = 1 disparo e 1 aviso; religar rearma; desligado não dispara',
  );
}

async function checkActiveOwner(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-price-alert-active-owner');
  const alerts = createPriceAlertRepository(handle);
  const evaluation = createPriceAlertEvaluationRepository(handle);
  const alert = await created(alerts, owner.scope);
  assertCondition(
    (await evaluation.findActiveOwnerId(alert.id)) === owner.userId,
    'o dono ativo do alerta',
  );
  assertCondition(
    (await evaluation.findActiveOwnerId(crypto.randomUUID())) === undefined,
    'alerta inexistente não tem dono',
  );
  await client`UPDATE users SET blocked_at = now() WHERE id = ${owner.userId}`;
  assertCondition(
    (await evaluation.findActiveOwnerId(alert.id)) === undefined,
    'conta bloqueada não recebe aviso',
  );
  await client`UPDATE users SET blocked_at = null, deleted_at = now() WHERE id = ${owner.userId}`;
  assertCondition(
    (await evaluation.findActiveOwnerId(alert.id)) === undefined,
    'conta apagada não recebe aviso',
  );
  reportCheck('alertas de preço: o aviso só vai ao dono com conta ativa');
}

// A caixa de saída: o lado PRICE não tem execução e leva o alerta; os outros lados são o contrário; (alerta, instante) é único.
async function checkOutboxRules(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-price-alert-outbox-rules');
  const insert = (fields: {
    side: string;
    runId: string | null;
    priceAlertId: string | null;
    candleTime: number;
  }): PromiseLike<unknown> =>
    client`INSERT INTO alerts (id, user_id, run_id, price_alert_id, candle_time, side, channel, payload)
      VALUES (${crypto.randomUUID()}, ${owner.userId}, ${fields.runId}, ${fields.priceAlertId}, ${fields.candleTime},
        ${fields.side}, 'telegram', '{}'::jsonb)`;
  const someId = crypto.randomUUID();
  const invalid: readonly (readonly [string, Parameters<typeof insert>[0]])[] = [
    ['PRICE com execução', { side: 'PRICE', runId: someId, priceAlertId: someId, candleTime: 1 }],
    [
      'PRICE sem o alerta de origem',
      { side: 'PRICE', runId: null, priceAlertId: null, candleTime: 1 },
    ],
    ['sinal sem execução', { side: 'BUY', runId: null, priceAlertId: null, candleTime: 1 }],
    [
      'sinal com alerta de preço',
      { side: 'BUY', runId: someId, priceAlertId: someId, candleTime: 1 },
    ],
  ];
  for (const [label, fields] of invalid) {
    const code = await captureErrorCode(insert(fields));
    assertCondition(code === CHECK_VIOLATION_SQLSTATE, `${label}: o banco devia recusar (${code})`);
  }
  const price = { side: 'PRICE', runId: null, priceAlertId: someId, candleTime: 5 };
  assertCondition(
    (await captureErrorCode(insert(price))) === undefined,
    'o aviso PRICE válido entra',
  );
  const duplicate = await captureErrorCode(insert(price));
  assertCondition(
    duplicate === UNIQUE_VIOLATION_SQLSTATE,
    `o mesmo alerta no mesmo instante é único (${duplicate})`,
  );
  reportCheck(
    'alertas de preço: a caixa de saída recusa PRICE com execução, sinal sem execução e aviso em dobro',
  );
}

export async function checkPriceAlerts(context: LifecycleCheckContext): Promise<void> {
  await checkRoundTrip(context);
  await checkIsolation(context);
  await checkRearm(context);
  await checkCeilingUnderRace(context);
  await checkDatabaseRules(context);
  await checkFiring(context);
  await checkFiringRaces(context);
  await checkActiveOwner(context);
  await checkOutboxRules(context);
}
