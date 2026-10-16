// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useUserTimeZone } from '../../../account/useUserTimeZone.hook.js';
import { useAnalystQuery } from '../../analyst/analyst.query.js';
import type { AnalystPosture } from '../../analyst/analyst.validation.js';
import { OUTCOME_LOOK } from '../../live-tracking/DecisionRow.component.js';
import { formatScoreOfThreshold } from '../../live-tracking/decision-text.js';
import type { Decision, LiveStatus } from '../../live-tracking/live-status.validation.js';
import { useRunDetailQuery, useTradesQuery } from '../../runs.query.js';
import { buildPlaques } from '../balcony/plaque-model.js';
import { readCostRates } from '../balcony/protection-math.js';
import type { OfficeScene } from './office.constant.js';
import { lightOf, type OfficeLight } from './office-light.js';
import {
  buildBoard,
  buildClock,
  buildScreen,
  type BoardModel,
  type ClockModel,
  type ScreenModel,
} from './office-model.js';
import { sceneOf } from './office-scene.js';

export type OfficeModel = {
  readonly clock: ClockModel;
  readonly screen: ScreenModel;
  readonly board: BoardModel;
  // A placa que a Renata levanta no sinal de compra ou de venda; sem sinal (ou sem dados), nada.
  readonly plaque: string | undefined;
  readonly posture: AnalystPosture | undefined;
  readonly isLocked: boolean;
  readonly scene: OfficeScene;
  readonly light: OfficeLight;
};

export type OfficeModelInput = {
  readonly runId: string;
  readonly status: LiveStatus;
  // A decisão mais recente (a cena da coreografia é sempre a da vela nova, mesmo revendo uma antiga).
  readonly latest: Decision | undefined;
  readonly now: number;
};

const PLAQUE_GLYPH: Readonly<Record<string, string>> = { gain: '▲', loss: '▼', flat: '=' };

function plaqueKeyOf(outcome: Decision['outcome'] | undefined): string | undefined {
  if (outcome === 'bought' || outcome === 'buy_pending') return 'buy';
  return outcome === 'sold' || outcome === 'exited' ? 'closed' : undefined;
}

// Só os dados que as plaquinhas da operação já leem (mesmas consultas, mesmas contas): nada novo no servidor.
function usePlaqueText(input: OfficeModelInput): string | undefined {
  const { runId, latest } = input;
  const timeZone = useUserTimeZone();
  const run = useRunDetailQuery(runId).data;
  const open = useTradesQuery(runId, { status: 'open' }).data?.pages[0]?.items[0];
  const closed = useTradesQuery(runId, { status: 'closed' }).data?.pages[0]?.items[0];
  const key = plaqueKeyOf(latest?.outcome);
  if (run === undefined || key === undefined) return undefined;
  const plaque = buildPlaques({
    symbol: run.symbol,
    timeZone,
    costs: readCostRates(run.runParameters),
    openTrade: open,
    closedTrade: closed,
    currentPrice: undefined,
  }).find((item) => item.key === key);
  if (plaque === undefined) return undefined;
  return `${PLAQUE_GLYPH[plaque.tone] ?? ''} ${plaque.word} ${plaque.priceText} · ${plaque.percent}`;
}

export function useOfficeModel(input: OfficeModelInput): OfficeModel | undefined {
  const { runId, status, latest, now } = input;
  const timeZone = useUserTimeZone();
  const snapshot = useAnalystQuery(runId).data;
  const plaque = usePlaqueText(input);
  if (latest === undefined) return undefined;
  const analyst = snapshot?.isEnabled === true ? snapshot.analyst : undefined;
  const posture = analyst?.current.status === 'decided' ? analyst.current.posture : undefined;
  const locks = analyst?.locks;
  const isLocked = posture === 'pause' || (locks?.some((lock) => lock.isActive) ?? false);
  const closes = [...status.decisions.items].reverse().map((decision) => decision.close);
  return {
    clock: buildClock(status, timeZone),
    screen: buildScreen(status, closes),
    board: buildBoard({
      signalWord: OUTCOME_LOOK[latest.outcome].word,
      scoreText: formatScoreOfThreshold(latest.score, latest.scoreThreshold),
      locks,
      goal: status.goal?.message,
    }),
    plaque,
    posture,
    isLocked,
    scene: sceneOf({ outcome: latest.outcome, posture, hasActiveLock: isLocked }),
    light: lightOf({
      isLocked,
      outcome: latest.outcome,
      nextDecisionAt: status.run.nextDecisionAt,
      now,
    }),
  };
}
