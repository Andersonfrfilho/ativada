// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createRunRepository,
  RUN_KIND,
  RUN_STATUS,
  type RunRecord,
} from '../../packages/database/src/index.js';
import { buildRunParams } from '../../packages/database/test-support/persistence-seed.js';
import { REAL_DATASETS } from '../../test/fixtures/strategy-engine/signal/classic-signals.fixture.js';
import type { RealDataset } from '../../test/fixtures/strategy-engine/signal/classic-signals.fixture.js';
import {
  createLiveRun,
  createProductionEvaluator,
  errorsOf,
  LEAD_IN_CANDLES,
  seedCandles,
  tickUntilQuiet,
  type LiveUser,
} from '../live-test/live-test-context.js';
import {
  CHAT_OF_A,
  CHAT_OF_B,
  EVALUATOR_PASS_STEPS,
  FRESH_FOREVER_CANDLES,
  WALK_FORWARD_TRADES,
  WALK_FORWARD_WIN_RATE,
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

export type DeliveryUsers = {
  readonly a: LiveUser;
  readonly b: LiveUser;
  readonly c: LiveUser;
};

export type DeliveryRuns = {
  readonly a: RunRecord;
  readonly b: RunRecord;
  readonly c: RunRecord;
};

function requireDataset(index: number): RealDataset {
  const dataset = REAL_DATASETS[index];
  if (dataset === undefined) throw new Error('conjunto real ausente');
  return dataset;
}

function timeframeOf(dataset: RealDataset): '1h' | '1d' {
  const { timeframe } = dataset.market;
  if (timeframe !== '1h' && timeframe !== '1d') throw new Error('timeframe fora do conjunto');
  return timeframe;
}

// O acerto fora da amostra que o alerta de A vai trazer: um walk-forward CONCLUÍDO da versão de A (B e C não têm nenhum).
async function seedWalkForwardOf(context: TelegramTestContext, user: LiveUser): Promise<void> {
  const runs = createRunRepository(context.live.handle);
  const run = await runs.createRun(
    user.scope,
    buildRunParams(user.versionId, { kind: RUN_KIND.WALK_FORWARD }),
  );
  if (run === undefined) throw new Error('walk-forward de A não foi criado');
  const metrics = {
    winRate: { value: WALK_FORWARD_WIN_RATE, reason: null },
    trades: WALK_FORWARD_TRADES,
  };
  await runs.transitionRun(user.scope, { runId: run.id, to: RUN_STATUS.RUNNING });
  await runs.transitionRun(user.scope, { runId: run.id, to: RUN_STATUS.COMPLETED, metrics });
}

export async function startDeliveryRuns(
  context: TelegramTestContext,
  users: DeliveryUsers,
): Promise<DeliveryRuns> {
  const btc = requireDataset(0);
  const eth = requireDataset(1);
  await seedCandles(context.live, btc.candles);
  await seedCandles(context.live, eth.candles);
  await seedWalkForwardOf(context, users.a);
  const startOf = (dataset: RealDataset): number => dataset.candles[LEAD_IN_CANDLES]?.openTime ?? 0;
  const symbolOf = (dataset: RealDataset): string => dataset.market.symbol;
  return {
    a: await createLiveRun(context.live, {
      symbol: symbolOf(btc),
      timeframe: timeframeOf(btc),
      periodStart: startOf(btc),
      user: users.a,
    }),
    b: await createLiveRun(context.live, {
      symbol: symbolOf(eth),
      timeframe: timeframeOf(eth),
      periodStart: startOf(eth),
      user: users.b,
    }),
    c: await createLiveRun(context.live, {
      symbol: symbolOf(btc),
      timeframe: timeframeOf(btc),
      periodStart: startOf(btc),
      user: users.c,
    }),
  };
}

// O avaliador de PRODUÇÃO com o alerta ligado: "agora" é o fechamento do último candle do conjunto, então tudo é notícia.
export async function evaluateWithAlerts(context: TelegramTestContext): Promise<void> {
  const lastClose = Math.max(...REAL_DATASETS.map((set) => set.candles.at(-1)?.closeTime ?? 0));
  const { evaluator, entries } = createProductionEvaluator(context.live, {
    instanceId: 'telegram-test-evaluator',
    maxStepsPerPass: EVALUATOR_PASS_STEPS,
    alerting: { now: () => lastClose, maxAgeCandles: FRESH_FOREVER_CANDLES },
  });
  await tickUntilQuiet(evaluator);
  assertCondition(errorsOf(entries).length === 0, 'o avaliador registrou erro');
}

export async function checkEnqueued(
  context: TelegramTestContext,
  runs: DeliveryRuns,
): Promise<{ readonly ofA: number; readonly ofB: number }> {
  const ofA = await readAlerts(context, { runId: runs.a.id });
  const ofB = await readAlerts(context, { runId: runs.b.id });
  const ofC = await readAlerts(context, { runId: runs.c.id });
  assertCondition(ofA.length > 0 && ofB.length > 0, 'nenhum alerta foi enfileirado');
  assertCondition(
    ofA.length === (await countSignalsToAlert(context, runs.a.id)),
    `A: ${ofA.length} alertas para ${await countSignalsToAlert(context, runs.a.id)} sinais BUY/SELL`,
  );
  assertCondition(
    ofB.length === (await countSignalsToAlert(context, runs.b.id)),
    'B: alertas diferentes dos sinais BUY/SELL',
  );
  assertCondition(ofC.length === 0, `C não tem vínculo e tem ${ofC.length} alertas`);
  const keys = new Set(ofA.map((row) => `${row.candle_time}|${row.side}`));
  assertCondition(keys.size === ofA.length, 'alerta repetido para o mesmo candle e lado');
  reportTelegramLine(
    `passo ao vivo: ${ofA.length} alertas de A (BTCUSDT 1h) e ${ofB.length} de B (ETHUSDT 1d), um por sinal BUY/SELL; C, sem vínculo, nenhum`,
  );
  return { ofA: ofA.length, ofB: ofB.length };
}

export async function checkDelivered(
  context: TelegramTestContext,
  counts: { readonly ofA: number; readonly ofB: number },
): Promise<void> {
  const sent = await dispatchUntilQuiet(context);
  const toA = messagesTo(context, CHAT_OF_A);
  const toB = messagesTo(context, CHAT_OF_B);
  assertCondition(
    sent === counts.ofA + counts.ofB,
    `enviadas ${sent}, esperadas ${counts.ofA + counts.ofB}`,
  );
  assertCondition(toA.length === counts.ofA, `chat de A recebeu ${toA.length}`);
  assertCondition(toB.length === counts.ofB, `chat de B recebeu ${toB.length}`);
  assertCondition(context.bot.requests.length === sent, 'houve envio além dos alertas');
  assertCondition(
    toA.every((text) => text.includes('BTCUSDT') && !text.includes('ETHUSDT')),
    'o chat de A recebeu alerta de outro dono',
  );
  assertCondition(
    toB.every((text) => text.includes('ETHUSDT') && !text.includes('BTCUSDT')),
    'o chat de B recebeu alerta de outro dono',
  );
  assertCondition(
    toA.every((text) => text.includes('60,0%') && text.includes('10 operações')),
    'o alerta de A não traz o acerto histórico do último walk-forward',
  );
  assertCondition(
    toB.every((text) => text.toLowerCase().includes('sem walk-forward')),
    'o alerta de B inventou um acerto histórico',
  );
  assertCondition(
    [...toA, ...toB].every((text) => /Motivo: \S/u.test(text) && text.includes('Ação simulada:')),
    'alerta sem motivo ou sem ação simulada',
  );
  const statuses = (await readAlerts(context)).map((row) => row.status);
  assertCondition(
    statuses.every((status) => status === 'sent'),
    'alerta não marcado como enviado',
  );
  const again = await dispatchUntilQuiet(context);
  assertCondition(again === 0 && context.bot.requests.length === sent, 'reenviou o já enviado');
  reportTelegramLine(
    `entrega: ${sent} mensagens, cada uma ao chat do próprio dono (A: BTCUSDT com 60,0% em 10 operações; B: ETHUSDT sem walk-forward); nenhuma a C nem ao chat alheio; segunda rodada não reenvia`,
  );
}
