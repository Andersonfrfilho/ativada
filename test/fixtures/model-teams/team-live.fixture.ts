// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { TeamStepSettings } from '../../../apps/worker-ativada/src/live/live-run.types.js';
import type {
  ScheduledReportLookup,
  TeamReportView,
  TeamRunInputWrite,
} from '../../../packages/database/src/index.js';
import { MODEL_TEAM_STRATEGY, type TeamAction } from '../../../packages/model-agents/src/index.js';
import { computeStrategyLeadInCandles } from '../../../packages/strategy-engine/src/index.js';
import {
  createInMemoryLive,
  type InMemoryLive,
  type LiveScenario,
} from '../live/in-memory-live-database.fixture.js';
import { buildTeamCandles, buildTeamRunSetup, teamCandleOpenTime } from './team-candles.fixture.js';

export const TEAM_SETTINGS: TeamStepSettings = { deadlineMilliseconds: 45_000, cadenceMinutes: 60 };
export const TEAM_LEAD_IN = computeStrategyLeadInCandles(MODEL_TEAM_STRATEGY.config);
export const TEAM_CANDLE_COUNT = TEAM_LEAD_IN + 48;
const CADENCE_CANDLES = 4;

// O índice, depois do aquecimento e `slot` ritmos adiante, cujo FECHAMENTO cai na grade de 60 min: o que recebe relatório.
export function cadenceIndex(slot: number): number {
  let index = TEAM_LEAD_IN + slot * CADENCE_CANDLES;
  while ((index + 1) % CADENCE_CANDLES !== 0) index += 1;
  return index;
}

const ROLE_REASON = 'Leitura de teste dos dados públicos.';

export function decidedView(params: {
  readonly id: string;
  readonly action: TeamAction;
  readonly isInTime?: boolean;
}): TeamReportView {
  const isBuy = params.action === 'buy';
  return {
    id: params.id,
    status: 'decided',
    failureCode: null,
    isDecidedInTime: params.isInTime ?? true,
    decision: {
      action: params.action,
      entryPrice: isBuy ? '100.5' : null,
      targetPrice: isBuy ? '102' : null,
      stopPrice: isBuy ? '99.5' : null,
      confidence: 62,
      roles: {
        trend: { stance: 'up', reason: ROLE_REASON },
        risk: { level: 'medium', reason: ROLE_REASON },
        decision: { reason: `Gestor: ${params.action}.` },
      },
    },
  };
}

export function failedView(id: string, failureCode: string): TeamReportView {
  return { id, status: 'failed', failureCode, isDecidedInTime: false, decision: undefined };
}

export function pendingView(id: string): TeamReportView {
  return { id, status: 'pending', failureCode: null, isDecidedInTime: false, decision: undefined };
}

// O que o banco responderia, por vela: o relatório (se houver) e se o prazo do BANCO já passou.
export type TeamScript = {
  readonly byCandle: Map<number, ScheduledReportLookup>;
  readonly byId: Map<string, TeamReportView>;
  readonly lookups: number[];
  readonly reads: string[];
  setReport: (index: number, view: TeamReportView, isPastDeadline?: boolean) => void;
  setPastDeadline: (index: number) => void;
};

export function createTeamScript(): TeamScript {
  const script: TeamScript = {
    byCandle: new Map(),
    byId: new Map(),
    lookups: [],
    reads: [],
    setReport: (index, view, isPastDeadline = false) => {
      script.byCandle.set(teamCandleOpenTime(index), { isPastDeadline, report: view });
      script.byId.set(view.id, view);
    },
    setPastDeadline: (index) => {
      script.byCandle.set(teamCandleOpenTime(index), { isPastDeadline: true, report: undefined });
    },
  };
  return script;
}

export type TeamLiveOptions = {
  readonly script: TeamScript;
  readonly overrides?: Partial<Omit<LiveScenario, 'candles'>>;
  readonly candleCount?: number;
};

export function buildTeamLive(options: TeamLiveOptions): InMemoryLive {
  const candles = buildTeamCandles(options.candleCount ?? TEAM_CANDLE_COUNT);
  const setup = buildTeamRunSetup();
  const { script } = options;
  return createInMemoryLive({
    candles,
    periodStart: teamCandleOpenTime(TEAM_LEAD_IN),
    runParameters: structuredClone(setup.parameters),
    runHash: setup.runHash,
    strategy: MODEL_TEAM_STRATEGY,
    signalSource: { kind: 'model_team', team: 'lucas' },
    team: {
      lookupScheduledReport: (params) => {
        script.lookups.push(params.candleTime);
        return Promise.resolve(
          script.byCandle.get(params.candleTime) ?? { isPastDeadline: true, report: undefined },
        );
      },
      readReportById: (id) => {
        script.reads.push(id);
        return Promise.resolve(script.byId.get(id));
      },
    },
    ...options.overrides,
  });
}

export function inputsOf(live: InMemoryLive): readonly TeamRunInputWrite[] {
  return [...live.state.teamInputs.values()].sort((a, b) => a.candleTime - b.candleTime);
}
