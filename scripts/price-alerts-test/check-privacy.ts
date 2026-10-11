// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createAccountExportRepository } from '../../packages/database/src/index.js';
import { BOT_TOKEN } from '../../test/fixtures/telegram/fake-telegram-bot.fixture.js';
import { CHAT_OF_A, CHAT_OF_B } from './price-alerts-test.constant.js';
import {
  assertCondition,
  reportLine,
  type PriceAlertsTestContext,
  type PriceUser,
} from './price-alerts-test-context.js';

// O dono exporta os alertas e os avisos (sem o arrendamento); o aviso do banco não leva dono nem preço; o log não leva
// token nem chat.
export async function checkPrivacy(
  context: PriceAlertsTestContext,
  user: PriceUser,
): Promise<void> {
  const exported = await createAccountExportRepository(context.handle).exportOwnerData(user.scope);
  const alerts = exported?.tables['price_alerts'] ?? [];
  const outbox = exported?.tables['alerts'] ?? [];
  assertCondition(alerts.length >= 1, 'a exportação traz os alertas de preço do dono');
  assertCondition(
    outbox.some((row) => row['side'] === 'PRICE' && typeof row['priceAlertId'] === 'string'),
    'e os avisos do lado PRICE, com o alerta de origem',
  );
  assertCondition(
    outbox.every((row) => !('lockedUntil' in row) && !('userId' in row)),
    'sem o arrendamento nem o dono',
  );
  assertCondition(context.notificationState.malformed === 0, 'nenhum aviso malformado no canal');
  const log = context.logLines.join('');
  for (const secret of [BOT_TOKEN, CHAT_OF_A, CHAT_OF_B]) {
    assertCondition(!log.includes(secret), 'o log do despachante não leva token nem chat');
  }
  reportLine(
    'exportação inclui alertas e avisos; o canal não tem aviso malformado; log sem token nem chat',
  );
}
