// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createPriceAlertRepository } from '../../packages/database/src/index.js';
import {
  assertCondition,
  createAlert,
  reportLine,
  type PriceAlertsTestContext,
  type PriceUser,
} from './price-alerts-test-context.js';

async function markFired(context: PriceAlertsTestContext, alertId: string): Promise<void> {
  await context.client`UPDATE price_alerts SET is_enabled = false, triggered_at = now() WHERE id = ${alertId}`;
}

async function exists(context: PriceAlertsTestContext, alertId: string): Promise<boolean> {
  const rows: unknown =
    await context.client`SELECT 1 AS found FROM price_alerts WHERE id = ${alertId}`;
  return (rows as readonly unknown[]).length > 0;
}

// Limpar os disparados apaga só os do dono: o armado, o desligado à mão e os de outro usuário ficam.
export async function checkClearFired(
  context: PriceAlertsTestContext,
  users: { readonly a: PriceUser; readonly b: PriceUser },
): Promise<void> {
  const repository = createPriceAlertRepository(context.handle);
  const firedOfA = [
    await createAlert(context, { user: users.a, direction: 'above', value: '91001' }),
    await createAlert(context, { user: users.a, direction: 'below', value: '91002' }),
  ];
  const armedOfA = await createAlert(context, {
    user: users.a,
    direction: 'above',
    value: '91003',
  });
  const disabledOfA = await createAlert(context, {
    user: users.a,
    direction: 'above',
    value: '91004',
  });
  const firedOfB = await createAlert(context, {
    user: users.b,
    direction: 'above',
    value: '91005',
  });
  for (const id of [...firedOfA, firedOfB]) await markFired(context, id);
  await repository.updatePriceAlert(users.a.scope, {
    alertId: disabledOfA,
    patch: { isEnabled: false },
    maxEnabled: 50,
  });
  const alreadyFiredOfA = await countFired(context, users.a);
  const deleted = await repository.deleteFiredPriceAlerts(users.a.scope);
  assertCondition(
    deleted === alreadyFiredOfA,
    `apagou ${deleted}, havia ${alreadyFiredOfA} disparados`,
  );
  for (const id of firedOfA)
    assertCondition(!(await exists(context, id)), 'disparado do dono apagado');
  assertCondition(await exists(context, armedOfA), 'o armado fica');
  assertCondition(await exists(context, disabledOfA), 'o desligado à mão fica');
  assertCondition(await exists(context, firedOfB), 'o disparado de outro usuário fica');
  assertCondition(
    (await repository.deleteFiredPriceAlerts(users.a.scope)) === 0,
    'repetir não apaga nada',
  );
  reportLine(
    `limpeza dos disparados: ${deleted} do dono apagados; armado, desligado e alheio ficam`,
  );
}

async function countFired(context: PriceAlertsTestContext, user: PriceUser): Promise<number> {
  const rows: unknown =
    await context.client`SELECT count(*)::int AS total FROM price_alerts WHERE user_id = ${user.id} AND triggered_at IS NOT NULL`;
  return (rows as readonly { total: number }[])[0]?.total ?? 0;
}
