// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  expectedGoalOutcome,
  ETH_DAILY,
  GOAL_SPECS,
  type Expected,
} from '../../test/fixtures/live/goal-expected-outcome.fixture.js';
import {
  assertCondition,
  createLiveUser,
  createProductionEvaluator,
  errorsOf,
  tickUntilQuiet,
  waitFor,
  type LiveUser,
} from '../live-test/live-test-context.js';
import {
  EVALUATOR_PASS_STEPS,
  FRESH_FOREVER_CANDLES,
} from '../telegram-test/telegram-test.constant.js';
import {
  dispatchUntilQuiet,
  linkChat,
  messagesTo,
} from '../telegram-test/telegram-test-context.js';
import {
  CHAT_BASE,
  GOAL_ALERT_SIDE,
  GOAL_SYMBOL,
  RESTART_HEARTBEAT_SECONDS,
  RUN_STATUS_COMPLETED,
} from './goals-test.constant.js';
import { createGoal, startGoalRun, type GoalsTestContext } from './goals-test-context.js';

export const OUTCOME_NAMES = ['reached', 'stopped', 'expired'] as const;
export type OutcomeName = (typeof OUTCOME_NAMES)[number];

export type Scenario = {
  readonly name: OutcomeName;
  readonly user: LiveUser;
  readonly runId: string;
  readonly chatId: string;
  readonly expected: Expected;
};

export type GoalRunState = {
  readonly status: string;
  readonly outcome: string | null;
  readonly outcomeCandleTime: number | null;
  readonly openPositions: number;
  readonly goalAlerts: number;
  readonly counts: string;
};

type StateRow = {
  readonly status: string;
  readonly goal_outcome: string | null;
  readonly goal_outcome_candle_time: string | null;
  readonly open_positions: number;
  readonly goal_alerts: number;
  readonly counts: string;
};

const TABLES = ['signals', 'orders', 'fills', 'positions', 'equity_points'] as const;

export function reportGoals(message: string): void {
  process.stdout.write(`goals-test: ${message}\n`);
}

export async function readGoalRunState(
  context: GoalsTestContext,
  runId: string,
): Promise<GoalRunState> {
  const { client } = context.live;
  const rows: unknown = await client`SELECT r.status, r.goal_outcome,
      r.goal_outcome_candle_time::text AS goal_outcome_candle_time,
      (SELECT count(*)::int FROM positions WHERE run_id = r.id AND status = 'open') AS open_positions,
      (SELECT count(*)::int FROM alerts WHERE run_id = r.id AND side = ${GOAL_ALERT_SIDE}) AS goal_alerts,
      (SELECT concat_ws(',',
        (SELECT count(*) FROM signals WHERE run_id = r.id),
        (SELECT count(*) FROM orders WHERE run_id = r.id),
        (SELECT count(*) FROM fills WHERE run_id = r.id),
        (SELECT count(*) FROM positions WHERE run_id = r.id),
        (SELECT count(*) FROM equity_points WHERE run_id = r.id))) AS counts
    FROM runs r WHERE r.id = ${runId}`;
  const row = (rows as readonly StateRow[])[0];
  if (row === undefined) throw new Error('execução inexistente');
  return {
    status: row.status,
    outcome: row.goal_outcome,
    outcomeCandleTime:
      row.goal_outcome_candle_time === null ? null : Number(row.goal_outcome_candle_time),
    openPositions: row.open_positions,
    goalAlerts: row.goal_alerts,
    counts: `${TABLES.join('/')}=${row.counts}`,
  };
}

export async function startScenario(
  context: GoalsTestContext,
  params: { readonly name: OutcomeName; readonly label: string; readonly chatOffset: number },
): Promise<Scenario> {
  const user = await createLiveUser(context.live, `goals-${params.label}-${params.name}`);
  const chatId = String(CHAT_BASE + params.chatOffset);
  await linkChat(user, { context: context.live, chatId, label: params.label });
  const spec = GOAL_SPECS[params.name];
  if (spec === undefined) throw new Error('meta de teste ausente');
  const goalId = await createGoal(context, { user, spec });
  const run = await startGoalRun(context, { user, goalId });
  const expected = expectedGoalOutcome(spec);
  assertCondition(
    expected.outcome === params.name,
    `a varredura independente deu ${expected.outcome}`,
  );
  return { name: params.name, user, runId: run.id, chatId, expected };
}

export function alertingFor(): { now: () => number; maxAgeCandles: number } {
  const lastClose = ETH_DAILY.candles.at(-1)?.closeTime ?? 0;
  return { now: () => lastClose, maxAgeCandles: FRESH_FOREVER_CANDLES };
}

export async function evaluateAll(context: GoalsTestContext, instanceId: string): Promise<void> {
  const { evaluator, entries } = createProductionEvaluator(context.live, {
    instanceId,
    maxStepsPerPass: EVALUATOR_PASS_STEPS,
    alerting: alertingFor(),
  });
  await tickUntilQuiet(evaluator);
  assertCondition(errorsOf(entries).length === 0, `${instanceId}: o avaliador registrou erro`);
}

export function assertOutcome(scenario: Scenario, state: GoalRunState, label: string): void {
  const candle = ETH_DAILY.candles[scenario.expected.candleIndex];
  assertCondition(
    state.status === RUN_STATUS_COMPLETED,
    `${label}: ${scenario.name} terminou ${state.status}`,
  );
  assertCondition(
    state.outcome === scenario.expected.runOutcome && state.outcomeCandleTime === candle?.openTime,
    `${label}: ${scenario.name} gravou ${state.outcome} em ${state.outcomeCandleTime}`,
  );
  assertCondition(state.openPositions === 0, `${label}: ${scenario.name} deixou posição aberta`);
  assertCondition(
    state.goalAlerts === 1,
    `${label}: ${scenario.name} tem ${state.goalAlerts} alertas`,
  );
}

