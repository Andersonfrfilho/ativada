// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createAlertRepository,
  createTelegramLinkRepository,
} from '../../packages/database/src/index.js';
import { REAL_DATASETS } from '../../test/fixtures/strategy-engine/signal/classic-signals.fixture.js';
import {
  createLiveRun,
  createProductionEvaluator,
  errorsOf,
  LEAD_IN_CANDLES,
  tickUntilQuiet,
  type LiveUser,
} from '../live-test/live-test-context.js';
import {
  CHAT_OF_D,
  CHAT_OF_E,
  EVALUATOR_PASS_STEPS,
  FRESH_FOREVER_CANDLES,
  LEASE_MILLISECONDS,
} from './telegram-test.constant.js';
import {
  assertCondition,
  countSignalsToAlert,
  dispatchUntilQuiet,
  messagesTo,
  readAlerts,
  reportTelegramLine,
  type TelegramTestContext,
} from './telegram-test-context.js';

const CRASH_AT_COMMIT = 150;
const TRANSIENT_CONNECTION_LOSS = '08006';

type RestartUsers = { readonly d: LiveUser; readonly e: LiveUser };

function connectionLoss(): Error {
  return Object.assign(new Error('conexão perdida'), { code: TRANSIENT_CONNECTION_LOSS });
}

async function evaluateAcrossACrash(context: TelegramTestContext): Promise<void> {
  const dataset = REAL_DATASETS[1];
  const lastClose = dataset?.candles.at(-1)?.closeTime ?? 0;
  let commits = 0;
  let hasCrashed = false;
  const { evaluator, entries } = createProductionEvaluator(context.live, {
    instanceId: 'telegram-test-restart',
    maxStepsPerPass: EVALUATOR_PASS_STEPS,
    alerting: { now: () => lastClose, maxAgeCandles: FRESH_FOREVER_CANDLES },
    beforeCommit: () => {
      commits += 1;
      if (commits !== CRASH_AT_COMMIT || hasCrashed) return Promise.resolve();
      hasCrashed = true;
      return Promise.reject(connectionLoss());
    },
  });
  await tickUntilQuiet(evaluator);
  assertCondition(hasCrashed, 'a queda do banco não aconteceu');
  assertCondition(errorsOf(entries).length === 0, 'a queda transitória virou erro');
}

async function claimEverything(context: TelegramTestContext): Promise<readonly string[]> {
  const repository = createAlertRepository(context.live.handle);
  const claimed: string[] = [];
  for (;;) {
    const batch = await repository.claimDue({
      now: new Date(context.clock.now),
      limit: 100,
      leaseMilliseconds: LEASE_MILLISECONDS,
    });
    if (batch.length === 0) return claimed;
    claimed.push(...batch.map((alert) => alert.id));
  }
}

export async function checkRestartAndUnlink(
  context: TelegramTestContext,
  users: RestartUsers,
): Promise<void> {
  const dataset = REAL_DATASETS[1];
  const first = dataset?.candles[LEAD_IN_CANDLES];
  if (dataset === undefined || first === undefined) throw new Error('conjunto real ausente');
  const params = {
    symbol: dataset.market.symbol,
    timeframe: '1d',
    periodStart: first.openTime,
  } as const;
  const runD = await createLiveRun(context.live, { ...params, user: users.d });
  const runE = await createLiveRun(context.live, { ...params, user: users.e });
  await evaluateAcrossACrash(context);
  const alertsOfD = await readAlerts(context, { runId: runD.id });
  const expected = await countSignalsToAlert(context, runD.id);
  assertCondition(alertsOfD.length > 0, 'D não tem alerta');
  assertCondition(
    alertsOfD.length === expected,
    `queda no meio: ${alertsOfD.length} alertas para ${expected} sinais BUY/SELL`,
  );
  const alertsOfE = await readAlerts(context, { runId: runE.id });
  assertCondition(alertsOfE.length === alertsOfD.length, 'E deveria ter os mesmos alertas de D');
  await createTelegramLinkRepository(context.live.handle).unlink(users.e.scope);
  // O despachante que morre depois de reivindicar e antes de enviar: o arrendamento segura os alertas dele.
  const dying = await claimEverything(context);
  assertCondition(dying.length >= alertsOfD.length, 'o despachante que morre não reivindicou');
  assertCondition((await context.dispatcher.tick()).claimed === 0, 'enviou o que estava arrendado');
  assertCondition(messagesTo(context, CHAT_OF_D).length === 0, 'mensagem antes da hora');
  context.clock.now += LEASE_MILLISECONDS + 1;
  const sent = await dispatchUntilQuiet(context);
  assertCondition(sent === alertsOfD.length, `reinício: ${sent} enviadas para ${alertsOfD.length}`);
  assertCondition(
    messagesTo(context, CHAT_OF_D).length === alertsOfD.length,
    'D não recebeu cada alerta uma vez',
  );
  assertCondition(messagesTo(context, CHAT_OF_E).length === 0, 'E desvinculado recebeu alerta');
  const skipped = (await readAlerts(context, { runId: runE.id })).map((row) => row.status);
  assertCondition(
    skipped.every((status) => status === 'skipped'),
    'alerta de quem desvinculou deveria ser dispensado',
  );
  reportTelegramLine(
    `reinício: queda do banco no passo ${CRASH_AT_COMMIT} do avaliador não duplica nem perde alerta (${alertsOfD.length} = ${expected} sinais); despachante que morre depois de reivindicar: nada sai até o arrendamento vencer e depois sai uma vez só; desvinculado depois de enfileirar: nada é enviado`,
  );
}
