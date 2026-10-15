// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  ANALYST_REASON,
  ANALYST_RULES,
  CANDLE_MILLISECONDS,
  CAPPED_DETAIL,
  ENTRY_GATE,
  FORECAST_SIDE,
  FORECAST_STRENGTH,
  MILLISECONDS_PER_MINUTE,
  NO_DATA_DETAIL,
  POSTURE,
  type EntryGate,
  type NoDataDetail,
  type Posture,
} from './analyst.constant.js';
import { decimalOf } from './analyst-decimal.js';
import type {
  CadenceMinutes,
  PostureChoice,
  RiskLock,
  TeamForecast,
} from './analyst-decision.types.js';
import type { MarketReadings } from './analyst.types.js';

export type DetectNoDataParams = {
  readonly isWaitingForData: boolean;
  readonly isCatchingUp: boolean;
  readonly readings: MarketReadings;
};

// Etapa 1 (A10): o primeiro que falhar, nesta ordem. Sem a média de volume completa ou sem o ATR e os percentis, o
// analista não libera entrada.
export function detectNoData(params: DetectNoDataParams): NoDataDetail | null {
  const { readings } = params;
  if (params.isWaitingForData) return NO_DATA_DETAIL.WAITING_FOR_DATA;
  if (params.isCatchingUp) return NO_DATA_DETAIL.LATE_CANDLE;
  if (readings.relativeVolume === null) return NO_DATA_DETAIL.MISSING_CANDLES;
  const isWarmingUp =
    readings.atrRate === null ||
    readings.atrPercentile90 === null ||
    readings.atrPercentile95 === null;
  return isWarmingUp ? NO_DATA_DETAIL.WARMING_UP : null;
}

// Etapa 3 (A11): o volume relativo escolhe o ritmo; sem a leitura vale o ritmo base.
export function chooseCadence(relativeVolume: string | null): CadenceMinutes {
  const { cadenceMinutes } = ANALYST_RULES;
  if (relativeVolume === null) return cadenceMinutes.fast;
  const volume = decimalOf(relativeVolume);
  if (volume.lt(ANALYST_RULES.fourHourCadenceVolumeBelow)) return cadenceMinutes.fourHours;
  if (volume.lt(ANALYST_RULES.hourCadenceVolumeBelow)) return cadenceMinutes.hour;
  return cadenceMinutes.fast;
}

// Janela de entrada: a vela FECHA na hora cheia (ritmo de 1 h) ou no múltiplo de 4 h, UTC.
export function isOnCadence(params: {
  readonly candleTime: number;
  readonly cadenceMinutes: CadenceMinutes;
}): boolean {
  const closeTime = params.candleTime + CANDLE_MILLISECONDS;
  return closeTime % (params.cadenceMinutes * MILLISECONDS_PER_MINUTE) === 0;
}

export function resolveEntryGate(params: {
  readonly posture: Posture;
  readonly isOnCadence: boolean;
}): EntryGate {
  const isOpen = params.posture !== POSTURE.PAUSE && params.isOnCadence;
  return isOpen ? ENTRY_GATE.OPEN : ENTRY_GATE.CLOSED;
}

export type ChoosePostureParams = {
  readonly noData: NoDataDetail | null;
  readonly locks: readonly RiskLock[];
  readonly readings: MarketReadings;
  readonly forecast: TeamForecast;
};

function pauseFor(
  reason: PostureChoice['reason'],
  reasonDetail: PostureChoice['reasonDetail'] = null,
): PostureChoice {
  return { posture: POSTURE.PAUSE, reason, reasonDetail };
}

// Etapas 1 a 4 que fecham a porta: dado, a primeira trava ativa, mercado parado e equipe contra.
function findPause(params: ChoosePostureParams): PostureChoice | null {
  const { noData, locks, readings, forecast } = params;
  if (noData !== null) return pauseFor(ANALYST_REASON.NO_DATA, noData);
  const activeLock = locks.find((lock) => lock.isActive);
  if (activeLock !== undefined) return pauseFor(activeLock.key);
  const { relativeVolume } = readings;
  if (relativeVolume !== null && decimalOf(relativeVolume).lt(ANALYST_RULES.quietVolumeBelow)) {
    return pauseFor(ANALYST_REASON.QUIET_MARKET);
  }
  return forecast.side === FORECAST_SIDE.DOWN ? pauseFor(ANALYST_REASON.TEAM_AGAINST) : null;
}

function hasConfidentConditions(readings: MarketReadings): boolean {
  const { relativeVolume, atrRate, atrPercentile90 } = readings;
  if (relativeVolume === null || atrRate === null || atrPercentile90 === null) return false;
  return (
    decimalOf(relativeVolume).gte(ANALYST_RULES.confidentMinimumVolume) &&
    decimalOf(atrRate).lte(atrPercentile90)
  );
}

// Etapa 5 (A13): a favor firme com volume e oscilação dentro do comum é `confident` (o tamanho da estratégia); a favor
// fraca, ou firme sem as duas condições, é `normal` (metade); sem previsão é `caution` (um quarto).
function chooseOpenPosture(params: ChoosePostureParams): PostureChoice {
  const { forecast, readings } = params;
  if (forecast.side === null) {
    return {
      posture: POSTURE.CAUTION,
      reason: ANALYST_REASON.NO_FORECAST,
      reasonDetail: forecast.noForecastReason,
    };
  }
  if (forecast.strength === FORECAST_STRENGTH.WEAK) {
    return { posture: POSTURE.NORMAL, reason: ANALYST_REASON.WEAK_FORECAST, reasonDetail: null };
  }
  if (hasConfidentConditions(readings)) {
    return { posture: POSTURE.CONFIDENT, reason: ANALYST_REASON.FIRM_FORECAST, reasonDetail: null };
  }
  const { relativeVolume } = readings;
  const isLowVolume =
    relativeVolume === null || decimalOf(relativeVolume).lt(ANALYST_RULES.confidentMinimumVolume);
  return {
    posture: POSTURE.NORMAL,
    reason: ANALYST_REASON.FIRM_FORECAST_CAPPED,
    reasonDetail: isLowVolume ? CAPPED_DETAIL.LOW_VOLUME : CAPPED_DETAIL.HIGH_VOLATILITY,
  };
}

export function choosePosture(params: ChoosePostureParams): PostureChoice {
  return findPause(params) ?? chooseOpenPosture(params);
}

// O tamanho é uma fração do `riskPerTrade` da estratégia e nunca passa de 1 (RNF01).
export function riskScaleOf(posture: Posture): string {
  return ANALYST_RULES.riskScale[posture];
}
