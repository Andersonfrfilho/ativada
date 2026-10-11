// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  PRICE_ALERT_CREATE_OUTCOME,
  PRICE_ALERT_UPDATE_OUTCOME,
} from '../src/price-alerts/price-alert.constant.js';
import { createPriceAlertRepository } from '../src/price-alerts/price-alert.repository.js';
import type {
  CreatePriceAlertParams,
  PriceAlertRecord,
} from '../src/price-alerts/price-alert.types.js';
import type { OwnerScope } from '../src/ownership/owner-scope.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import { captureErrorCode, resolvePersistenceOwner } from './persistence-seed.js';

const CHECK_VIOLATION_SQLSTATE = '23514';
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

export async function checkPriceAlerts(context: LifecycleCheckContext): Promise<void> {
  await checkRoundTrip(context);
  await checkIsolation(context);
  await checkRearm(context);
  await checkCeilingUnderRace(context);
  await checkDatabaseRules(context);
}
