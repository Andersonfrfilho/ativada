// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatSymbol } from '../../../format/format.js';
import { formatTimeInZone } from '../../../format/zoned-time.js';
import { formatPriceAtTick } from '../../../notices/symbol-filters.js';
import type { LiveStatus } from '../../live-tracking/live-status.validation.js';
import { OFFICE_TEXT } from './office.constant.js';

const SCREEN_WIDTH = 400;
const SCREEN_HEIGHT = 110;
const SCREEN_MARGIN = 8;
const FULL_TURN = 360;
const HOURS_ON_CLOCK = 12;
const MINUTES_PER_HOUR = 60;
const CLOCK_TEXT = /^(\d{2}):(\d{2})$/;

export type ClockModel = {
  readonly text: string;
  readonly caption: string;
  readonly hourAngle: number;
  readonly minuteAngle: number;
};

export type LevelMark = {
  readonly key: 'entry' | 'target' | 'stop';
  readonly label: string;
  readonly priceText: string;
  // Posição vertical no telão (só desenho); `undefined` quando o nível cai fora da faixa desenhada.
  readonly y: number | undefined;
};

export type ScreenModel = {
  readonly title: string;
  readonly caption: string;
  readonly points: string;
  readonly levels: readonly LevelMark[];
};

// O relógio da parede: a hora do próximo fechamento, no fuso do usuário (a mesma frase da varanda).
export function buildClock(status: LiveStatus, timeZone: string): ClockModel {
  const { nextDecisionAt, timeframe } = status.run;
  const caption = `vela de ${timeframe}`;
  if (nextDecisionAt === null) return { text: '--:--', caption, hourAngle: 0, minuteAngle: 0 };
  const text = formatTimeInZone(nextDecisionAt, timeZone);
  const match = CLOCK_TEXT.exec(text);
  const hours = Number(match?.[1] ?? 0);
  const minutes = Number(match?.[2] ?? 0);
  return {
    text,
    caption,
    minuteAngle: (minutes / MINUTES_PER_HOUR) * FULL_TURN,
    hourAngle:
      (((hours % HOURS_ON_CLOCK) + minutes / MINUTES_PER_HOUR) / HOURS_ON_CLOCK) * FULL_TURN,
  };
}

type Scale = { readonly low: number; readonly high: number };

function scaleOf(values: readonly number[]): Scale {
  const low = Math.min(...values);
  const high = Math.max(...values);
  return high === low ? { low: low - 1, high: high + 1 } : { low, high };
}

function yOf(value: number, scale: Scale): number {
  const span = SCREEN_HEIGHT - SCREEN_MARGIN * 2;
  return SCREEN_MARGIN + (1 - (value - scale.low) / (scale.high - scale.low)) * span;
}

function levelsOf(status: LiveStatus, scale: Scale): readonly LevelMark[] {
  const position = status.openPosition;
  if (position === null) return [];
  const { symbol } = status.run;
  const marks = [
    { key: 'entry', label: OFFICE_TEXT.ENTRY, text: position.entryPrice },
    { key: 'target', label: OFFICE_TEXT.TARGET, text: position.targetPrice },
    { key: 'stop', label: OFFICE_TEXT.PROTECTION, text: position.stopPrice },
  ] as const;
  return marks.map((mark) => {
    const value = Number(mark.text);
    const isInside = value >= scale.low && value <= scale.high;
    return {
      key: mark.key,
      label: mark.label,
      priceText: formatPriceAtTick(symbol, mark.text),
      y: isInside ? yOf(value, scale) : undefined,
    };
  });
}

// O telão da parede: os fechamentos que o servidor mandou (as decisões mais novas, da mais antiga à mais nova) e os níveis
// da operação aberta. O gráfico completo continua sendo o cartão "Preço e operações" (o monitor da sala).
export function buildScreen(status: LiveStatus, closes: readonly string[]): ScreenModel {
  const values = closes.map(Number).filter((value) => Number.isFinite(value));
  const levelValues =
    status.openPosition === null
      ? []
      : [status.openPosition.targetPrice, status.openPosition.stopPrice].map(Number);
  const scale = values.length === 0 ? { low: 0, high: 1 } : scaleOf([...values, ...levelValues]);
  const step = values.length < 2 ? 0 : (SCREEN_WIDTH - SCREEN_MARGIN * 2) / (values.length - 1);
  const points = values
    .map(
      (value, index) =>
        `${(SCREEN_MARGIN + index * step).toFixed(1)},${yOf(value, scale).toFixed(1)}`,
    )
    .join(' ');
  const { symbol, timeframe } = status.run;
  return {
    title: `${formatSymbol(symbol)} · ${timeframe} · simulação`,
    caption: OFFICE_TEXT.SCREEN_CHART_NOTE,
    points,
    levels: levelsOf(status, scale),
  };
}

export type LockCount = {
  readonly active: number;
  readonly total: number;
  // Uma entrada por trava, na ordem do servidor: ligada ou livre (o cadeado fecha em âmbar nas ligadas).
  readonly flags: readonly boolean[];
};

export type BoardModel = {
  readonly signal: string;
  readonly locks: LockCount | undefined;
  readonly goal: string | undefined;
};

export type BoardInput = {
  // A palavra do que a simulação fez na vela ("Esperou", "Comprou") e a pontuação, ambas do servidor.
  readonly signalWord: string;
  readonly scoreText: string;
  readonly locks:
    readonly { readonly isActive: boolean; readonly isApplicable: boolean }[] | undefined;
  readonly goal: string | undefined;
};

export function buildBoard(input: BoardInput): BoardModel {
  const { signalWord, scoreText, locks, goal } = input;
  return {
    signal: `${signalWord} · pontuação ${scoreText}`,
    locks:
      locks === undefined
        ? undefined
        : {
            active: locks.filter((lock) => lock.isActive).length,
            total: locks.length,
            flags: locks.map((lock) => lock.isActive),
          },
    goal,
  };
}
