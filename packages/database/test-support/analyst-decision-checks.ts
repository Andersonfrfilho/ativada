// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  ANALYST_DECISION_ENTRY_GATE,
  ANALYST_DECISION_MODE,
  ANALYST_DECISION_POSTURE,
  ANALYST_DECISION_STATUS,
} from '../src/analyst/analyst-decision.constant.js';
import { createAnalystDecisionRepository } from '../src/analyst/analyst-decision.repository.js';
import type { AnalystDecisionInput } from '../src/analyst/analyst-decision.types.js';
import { RUN_KIND } from '../src/runs/run.constant.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import {
  candleTimeAt,
  captureErrorCode,
  resolvePersistenceOwner,
  seedRun,
} from './persistence-seed.js';

const CHECK_VIOLATION_SQLSTATE = '23514';
const FOREIGN_KEY_VIOLATION_SQLSTATES: readonly string[] = ['23503', '23001'];
const SEEDED_DECISIONS = 5;
const PAGE_SIZE = 2;
const MARKER_MESSAGE = 'analyst-decision-marker';

export function buildAnalystDecisionInput(
  runId: string,
  candleTime: number,
  overrides: Partial<AnalystDecisionInput> = {},
): AnalystDecisionInput {
  return {
    runId,
    candleTime,
    version: 'analyst-1',
    mode: ANALYST_DECISION_MODE.SHADOW,
    status: ANALYST_DECISION_STATUS.DECIDED,
    posture: ANALYST_DECISION_POSTURE.CAUTION,
    reason: 'weak_forecast',
    cadenceMinutes: 60,
    entryGate: ANALYST_DECISION_ENTRY_GATE.OPEN,
    riskScale: '0.5',
    isTimeExitDue: false,
    forecast: { side: 'up', strength: 'weak' },
    readings: { atrRate: '0.012' },
    specialists: [{ key: 'trend', weight: '0.1' }],
    locks: [{ key: 'daily_loss', isActive: false }],
    commands: [],
    message: MARKER_MESSAGE,
    failureCode: undefined,
    ...overrides,
  };
}

async function checkRoundTrip(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-analyst-round-trip');
  const run = await seedRun(handle, owner, { kind: RUN_KIND.LIVE_PAPER, periodEnd: undefined });
  const decisions = createAnalystDecisionRepository(handle);
  const input = buildAnalystDecisionInput(run.id, candleTimeAt(1));
  assertCondition(
    (await decisions.appendAnalystDecision(owner.scope, input)) === true,
    'a primeira gravação cria a linha',
  );
  const found = await decisions.findAnalystDecision(owner.scope, {
    runId: run.id,
    candleTime: input.candleTime,
  });
  assertCondition(
    found?.riskScale === '0.5' && found.cadenceMinutes === 60 && found.posture === 'caution',
    'colunas simples voltam como foram gravadas (tamanho em texto exato)',
  );
  assertCondition(
    JSON.stringify(found?.specialists) === JSON.stringify(input.specialists) &&
      JSON.stringify(found?.forecast) === JSON.stringify(input.forecast),
    'os blocos jsonb voltam como objeto e lista, não como texto',
  );
  const repeated = await decisions.appendAnalystDecision(
    owner.scope,
    buildAnalystDecisionInput(run.id, input.candleTime, { posture: 'pause', message: 'outra' }),
  );
  const after = await decisions.findAnalystDecision(owner.scope, {
    runId: run.id,
    candleTime: input.candleTime,
  });
  assertCondition(
    repeated === false && after?.posture === 'caution' && after.message === MARKER_MESSAGE,
    'a vela já decidida é imutável: repetir não grava nem muda',
  );
  const failedTime = candleTimeAt(2);
  await decisions.appendAnalystDecision(
    owner.scope,
    buildAnalystDecisionInput(run.id, failedTime, {
      status: ANALYST_DECISION_STATUS.FAILED,
      posture: undefined,
      reason: undefined,
      cadenceMinutes: undefined,
      entryGate: undefined,
      riskScale: undefined,
      isTimeExitDue: undefined,
      forecast: undefined,
      readings: undefined,
      specialists: undefined,
      locks: undefined,
      commands: undefined,
      message: undefined,
      failureCode: 'ANALYST_SERIES_UNAVAILABLE',
    }),
  );
  const failed = await decisions.findAnalystDecision(owner.scope, {
    runId: run.id,
    candleTime: failedTime,
  });
  assertCondition(
    failed?.status === 'failed' &&
      failed.posture === null &&
      failed.forecast === null &&
      failed.failureCode === 'ANALYST_SERIES_UNAVAILABLE',
    'a falha grava só o código e deixa o resto nulo',
  );
  reportCheck('analyst_decisions: ida e volta, jsonb, imutabilidade por vela e linha de falha');
}

