// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatEngineDecimal } from '@ativada/strategy-engine';

import {
  ANALYST_REASON,
  CAPPED_DETAIL,
  LOCK_KEY,
  LOCK_KEYS,
  NO_DATA_DETAIL,
  NO_FORECAST_REASON,
  POSTURE,
} from './analyst.constant.js';
import {
  CADENCE_LABEL,
  FIRM_CAPPED_HIGH_VOLATILITY_MESSAGE,
  FIRM_CAPPED_LOW_VOLUME_MESSAGE,
  FIRM_FORECAST_MESSAGE,
  GOAL_ROOM_NOT_APPLICABLE_LINE,
  LOSS_STREAK_LIMIT_TEXT,
  MISSING_VALUE,
  NO_DATA_MESSAGE,
  NO_GOAL_MESSAGE,
  NO_PROVEN_SPECIALIST_MESSAGE,
  OFF_CADENCE_MESSAGE,
  PAUSE_LINE,
  POSTURE_LABEL,
  PROVEN_NEUTRAL_MESSAGE,
  RISK_FRACTION_LABEL,
  SPLIT_TEAM_MESSAGE,
  TEAM_AGAINST_MESSAGE,
  TRADE_COUNT_LIMIT_TEXT,
  WEAK_FORECAST_MESSAGE,
} from './analyst-messages.constant.js';
import { decimalOf } from './analyst-decimal.js';
import type { AnalystDecision, RiskLock } from './analyst-decision.types.js';
import {
  formatSignedTextPercent,
  formatTextNumber,
  formatTextPercent,
  TEXT_ROUNDING,
} from './analyst-message-format.js';

const { UP, DOWN } = TEXT_ROUNDING;

function lockOf(decision: AnalystDecision, key: RiskLock['key']): RiskLock {
  const lock = decision.locks.find((candidate) => candidate.key === key);
  if (lock === undefined) throw new RangeError(`Decisão sem a trava ${key}.`);
  return lock;
}

function textOrDash(value: string | null, format: (text: string) => string): string {
  return value === null ? MISSING_VALUE : format(value);
}

// "Postura agora: …" (A17); em pausa, a frase própria. O tamanho em % do saldo arredonda para CIMA (mostra o risco inteiro).
export function buildPostureLine(decision: AnalystDecision, riskPerTrade: string): string {
  if (decision.posture === POSTURE.PAUSE) return PAUSE_LINE;
  const riskRate = formatEngineDecimal(decimalOf(riskPerTrade).times(decision.riskScale));
  const fraction = RISK_FRACTION_LABEL[decision.riskScale] ?? MISSING_VALUE;
  return [
    `Postura agora: ${POSTURE_LABEL[decision.posture]}`,
    `olha o mercado a cada ${CADENCE_LABEL[decision.cadenceMinutes]}`,
    `teto de risco da entrada nesta vela: ${fraction} do que a estratégia arriscaria (${formatTextPercent(riskRate, UP)}% do saldo por operação)`,
    `cada operação dura no máximo ${decision.maxTradeMinutes} min.`,
  ].join(' · ');
}

// Vela fora da janela de entrada do ritmo de 1 h ou 4 h; `null` quando a vela pode abrir operação ou a postura é pausa.
export function buildOffCadenceMessage(decision: AnalystDecision): string | null {
  if (decision.posture === POSTURE.PAUSE || decision.isOnCadence) return null;
  return OFF_CADENCE_MESSAGE[String(decision.cadenceMinutes)] ?? null;
}

export function buildCadenceLine(decision: AnalystDecision): string | null {
  const { relativeVolume } = decision.readings;
  if (relativeVolume === null) return null;
  const volume = formatTextNumber(relativeVolume, DOWN);
  return `Volume ${volume}× o normal das últimas 24 horas: olha o mercado a cada ${CADENCE_LABEL[decision.cadenceMinutes]}.`;
}

export function lockMessage(decision: AnalystDecision, key: RiskLock['key']): string {
  const { current } = lockOf(decision, key);
  const { atrRate, roundTripCost } = decision.readings;
  switch (key) {
    case LOCK_KEY.DAILY_LOSS:
      return `A perda das últimas 24 horas chegou a ${textOrDash(current, (v) => formatTextPercent(v, UP))}% do saldo inicial (o limite é 1%): pausa até a janela de 24 horas liberar.`;
    case LOCK_KEY.LOSS_STREAK:
      return `${current ?? MISSING_VALUE} operações seguidas terminaram em perda: pausa de 1 hora depois da última.`;
    case LOCK_KEY.TRADE_COUNT:
      return `Já foram ${current ?? MISSING_VALUE} operações nas últimas 24 horas (o teto é ${TRADE_COUNT_LIMIT_TEXT}): pausa até a janela liberar.`;
    case LOCK_KEY.GOAL_ROOM:
      return `Falta pouco para a perda máxima da meta: cabem ${textOrDash(current, (v) => formatTextPercent(v, DOWN))}% do saldo, menos que o risco de 2 operações.`;
    case LOCK_KEY.MOVE_COST:
      return `O movimento típico de 15 min (${textOrDash(atrRate, (v) => formatTextPercent(v, DOWN))}%) não paga com folga a ida e volta das taxas (${formatTextPercent(roundTripCost, UP)}%): precisa ser pelo menos o dobro.`;
  }
}