// Os três desfechos contra o Postgres real, pelo avaliador de produção e pela API: o desfecho é o da varredura independente.
export async function checkThreeOutcomes(context: GoalsTestContext): Promise<readonly Scenario[]> {
  const scenarios: Scenario[] = [];
  for (const [index, name] of OUTCOME_NAMES.entries()) {
    scenarios.push(await startScenario(context, { name, label: 'direct', chatOffset: index }));
  }
  await evaluateAll(context, 'goals-evaluator');
  for (const scenario of scenarios) {
    const state = await readGoalRunState(context, scenario.runId);
    assertOutcome(scenario, state, 'direto');
    reportGoals(
      `desfecho ${scenario.name}: ${state.outcome} no candle ${state.outcomeCandleTime} (varredura independente: candle ${scenario.expected.candleIndex}), carteira assentada, execução concluída, um alerta GOAL`,
    );
  }
  await checkDelivery(context, scenarios);
  return scenarios;
}

const GOAL_TITLE: Readonly<Record<OutcomeName, string>> = {
  reached: 'Meta atingida',
  stopped: 'Perda máxima atingida',
  expired: 'Prazo da meta vencido',
};

async function countQueuedAlerts(context: GoalsTestContext): Promise<number> {
  const rows: unknown = await context.live.client`SELECT count(*)::int AS total FROM alerts`;
  return (rows as readonly { total: number }[])[0]?.total ?? 0;
}

function goalMessagesTo(context: GoalsTestContext, scenario: Scenario): readonly string[] {
  return messagesTo(context.telegram, scenario.chatId).filter((text) =>
    text.includes(GOAL_TITLE[scenario.name]),
  );
}

async function checkDelivery(
  context: GoalsTestContext,
  scenarios: readonly Scenario[],
): Promise<void> {
  const queued = await countQueuedAlerts(context);
  const sent = await dispatchUntilQuiet(context.telegram);
  assertCondition(sent === queued, `enviadas ${sent} mensagens de ${queued} na caixa de saída`);
  for (const scenario of scenarios) {
    const messages = goalMessagesTo(context, scenario);
    assertCondition(
      messages.length === 1 && messages[0]?.includes(GOAL_SYMBOL) === true,
      `${scenario.name}: o chat do dono recebeu ${messages.length} mensagens de desfecho`,
    );
  }
  assertCondition((await dispatchUntilQuiet(context.telegram)) === 0, 'reenviou o já enviado');
  reportGoals(
    `entrega: ${sent} mensagens (sinais e desfechos), uma mensagem de desfecho ao chat de cada dono; segunda rodada não reenvia`,
  );
}

// Reiniciar logo depois do desfecho: o worker some com o desfecho já gravado; outro assume e nada se repete.
export async function checkRestart(
  context: GoalsTestContext,
  references: readonly Scenario[],
): Promise<void> {
  const restarts: Scenario[] = [];
  for (const [index, reference] of references.entries()) {
    const restarted = await startScenario(context, {
      name: reference.name,
      label: 'restart',
      chatOffset: 10 + index,
    });
    restarts.push(restarted);
    const doomed = createProductionEvaluator(context.live, {
      instanceId: `goals-doomed-${reference.name}`,
      heartbeatTimeoutSeconds: RESTART_HEARTBEAT_SECONDS,
      maxStepsPerPass: 1,
      alerting: alertingFor(),
    });
    await waitFor('o desfecho ser gravado pelo processo que vai morrer', async () => {
      await doomed.evaluator.tick();
      return (await readGoalRunState(context, restarted.runId)).outcome !== null;
    });
    const rescuer = createProductionEvaluator(context.live, {
      instanceId: `goals-rescuer-${reference.name}`,
      heartbeatTimeoutSeconds: RESTART_HEARTBEAT_SECONDS,
      maxStepsPerPass: EVALUATOR_PASS_STEPS,
      alerting: alertingFor(),
    });
    await waitFor('a instância nova concluir a simulação', async () => {
      await rescuer.evaluator.tick();
      return (await readGoalRunState(context, restarted.runId)).status === RUN_STATUS_COMPLETED;
    });
    const state = await readGoalRunState(context, restarted.runId);
    const direct = await readGoalRunState(context, reference.runId);
    assertOutcome(restarted, state, 'reinício');
    assertCondition(
      state.counts === direct.counts,
      `${reference.name}: contagens ${state.counts} diferem da execução ininterrupta ${direct.counts}`,
    );
    assertCondition(errorsOf(rescuer.entries).length === 0, 'o worker novo registrou erro');
    reportGoals(
      `reinício após o desfecho ${reference.name}: outro worker retomou, desfecho e candle iguais, um só alerta GOAL, ${state.counts} idêntico ao da execução ininterrupta`,
    );
  }
  await checkNoDuplicateDelivery(context, restarts);
}

async function checkNoDuplicateDelivery(
  context: GoalsTestContext,
  restarts: readonly Scenario[],
): Promise<void> {
  const queued = await countQueuedAlerts(context);
  const alreadySent = context.telegram.bot.requests.length;
  const sent = await dispatchUntilQuiet(context.telegram);
  assertCondition(
    alreadySent + sent === queued,
    `após o reinício: ${alreadySent + sent} mensagens para ${queued} alertas`,
  );
  for (const scenario of restarts) {
    const messages = goalMessagesTo(context, scenario);
    assertCondition(
      messages.length === 1,
      `${scenario.name} reiniciada: ${messages.length} mensagens de desfecho`,
    );
  }
  reportGoals(
    `entrega após o reinício: ${sent} mensagens novas, uma de desfecho por execução reiniciada, nenhuma repetida`,
  );
}
