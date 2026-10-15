// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatScaled, parseScaled, roundScaledDirected } from '../../format/decimal.js';
import { formatDayInZone, formatTimeInZone } from '../../format/zoned-time.js';
import type { RoundingDirection } from '../directed-money.js';
import type { LiveGoal, LiveStatus } from './live-status.validation.js';

const MILLISECONDS_PER_MINUTE = 60_000;
const MILLISECONDS_PER_HOUR = 3_600_000;
const MILLISECONDS_PER_DAY = 86_400_000;
const FULL = 100n;
const ZERO = 0n;
const CENTS = 2;
const DAY_AND_MONTH_LENGTH = 5;

export type GoalMeters = {
  readonly gain: bigint;
  readonly targetGain: bigint;
  readonly gainPercent: number;
  readonly loss: bigint;
  readonly maxLoss: bigint;
  readonly lossPercent: number;
  readonly elapsedMilliseconds: number;
  readonly totalMilliseconds: number;
  readonly timePercent: number;
  readonly expectedGain: bigint;
  readonly isBehindPace: boolean;
};

export type GoalMeterParams = {
  readonly goal: LiveGoal;
  readonly balance: LiveStatus['balance'];
  readonly periodStart: number;
  readonly now: number;
};

function floorDivide(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  return numerator % denominator !== ZERO && numerator < ZERO ? quotient - 1n : quotient;
}

function ceilDivide(numerator: bigint, denominator: bigint): bigint {
  return -floorDivide(-numerator, denominator);
}

function clampPercent(percent: bigint): number {
  if (percent < ZERO) return 0;
  return percent > FULL ? Number(FULL) : Number(percent);
}

function percentOf(part: bigint, whole: bigint, direction: RoundingDirection): number {
  if (whole <= ZERO) return 0;
  const ratio = part * FULL;
  return clampPercent(direction === 'down' ? floorDivide(ratio, whole) : ceilDivide(ratio, whole));
}

type Scaled = {
  readonly initial: bigint;
  readonly current: bigint;
  readonly target: bigint;
  readonly floor: bigint;
};

function readScaled(params: GoalMeterParams): Scaled | undefined {
  const initial = parseScaled(params.balance.initial);
  const current = parseScaled(params.balance.current);
  const target = parseScaled(params.goal.targetAmount);
  const floor = parseScaled(params.goal.floorAmount);
  if (initial === undefined || current === undefined) return undefined;
  if (target === undefined || floor === undefined) return undefined;
  return { initial, current, target, floor };
}

// Ganho, perda e tempo da meta em BigInt: ganho e tempo arredondam para baixo, a perda para cima (contra o usuário).
export function computeGoalMeters(params: GoalMeterParams): GoalMeters | undefined {
  const scaled = readScaled(params);
  if (scaled === undefined) return undefined;
  const total = Math.max(1, params.goal.deadlineAt - params.periodStart);
  const elapsed = Math.min(total, Math.max(0, params.now - params.periodStart));
  const targetGain = scaled.target - scaled.initial;
  const gain = scaled.current > scaled.initial ? scaled.current - scaled.initial : ZERO;
  const maxLoss = scaled.initial - scaled.floor;
  const loss = scaled.initial > scaled.current ? scaled.initial - scaled.current : ZERO;
  const expectedGain = ceilDivide(targetGain * BigInt(elapsed), BigInt(total));
  return {
    gain,
    targetGain,
    gainPercent: percentOf(gain, targetGain, 'down'),
    loss,
    maxLoss,
    lossPercent: percentOf(loss, maxLoss, 'up'),
    elapsedMilliseconds: elapsed,
    totalMilliseconds: total,
    timePercent: percentOf(BigInt(elapsed), BigInt(total), 'down'),
    expectedGain,
    isBehindPace: scaled.current - scaled.initial < expectedGain,
  };
}

// '300,00 USDT' de um valor escalado, na direção que o campo tem no servidor.
export function formatScaledUsdt(value: bigint, direction: RoundingDirection): string {
  return `${formatScaled(roundScaledDirected(value, CENTS, direction))} USDT`;
}

// A taxa (0.03) como porcentagem sem casas inúteis: "3", "2,5".
export function formatRatePercent(rate: string): string {
  const scaled = parseScaled(rate);
  if (scaled === undefined) return '—';
  return formatScaled(scaled * FULL, { minimumFraction: 0, maximumFraction: CENTS });
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

// "16 h", "30 min" ou "2 dias e 4 h": a duração em palavras curtas.
export function formatDuration(milliseconds: number): string {
  const days = Math.floor(milliseconds / MILLISECONDS_PER_DAY);
  const hours = Math.floor((milliseconds % MILLISECONDS_PER_DAY) / MILLISECONDS_PER_HOUR);
  if (days > 0) {
    const dayText = pluralize(days, 'dia', 'dias');
    return hours > 0 ? `${dayText} e ${hours} h` : dayText;
  }
  if (hours > 0) return `${hours} h`;
  return `${Math.floor(milliseconds / MILLISECONDS_PER_MINUTE)} min`;
}

// "20/10 às 18:37" no fuso do usuário.
export function formatDayAndTime(at: number, timeZone: string): string {
  const day = formatDayInZone(at, timeZone).slice(0, DAY_AND_MONTH_LENGTH);
  return `${day} às ${formatTimeInZone(at, timeZone)}`;
}

export type RemainingContext = { readonly now: number; readonly timeZone: string };

// "faltam 6 dias e 8 horas", "termina hoje às 15:00" ou "prazo encerrado" (o relógio é o do navegador).
export function describeRemaining(deadlineAt: number, context: RemainingContext): string {
  const remaining = deadlineAt - context.now;
  if (remaining <= 0) return 'prazo encerrado';
  const { timeZone, now } = context;
  if (formatDayInZone(deadlineAt, timeZone) === formatDayInZone(now, timeZone)) {
    return `termina hoje às ${formatTimeInZone(deadlineAt, timeZone)}`;
  }
  const days = Math.floor(remaining / MILLISECONDS_PER_DAY);
  const hours = Math.floor((remaining % MILLISECONDS_PER_DAY) / MILLISECONDS_PER_HOUR);
  if (days === 0) {
    const minutes = Math.floor((remaining % MILLISECONDS_PER_HOUR) / MILLISECONDS_PER_MINUTE);
    return `faltam ${pluralize(hours, 'hora', 'horas')} e ${pluralize(minutes, 'minuto', 'minutos')}`;
  }
  const dayText = pluralize(days, 'dia', 'dias');
  return hours > 0
    ? `faltam ${dayText} e ${pluralize(hours, 'hora', 'horas')}`
    : `faltam ${dayText}`;
}

// O prazo é `periodStart + dias × 86.400.000` (ADR 0002, L8): os dias saem da conta inversa.
export function horizonDaysOf(goal: LiveGoal, periodStart: number): number {
  return Math.max(1, Math.round((goal.deadlineAt - periodStart) / MILLISECONDS_PER_DAY));
}