async function checkRejectedRows(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-analyst-rejected');
  const run = await seedRun(handle, owner, { kind: RUN_KIND.LIVE_PAPER, periodEnd: undefined });
  const decisions = createAnalystDecisionRepository(handle);
  const invalid: Readonly<Record<string, Partial<AnalystDecisionInput>>> = {
    version: { version: 'analyst-2' },
    mode: { mode: 'auto' },
    status: { status: 'maybe' },
    posture: { posture: 'panic' },
    cadence: { cadenceMinutes: 30 },
    entryGate: { entryGate: 'ajar' },
    riskScale: { riskScale: '0.3' },
    decidedWithoutPosture: { posture: undefined },
    failedWithoutCode: { status: 'failed', failureCode: undefined },
  };
  let candleIndex = 10;
  for (const [name, overrides] of Object.entries(invalid)) {
    const code = await captureErrorCode(
      decisions.appendAnalystDecision(
        owner.scope,
        buildAnalystDecisionInput(run.id, candleTimeAt(candleIndex), overrides),
      ),
    );
    candleIndex += 1;
    assertCondition(code === CHECK_VIOLATION_SQLSTATE, `valor fora do catálogo aceito: ${name}`);
  }
  reportCheck(
    'analyst_decisions: versão, modo, estado, postura, ritmo, porta, tamanho e coerência barrados',
  );
}

async function checkPagesAndIsolation(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-analyst-pages');
  const stranger = await resolvePersistenceOwner(handle, 'subject-analyst-stranger');
  const run = await seedRun(handle, owner, { kind: RUN_KIND.LIVE_PAPER, periodEnd: undefined });
  const decisions = createAnalystDecisionRepository(handle);
  for (let index = 0; index < SEEDED_DECISIONS; index += 1) {
    await decisions.appendAnalystDecision(
      owner.scope,
      buildAnalystDecisionInput(run.id, candleTimeAt(index)),
    );
  }
  const seen: number[] = [];
  let before: number | undefined;
  do {
    const page = await decisions.listAnalystDecisionsPage(owner.scope, {
      runId: run.id,
      limit: PAGE_SIZE,
      before,
    });
    assertCondition(page.decisions.length <= PAGE_SIZE, 'página maior que o pedido');
    seen.push(...page.decisions.map((decision) => decision.candleTime));
    before = page.nextCursor;
  } while (before !== undefined);
  const expected = Array.from({ length: SEEDED_DECISIONS }, (_, index) =>
    candleTimeAt(SEEDED_DECISIONS - 1 - index),
  );
  assertCondition(
    JSON.stringify(seen) === JSON.stringify(expected),
    `páginas decrescentes sem repetir nem pular: ${JSON.stringify(seen)}`,
  );
  const latest = await decisions.findLatestAnalystDecision(owner.scope, run.id);
  assertCondition(
    latest?.candleTime === candleTimeAt(SEEDED_DECISIONS - 1),
    'a mais nova vem primeiro',
  );
  assertCondition(
    (await decisions.findLatestAnalystDecision(stranger.scope, run.id)) === undefined &&
      (await decisions.findAnalystDecision(stranger.scope, {
        runId: run.id,
        candleTime: candleTimeAt(0),
      })) === undefined &&
      (
        await decisions.listAnalystDecisionsPage(stranger.scope, {
          runId: run.id,
          limit: 10,
          before: undefined,
        })
      ).decisions.length === 0,
    'outro usuário não lê decisão alheia',
  );
  const foreignCode = await captureErrorCode(
    decisions.appendAnalystDecision(
      stranger.scope,
      buildAnalystDecisionInput(run.id, candleTimeAt(99)),
    ),
  );
  assertCondition(
    foreignCode !== undefined && FOREIGN_KEY_VIOLATION_SQLSTATES.includes(foreignCode),
    'gravar em execução alheia é barrado pela chave composta',
  );
  const deleteCode = await captureErrorCode(client`DELETE FROM runs WHERE id = ${run.id}`);
  assertCondition(
    deleteCode !== undefined && FOREIGN_KEY_VIOLATION_SQLSTATES.includes(deleteCode),
    'apagar a execução com decisões é barrado (RESTRICT)',
  );
  reportCheck(
    'analyst_decisions: páginas por vela, isolamento entre donos, chave composta e RESTRICT',
  );
}

export async function checkAnalystDecisions(context: LifecycleCheckContext): Promise<void> {
  await checkRoundTrip(context);
  await checkRejectedRows(context);
  await checkPagesAndIsolation(context);
}
