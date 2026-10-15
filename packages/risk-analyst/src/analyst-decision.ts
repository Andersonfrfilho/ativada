// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  ANALYST_RULES,
  ANALYST_VERSION,
  CANDLE_MILLISECONDS,
  MAX_TRADE_MINUTES,
  type EntryGate,
  type NoDataDetail,
} from './analyst.constant.js';
import { toAnalystCommands } from './analyst-commands.js';
import type {
  AnalystCommand,
  AnalystDecision,
  AnalystInput,
  RiskLock,
  TeamForecast,
} from './analyst-decision.types.js';
import type { MarketReadings, SpecialistView } from './analyst.types.js';
import { computeMarketReadings } from './market-readings.js';
import {
  chooseCadence,
  choosePosture,
  detectNoData,
  isOnCadence,
  resolveEntryGate,
  riskScaleOf,
} from './posture-policy.js';
import { computeRiskLocks } from './risk-locks.js';
import { buildSpecialistViews } from './specialist-views.js';
import { forecastTeam } from './team-forecast.js';

type Analysis = {
  readonly readings: MarketReadings;
  readonly specialists: readonly SpecialistView[];
  readonly noData: NoDataDetail | null;
  readonly locks: readonly RiskLock[];
  readonly forecast: TeamForecast;
};

// Etapas 1, 2 e 4 (A10 a A12): leituras, auditor da equipe, dado, travas e previsão.
function analyze(input: AnalystInput): Analysis {
  const { candleTime } = input;
  const readings = computeMarketReadings({
    candles: input.candles,
    candleTime,
    series: input.team.trend,
    runCost: input.runCost,
  });
  const specialists = buildSpecialistViews({
    team: input.team,
    strategyVotes: input.strategyVotes,
    candleTime,
  });
  const noData = detectNoData({
    isWaitingForData: input.isWaitingForData,
    isCatchingUp: input.isCatchingUp,
    readings,
  });
  const locks = computeRiskLocks({
    candleTime,
    wallet: input.wallet,
    goal: input.goal,
    riskPerTrade: input.riskPerTrade,
    atrRate: readings.atrRate,
    roundTripCost: readings.roundTripCost,
    moveToCost: readings.moveToCost,
  });
  const forecast = forecastTeam({
    specialists,
    atrRate: readings.atrRate,
    atrPercentile95: readings.atrPercentile95,
    hasData: noData === null,
  });
  return { readings, specialists, noData, locks, forecast };
}

// Etapa 6 (A14): posição aberta há 4 velas (aberta em `t − 3·d` ou antes) sai na abertura da próxima. Vale em toda vela,
// inclusive em pausa.
function isTimeExitDue(input: AnalystInput): boolean {
  const oldestAllowed =
    input.candleTime - (ANALYST_RULES.maxTradeCandles - 1) * CANDLE_MILLISECONDS;
  return input.wallet.positions.some(
    (position) => position.closedCandleTime === null && position.openedCandleTime <= oldestAllowed,
  );
}

function translateCommands(
  input: AnalystInput,
  decision: { readonly entryGate: EntryGate; readonly timeExitDue: boolean },
): readonly AnalystCommand[] {
  const { wallet } = input;
  return toAnalystCommands({
    candleTime: input.candleTime,
    entryGate: decision.entryGate,
    timeExitDue: decision.timeExitDue,
    wallet: {
      isHalted: wallet.isHalted,
      lastHaltReason: wallet.lastHaltReason,
      hasPosition: wallet.positions.some((position) => position.closedCandleTime === null),
    },
  });
}

// `analyst-1` (A10 a A16): a decisão da vela `t` é função só do mercado até `t`, da carteira em `t` e da meta. A regra só
// TIRA risco: devolve a porta de entrada, a saída por tempo e o tamanho (nunca acima de 1); nunca um comando de entrada.
export function decideAnalyst(input: AnalystInput): AnalystDecision {
  const { readings, specialists, noData, locks, forecast } = analyze(input);
  const choice = choosePosture({ noData, locks, readings, forecast });
  const cadenceMinutes = chooseCadence(readings.relativeVolume);
  const onCadence = isOnCadence({ candleTime: input.candleTime, cadenceMinutes });
  const entryGate = resolveEntryGate({ posture: choice.posture, isOnCadence: onCadence });
  const timeExitDue = isTimeExitDue(input);
  return {
    version: ANALYST_VERSION,
    candleTime: input.candleTime,
    ...choice,
    cadenceMinutes,
    isOnCadence: onCadence,
    entryGate,
    riskScale: riskScaleOf(choice.posture),
    maxTradeMinutes: MAX_TRADE_MINUTES,
    timeExitDue,
    forecast,
    readings,
    specialists,
    locks,
    commands: translateCommands(input, { entryGate, timeExitDue }),
  };
}
