// Copyright (c) 2026 Ada Technology. All rights reserved.
import { STALE_MILLISECONDS } from './price-alerts-test.constant.js';
import {
  assertCondition,
  countOutbox,
  createAlert,
  pushTick,
  readAlertState,
  reportLine,
  type PriceAlertsTestContext,
  type PriceUser,
} from './price-alerts-test-context.js';

// Ticker fora do ar: sem tick nada dispara, o selo de dado velho não avalia, e tick atrasado não vale.
export async function checkOutage(context: PriceAlertsTestContext, user: PriceUser): Promise<void> {
  const [first] = context.instances;
  const alertId = await createAlert(context, { user, direction: 'above', value: '90000' });
  await pushTick(context, { instance: first, price: '89000' });
  const lastTickAt = context.clock.now;
  context.clock.now += 5 * STALE_MILLISECONDS;
  first.publisher.sweepStale();
  await Promise.all(context.pending.splice(0));
  assertCondition(
    (await readAlertState(context, alertId)).is_enabled,
    'ticker fora do ar e o par selado como velho: nada dispara',
  );
  first.publisher.handleRawTick({
    symbol: 'BTCUSDT',
    price: '95000',
    openPrice: '95000',
    eventTime: lastTickAt + 1,
  });
  first.advance(1_000);
  await Promise.all(context.pending.splice(0));
  const stale = await readAlertState(context, alertId);
  assertCondition(
    stale.is_enabled && stale.triggered_at === null && (await countOutbox(context, alertId)) === 0,
    'tick atrasado (dado velho) que cruzaria o valor não dispara',
  );
  await pushTick(context, { instance: first, price: '95000' });
  assertCondition(
    !(await readAlertState(context, alertId)).is_enabled,
    'o primeiro tick fresco depois da queda dispara normalmente',
  );
  reportLine('ticker indisponível ou dado velho não disparam nada; o tick fresco seguinte dispara');
}