function noForecastMessage(decision: AnalystDecision): string {
  const { atrRate } = decision.readings;
  switch (decision.reasonDetail) {
    case NO_FORECAST_REASON.TOO_VOLATILE:
      return `Mercado agitado demais para ler: a oscilação (${textOrDash(atrRate, (v) => formatTextPercent(v, UP))}%) está acima de 95% das velas dos últimos 30 dias. Sem previsão.`;
    case NO_FORECAST_REASON.PROVEN_NEUTRAL:
      return PROVEN_NEUTRAL_MESSAGE;
    case NO_FORECAST_REASON.SPLIT_TEAM:
      return SPLIT_TEAM_MESSAGE;
    default:
      return NO_PROVEN_SPECIALIST_MESSAGE;
  }
}

function openPostureMessage(decision: AnalystDecision): string {
  switch (decision.reason) {
    case ANALYST_REASON.WEAK_FORECAST:
      return WEAK_FORECAST_MESSAGE;
    case ANALYST_REASON.FIRM_FORECAST:
      return FIRM_FORECAST_MESSAGE;
    case ANALYST_REASON.FIRM_FORECAST_CAPPED:
      return decision.reasonDetail === CAPPED_DETAIL.LOW_VOLUME
        ? FIRM_CAPPED_LOW_VOLUME_MESSAGE
        : FIRM_CAPPED_HIGH_VOLATILITY_MESSAGE;
    default:
      return noForecastMessage(decision);
  }
}

function noDataMessage(decision: AnalystDecision): string {
  const detail = Object.values(NO_DATA_DETAIL).find(
    (candidate) => candidate === decision.reasonDetail,
  );
  if (detail === undefined) throw new RangeError('Pausa por falta de dado sem o detalhe.');
  return NO_DATA_MESSAGE[detail];
}

function lockMessageOf(decision: AnalystDecision): string {
  const key = LOCK_KEYS.find((candidate) => candidate === decision.reason);
  if (key === undefined) throw new RangeError(`Pausa sem a trava: ${decision.reason}.`);
  return lockMessage(decision, key);
}

function pauseMessage(decision: AnalystDecision): string {
  const { relativeVolume } = decision.readings;
  switch (decision.reason) {
    case ANALYST_REASON.NO_DATA:
      return noDataMessage(decision);
    case ANALYST_REASON.QUIET_MARKET:
      return `Mercado parado: o volume está em ${textOrDash(relativeVolume, (v) => formatTextNumber(v, DOWN))}× o normal das últimas 24 horas (abaixo de 0,4×).`;
    case ANALYST_REASON.TEAM_AGAINST:
      return TEAM_AGAINST_MESSAGE;
    default:
      return lockMessageOf(decision);
  }
}

// A frase do motivo da postura (A17): a trava, o dado que faltou, o mercado parado ou a leitura da equipe.
export function buildReasonMessage(decision: AnalystDecision): string {
  return decision.posture === POSTURE.PAUSE ? pauseMessage(decision) : openPostureMessage(decision);
}

// As cinco linhas das travas, na ordem da A10.
export function buildLockLines(decision: AnalystDecision): readonly string[] {
  const dailyLoss = lockOf(decision, LOCK_KEY.DAILY_LOSS);
  const streak = lockOf(decision, LOCK_KEY.LOSS_STREAK);
  const trades = lockOf(decision, LOCK_KEY.TRADE_COUNT);
  const room = lockOf(decision, LOCK_KEY.GOAL_ROOM);
  const move = lockOf(decision, LOCK_KEY.MOVE_COST);
  return [
    `Perda das últimas 24 h: ${textOrDash(dailyLoss.current, (v) => formatTextPercent(v, UP))}% de 1% permitido`,
    `Perdas seguidas: ${streak.current ?? MISSING_VALUE} de ${LOSS_STREAK_LIMIT_TEXT}`,
    `Operações nas últimas 24 h: ${trades.current ?? MISSING_VALUE} de ${TRADE_COUNT_LIMIT_TEXT}`,
    room.isApplicable
      ? `Folga até a perda máxima da meta: ${textOrDash(room.current, (v) => formatTextPercent(v, DOWN))}% (mínimo: ${formatTextPercent(room.limit, UP)}%)`
      : GOAL_ROOM_NOT_APPLICABLE_LINE,
    `Movimento ÷ custo: ${textOrDash(move.current, (v) => formatTextNumber(v, DOWN))} (mínimo: ${move.limit})`,
  ];
}

// Saída por tempo: em sombra o analista "mandaria" sair.
export function buildTimeExitMessage(params: {
  readonly maxTradeMinutes: number;
  readonly isShadow: boolean;
}): string {
  const verb = params.isShadow ? 'mandaria' : 'manda';
  return `A operação aberta completou ${params.maxTradeMinutes} min sem alvo nem stop: o analista ${verb} sair na abertura da próxima vela.`;
}

export type GoalProgressMessageParams = {
  readonly targetRate: string;
  readonly summedRate: string;
  readonly remainingRate: string;
  readonly trades: number;
};

// Meta somada (D8): o ganho de cada operação soma no saldo. O somado desce e o que falta sobe (contra o usuário).
export function buildGoalProgressMessage(params: GoalProgressMessageParams | null): string {
  if (params === null) return NO_GOAL_MESSAGE;
  const noun = params.trades === 1 ? 'operação' : 'operações';
  return [
    `Meta: +${formatTextPercent(params.targetRate, UP)}% no prazo.`,
    `Somado até aqui: ${formatSignedTextPercent(params.summedRate, DOWN)}% em ${params.trades} ${noun}.`,
    `Falta ${formatTextPercent(params.remainingRate, UP)}%.`,
  ].join(' ');
}
