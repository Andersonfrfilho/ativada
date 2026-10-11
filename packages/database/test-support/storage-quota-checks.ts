// Copyright (c) 2026 Ada Technology. All rights reserved.
import { StorageQuotaReachedError } from '../src/quota/storage-quota.error.js';
import { PRICE_ALERT_UPDATE_OUTCOME } from '../src/price-alerts/price-alert.constant.js';
import { createPriceAlertRepository } from '../src/price-alerts/price-alert.repository.js';
import { createStrategyRepository } from '../src/strategies/strategy.repository.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import { hashOf, resolvePersistenceOwner } from './persistence-seed.js';

const STRATEGY_CEILING = 3;
const VERSION_CEILING = 3;
const RACERS = 12;
const DISABLED_CEILING = 2;

async function outcomeOf(work: Promise<unknown>): Promise<'ok' | 'quota' | 'other'> {
  try {
    await work;
    return 'ok';
  } catch (error: unknown) {
    return error instanceof StorageQuotaReachedError ? 'quota' : 'other';
  }
}

async function checkStrategyCeiling(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-quota-strategies');
  const stranger = await resolvePersistenceOwner(handle, 'subject-quota-strategies-other');
  const strategies = createStrategyRepository(handle);
  const create = (scope: typeof owner.scope, nonce: string): Promise<unknown> =>
    strategies.createStrategyWithFirstVersion(scope, {
      name: nonce,
      isExample: false,
      config: { schemaVersion: 1, nonce },
      configHash: hashOf(nonce),
      maxStrategies: STRATEGY_CEILING,
    });
  const raced = await Promise.all(
    Array.from({ length: RACERS }, (_unused, index) => outcomeOf(create(owner.scope, `q${index}`))),
  );
  assertCondition(
    raced.filter((outcome) => outcome === 'ok').length === STRATEGY_CEILING &&
      raced.filter((outcome) => outcome === 'quota').length === RACERS - STRATEGY_CEILING &&
      !raced.includes('other'),
    `${RACERS} POST simultâneos respeitam o teto de ${STRATEGY_CEILING}: ${raced.join()}`,
  );
  assertCondition((await outcomeOf(create(stranger.scope, 'outro'))) === 'ok', 'o teto é por dono');
  const page = await strategies.listStrategiesPage(owner.scope, { limit: 10, after: undefined });
  const first = page.strategies[0];
  assertCondition(
    first !== undefined && (await strategies.softDeleteStrategy(owner.scope, first.id)),
    'apaga uma',
  );
  assertCondition((await outcomeOf(create(owner.scope, 'cabe'))) === 'ok', 'apagar libera a vaga');
  reportCheck(
    `quota: ${RACERS} criações simultâneas de estratégia respeitam o teto de ${STRATEGY_CEILING}; apagar libera`,
  );
}

async function checkVersionCeiling(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-quota-versions');
  const strategies = createStrategyRepository(handle);
  const created = await strategies.createStrategyWithFirstVersion(owner.scope, {
    name: 'versões',
    isExample: false,
    config: { schemaVersion: 1, nonce: 'v0' },
    configHash: hashOf('v0'),
  });
  const add = (nonce: string): Promise<unknown> =>
    strategies.addVersion(owner.scope, {
      strategyId: created.strategy.id,
      config: { schemaVersion: 1, nonce },
      configHash: hashOf(nonce),
      maxVersions: VERSION_CEILING,
    });
  const raced = await Promise.all(
    Array.from({ length: RACERS }, (_unused, index) => outcomeOf(add(`v${index + 1}`))),
  );
  assertCondition(
    raced.filter((outcome) => outcome === 'ok').length === VERSION_CEILING - 1 &&
      !raced.includes('other'),
    `versões simultâneas respeitam o teto de ${VERSION_CEILING}: ${raced.join()}`,
  );
  const existing = await strategies.addVersion(owner.scope, {
    strategyId: created.strategy.id,
    config: { schemaVersion: 1, nonce: 'v0' },
    configHash: hashOf('v0'),
    maxVersions: VERSION_CEILING,
  });
  assertCondition(existing?.isNew === false, 'no teto, a configuração que já existe é devolvida');
  assertCondition((await outcomeOf(add('nova'))) === 'quota', 'e a nova é recusada');
  reportCheck(`quota: versões simultâneas respeitam o teto de ${VERSION_CEILING} por estratégia`);
}

async function checkDisabledPriceAlertCeiling(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-quota-disabled-alerts');
  const alerts = createPriceAlertRepository(handle);
  const ids: string[] = [];
  for (let index = 0; index < DISABLED_CEILING + 2; index += 1) {
    const result = await alerts.createPriceAlert(owner.scope, {
      symbol: 'BTCUSDT',
      direction: 'above',
      value: String(70_000 + index),
      origin: 'manual',
      maxEnabled: 50,
    });
    if ('alert' in result) ids.push(result.alert.id);
  }
  const disable = async (alertId: string): Promise<string> =>
    (
      await alerts.updatePriceAlert(owner.scope, {
        alertId,
        patch: { isEnabled: false },
        maxEnabled: 50,
        maxDisabled: DISABLED_CEILING,
      })
    ).outcome;
  const [first = '', second = '', third = '', fourth = ''] = ids;
  assertCondition((await disable(first)) === PRICE_ALERT_UPDATE_OUTCOME.UPDATED, 'primeiro');
  assertCondition((await disable(second)) === PRICE_ALERT_UPDATE_OUTCOME.UPDATED, 'segundo');
  assertCondition(
    (await disable(third)) === PRICE_ALERT_UPDATE_OUTCOME.DISABLED_LIMIT_REACHED,
    'o terceiro estoura o teto de desligados',
  );
  assertCondition(
    (await disable(first)) === PRICE_ALERT_UPDATE_OUTCOME.UPDATED,
    'desligar de novo o mesmo não conta',
  );
  await client`UPDATE price_alerts SET triggered_at = now() WHERE id = ${first}`;
  assertCondition(
    (await disable(third)) === PRICE_ALERT_UPDATE_OUTCOME.UPDATED,
    'o disparado não entra na conta',
  );
  assertCondition(
    (await disable(fourth)) === PRICE_ALERT_UPDATE_OUTCOME.DISABLED_LIMIT_REACHED,
    'e o teto volta a valer',
  );
  reportCheck(`quota: alertas de preço desligados à mão respeitam o teto de ${DISABLED_CEILING}`);
}

export async function checkStorageQuotas(context: LifecycleCheckContext): Promise<void> {
  await checkStrategyCeiling(context);
  await checkVersionCeiling(context);
  await checkDisabledPriceAlertCeiling(context);
}
