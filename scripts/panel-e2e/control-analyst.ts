// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createAnalystDecisionRepository,
  createRunRepository,
  RUN_STATUS,
  type DatabaseHandle,
  type OwnerScope,
} from '../../packages/database/src/index.js';
import type { AnalystDecision } from '../../packages/risk-analyst/src/index.js';
import { toDecidedRecord } from '../../apps/worker-ativada/src/live/analyst-record.js';
import { ANALYST_GOLDEN } from '../../test/fixtures/risk-analyst/analyst-golden.fixture.js';

// O mesmo canal por onde o worker avisa a API (ADR 0001 §r): o aviso é só um ponteiro, o dado vai para o banco antes.
const RUN_EVENTS_CHANNEL = 'run_events';
const QUARTER_HOUR_MILLISECONDS = 900_000;

// Duas decisões REAIS da regra `analyst-1` (o dourado da T1.4): PAUSA por custo e LIBERADA com previsão firme.
const SCENARIO_CASE = {
  pause: 'real:3299:clean',
  confident: 'synthetic:2711:clean',
} as const;

export type AnalystScenario = keyof typeof SCENARIO_CASE;

export function isAnalystScenario(value: unknown): value is AnalystScenario {
  return value === 'pause' || value === 'confident';
}

export type AnalystControlParams = {
  readonly handle: DatabaseHandle;
  readonly sql: Bun.SQL;
  readonly scope: OwnerScope;
  readonly lastOpenTime: number;
};

type RunRow = { readonly id: string; readonly status: string };

function readDecision(scenario: AnalystScenario): AnalystDecision {
  const text = ANALYST_GOLDEN[SCENARIO_CASE[scenario]];
  if (text === undefined) throw new Error('caso do dourado ausente');
  const parsed: unknown = JSON.parse(text);
  const decision: unknown =
    typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'decision') : undefined;
  return decision as AnalystDecision;
}

// A simulação ao vivo com analista que o PAINEL criou pela API (a mais nova): o worker não existe no E2E.
async function findAnalystRun(params: AnalystControlParams): Promise<RunRow> {
  const rows: unknown = await params.sql`
    SELECT id, status FROM runs
    WHERE user_id = ${params.scope.ownerUserId} AND kind = 'live_paper' AND request->'analyst' IS NOT NULL
    ORDER BY created_at DESC LIMIT 1`;
  const row = (rows as readonly RunRow[])[0];
  if (row === undefined) throw new Error('nenhuma simulação com analista foi criada pelo painel');
  return row;
}

// Faz o papel do worker: a simulação criada pelo painel passa a rodar, a decisão do analista (a linha real do dourado) entra
// no banco e a API é avisada pelo NOTIFY `analyst` de verdade. Devolve o id da simulação.
export async function pushAnalystDecision(
  params: AnalystControlParams,
  request: { readonly scenario: AnalystScenario; readonly sequence: number },
): Promise<string> {
  const run = await findAnalystRun(params);
  if (run.status === RUN_STATUS.QUEUED) {
    await createRunRepository(params.handle).transitionRun(params.scope, {
      runId: run.id,
      to: RUN_STATUS.RUNNING,
    });
  }
  const candleTime = params.lastOpenTime + request.sequence * QUARTER_HOUR_MILLISECONDS;
  const decision = { ...readDecision(request.scenario), candleTime };
  const record = toDecidedRecord({ runId: run.id, decision });
  await createAnalystDecisionRepository(params.handle).appendAnalystDecision(params.scope, record);
  await params.sql`UPDATE runs SET last_candle_time = ${candleTime} WHERE id = ${run.id}`;
  const payload = { runId: run.id, kind: 'analyst', eventId: String(candleTime) };
  await params.sql`SELECT pg_notify(${RUN_EVENTS_CHANNEL}, ${JSON.stringify(payload)})`;
  return run.id;
}
