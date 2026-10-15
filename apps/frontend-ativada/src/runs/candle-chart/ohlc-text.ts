// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  DECIMAL_SCALE,
  divideFloor,
  formatDecimalText,
  formatScaled,
  formatSignedPercentDown,
  parseScaled,
  roundRateDownToPercent,
  roundScaledDirected,
} from '../../format/decimal.js';
import { formatDayInZone, formatInZone, formatTimeInZone } from '../../format/zoned-time.js';
import type { CandleWithVolume } from './market-candles.validation.js';

export type OhlcInput = {
  readonly candle: CandleWithVolume;
  // Fechamento da vela anterior (texto decimal) para a variação; sem ele a variação não aparece.
  readonly previousClose: string | undefined;
  readonly symbol: string;
  readonly timeframe: string;
  readonly timeZone: string;
  readonly isForming: boolean;
};

export type OhlcDirection = 'up' | 'down' | 'flat';

export type OhlcText = {
  readonly title: string;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
  readonly change: string | undefined;
  readonly direction: OhlcDirection | undefined;
  readonly volume: string;
  readonly isForming: boolean;
};

const MIN_PRICE_DIGITS = 2;
const PERCENT_PLACES = 2;
const COMPACT_PLACES = 1;
const SCALE_UNIT = 10n ** BigInt(DECIMAL_SCALE);
const VOLUME_STEPS = [
  { divisor: 1_000_000_000n * SCALE_UNIT, suffix: ' bi' },
  { divisor: 1_000_000n * SCALE_UNIT, suffix: ' mi' },
  { divisor: 1_000n * SCALE_UNIT, suffix: ' mil' },
] as const;
const DAY_TEXT_LENGTH = 5;
const ZERO = 0n;

function fractionDigits(text: string): number {
  const fraction = text.split('.')[1] ?? '';
  return fraction.replace(/0+$/, '').length;
}

// Todas as casas da legenda usam a mesma quantidade (a maior entre os quatro preços), como na corretora.
function formatPrices(values: readonly string[]): string[] {
  const digits = Math.max(MIN_PRICE_DIGITS, ...values.map(fractionDigits));
  return values.map((value) =>
    formatDecimalText(value, { minimumFraction: digits, maximumFraction: digits }),
  );
}

function formatVolume(volume: string): string {
  const scaled = parseScaled(volume);
  if (scaled === undefined) return '—';
  for (const step of VOLUME_STEPS) {
    const quotient = scaled >= step.divisor ? divideFloor(scaled, step.divisor) : undefined;
    if (quotient === undefined) continue;
    const text = formatScaled(roundScaledDirected(quotient, COMPACT_PLACES, 'down'), {
      minimumFraction: COMPACT_PLACES,
      maximumFraction: COMPACT_PLACES,
    });
    return `${text}${step.suffix}`;
  }
  const rounded = roundScaledDirected(scaled, PERCENT_PLACES, 'down');
  return formatScaled(rounded, { minimumFraction: 0, maximumFraction: PERCENT_PLACES });
}

type Change = { readonly text: string; readonly direction: OhlcDirection };

// A direção sai do valor que aparece (já arredondado): "0,00%" é igual, nunca alta ou queda.
function directionOf(shownPercent: bigint): OhlcDirection {
  if (shownPercent > ZERO) return 'up';
  return shownPercent < ZERO ? 'down' : 'flat';
}

// Variação sobre o fechamento anterior, em BigInt e arredondada para baixo como o resto do painel.
function computeChange(close: string, previousClose: string | undefined): Change | undefined {
  const current = parseScaled(close);
  const previous = previousClose === undefined ? undefined : parseScaled(previousClose);
  if (current === undefined || previous === undefined) return undefined;
  const rate = divideFloor(current - previous, previous);
  if (rate === undefined) return undefined;
  const shown = roundRateDownToPercent(rate);
  return { text: formatSignedPercentDown(rate), direction: directionOf(shown) };
}

// A legenda do topo (RF03): par, vela, data e hora no fuso do usuário, A/M/m/F, variação e volume.
export function buildOhlcText(input: OhlcInput): OhlcText {
  const { candle } = input;
  const [open = '—', high = '—', low = '—', close = '—'] = formatPrices([
    candle.open,
    candle.high,
    candle.low,
    candle.close,
  ]);
  const change = computeChange(candle.close, input.previousClose);
  return {
    title: `${input.symbol} · ${input.timeframe} · ${formatInZone(candle.openTime, input.timeZone)}`,
    open,
    high,
    low,
    close,
    change: change?.text,
    direction: change?.direction,
    volume: formatVolume(candle.volume),
    isForming: input.isForming,
  };
}

export type AnnouncementInput = OhlcInput & {
  // "compra" ou "venda" quando a vela tem uma operação; senão `undefined`.
  readonly eventLabel: string | undefined;
};

// A frase do `aria-live` (RF20): "14/10 às 06:00: abertura 12,930, máxima …, fechamento …; compra".
export function describeCandleForSpeech(input: AnnouncementInput): string {
  const text = buildOhlcText(input);
  const day = formatDayInZone(input.candle.openTime, input.timeZone).slice(0, DAY_TEXT_LENGTH);
  const time = formatTimeInZone(input.candle.openTime, input.timeZone);
  const values = [
    `abertura ${text.open}`,
    `máxima ${text.high}`,
    `mínima ${text.low}`,
    `fechamento ${text.close}`,
  ];
  if (text.change !== undefined) values.push(`variação ${text.change}`);
  const extras = [input.isForming ? 'vela em formação' : undefined, input.eventLabel];
  const notes = extras.filter((note) => note !== undefined);
  return [`${day} às ${time}: ${values.join(', ')}`, ...notes].join('; ');
}
