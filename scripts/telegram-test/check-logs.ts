// Copyright (c) 2026 Ada Technology. All rights reserved.
import { BOT_TOKEN } from '../../test/fixtures/telegram/fake-telegram-bot.fixture.js';
import {
  CHAT_OF_A,
  CHAT_OF_B,
  CHAT_OF_D,
  CHAT_OF_E,
  CHAT_OF_F,
  CHAT_OF_G,
  CHAT_STRANGER,
} from './telegram-test.constant.js';
import {
  assertCondition,
  reportTelegramLine,
  type TelegramTestContext,
} from './telegram-test-context.js';

const MINIMUM_LOG_LINES = 20;

async function readReasons(context: TelegramTestContext): Promise<readonly string[]> {
  const rows: unknown = await context.live.client`SELECT DISTINCT reason FROM signals
    WHERE action IN ('BUY', 'SELL')`;
  return (rows as readonly { reason: string }[]).map((row) => row.reason);
}

// A saída de log do despachante, do início ao fim do teste (envios, repetições, desistências, rede fora do ar): nada de token,
// de chat, de preço nem do texto do motivo — só ids opacos, contagens e códigos.
export async function checkLogs(context: TelegramTestContext): Promise<void> {
  const text = context.logLines.join('');
  assertCondition(
    context.logLines.length >= MINIMUM_LOG_LINES,
    `poucas linhas de log (${context.logLines.length}): o teste não exercitou o despacho`,
  );
  const secrets = [BOT_TOKEN, BOT_TOKEN.split(':')[0] ?? BOT_TOKEN];
  const chats = [CHAT_OF_A, CHAT_OF_B, CHAT_OF_D, CHAT_OF_E, CHAT_OF_F, CHAT_OF_G, CHAT_STRANGER];
  for (const secret of [...secrets, ...chats]) {
    assertCondition(!text.includes(secret), 'o log carregou token ou chat');
  }
  for (const reason of await readReasons(context)) {
    assertCondition(!text.includes(reason), 'o log carregou o texto de um alerta');
  }
  for (const content of ['BTCUSDT', 'ETHUSDT', 'Motivo']) {
    assertCondition(!text.includes(content), `o log carregou conteúdo de alerta (${content})`);
  }
  reportTelegramLine(
    `log: ${context.logLines.length} linhas do despachante varridas; nem token, nem chat, nem texto de alerta, nem par ou preço`,
  );
}
