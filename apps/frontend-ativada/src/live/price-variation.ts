// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatScaled, parseScaled } from '../format/decimal.js';
import type { HistoricTick } from './tick-history.js';

const MILLISECONDS_PER_MINUTE = 60_000;
const HUNDREDTHS_PER_UNIT = 10_000n;
// Centésimos de ponto percentual → porcentagem na escala de 8 casas do navegador.
const HUNDREDTHS_TO_SCALED_PERCENT = 1_000_000n;
const ZERO = 0n;
const TICK_TOLERANCE_MILLISECONDS = 15_000;
// A vela de referência pode estar até meia vela (7,5 min) longe do instante pedido.
const CANDLE_TOLERANCE_MILLISECONDS = 450_000;

export const VARIATION_WINDOWS = [
  { key: '1m', label: '1 min', words: '1 minuto', minutes: 1, canUseCandles: false },
  { key: '5m', label: '5 min', words: '5 minutos', minutes: 5, canUseCandles: false },
  { key: '15m', label: '15 min', words: '15 minutos', minutes: 15, canUseCandles: false },
  { key: '1h', label: '1 h', words: '1 hora', minutes: 60, canUseCandles: true },
  { key: '4h', label: '4 h', words: '4 horas', minutes: 240, canUseCandles: true },
  { key: '24h', label: '24 h', words: '24 horas', minutes: 1_440, canUseCandles: true },
] as const;

export type VariationWindow = (typeof VARIATION_WINDOWS)[number];

export type VariationDirection = 'up' | 'down' | 'flat';

// `hundredths` = variação em centésimos de ponto percentual, truncada para zero (1234 = +12,34%); `undefined` = sem dado.
export type WindowVariation = {
  readonly window: VariationWindow;
  readonly hundredths: bigint | undefined;
  readonly reason: string | undefined;
};

export type VariationCandle = { readonly closeTime: number; readonly close: string };

export type ComputeVariationsParams = {
  readonly now: number;
  // O preço ao vivo em dia deste par, ou `undefined` quando o tick está mudo/fora.
  readonly livePrice: string | undefined;
  readonly tickAtOrBefore: (limit: number) => HistoricTick | undefined;
  readonly candles: readonly VariationCandle[];
};

export const VARIATION_REASON = {
  NO_LIVE_PRICE: 'Sem preço ao vivo agora.',
  SHORT_HISTORY:
    'Ainda sem histórico suficiente: o painel guarda os preços ao vivo desde que foi aberto.',
  NO_CANDLES: 'Sem velas gravadas para este período.',
  INVALID_PRICE: 'Preço de referência inválido.',
} as const;

// (atual − referência) ÷ referência, em centésimos de ponto percentual; a divisão de BigInt trunca para zero.
export function computeVariationHundredths(current: string, reference: string): bigint | undefined {
  const now = parseScaled(current);
  const before = parseScaled(reference);
  if (now === undefined || before === undefined || before <= ZERO) return undefined;
  return ((now - before) * HUNDREDTHS_PER_UNIT) / before;
}

export function directionOf(hundredths: bigint): VariationDirection {
  if (hundredths > ZERO) return 'up';
  return hundredths < ZERO ? 'down' : 'flat';
}

function formatMagnitude(hundredths: bigint): string {
  const magnitude = hundredths < ZERO ? -hundredths : hundredths;
  return `${formatScaled(magnitude * HUNDREDTHS_TO_SCALED_PERCENT)}%`;
}

// "+0,12%", "−1,50%"; zero exato não tem sinal.
export function formatVariation(hundredths: bigint): string {
  const direction = directionOf(hundredths);
  if (direction === 'flat') return formatMagnitude(hundredths);
  return `${direction === 'up' ? '+' : '−'}${formatMagnitude(hundredths)}`;
}

export function describeVariation(variation: WindowVariation): string {
  const { hundredths, window } = variation;
  if (hundredths === undefined) {
    return `Variação em ${window.words} indisponível. ${variation.reason ?? ''}`.trim();
  }
  const direction = directionOf(hundredths);
  if (direction === 'flat') return `não variou em ${window.words}`;
  const verb = direction === 'up' ? 'subiu' : 'caiu';
  return `${verb} ${formatMagnitude(hundredths)} em ${window.words}`;
}

function fromTicks(params: ComputeVariationsParams, window: VariationWindow): bigint | undefined {
  const { livePrice } = params;
  if (livePrice === undefined) return undefined;
  const target = params.now - window.minutes * MILLISECONDS_PER_MINUTE;
  const tick = params.tickAtOrBefore(target);
  if (tick === undefined || target - tick.time > TICK_TOLERANCE_MILLISECONDS) return undefined;
  return computeVariationHundredths(livePrice, tick.price);
}

function nearestCandle(
  candles: readonly VariationCandle[],
  target: number,
): VariationCandle | undefined {
  let best: VariationCandle | undefined;
  for (const candle of candles) {
    const isCloser =
      best === undefined || Math.abs(candle.closeTime - target) < Math.abs(best.closeTime - target);
    if (isCloser) best = candle;
  }
  const isNear =
    best !== undefined && Math.abs(best.closeTime - target) <= CANDLE_TOLERANCE_MILLISECONDS;
  return isNear ? best : undefined;
}

// Sem preço ao vivo a janela parte do fechamento da última vela, não do relógio.
function fromCandles(params: ComputeVariationsParams, window: VariationWindow): bigint | undefined {
  const last = params.candles.at(-1);
  if (last === undefined) return undefined;
  const anchor = params.livePrice === undefined ? last.closeTime : params.now;
  const current = params.livePrice ?? last.close;
  const reference = nearestCandle(
    params.candles,
    anchor - window.minutes * MILLISECONDS_PER_MINUTE,
  );
  if (reference === undefined || reference === last) return undefined;
  return computeVariationHundredths(current, reference.close);
}

function missingReason(params: ComputeVariationsParams, window: VariationWindow): string {
  if (window.canUseCandles) return VARIATION_REASON.NO_CANDLES;
  return params.livePrice === undefined
    ? VARIATION_REASON.NO_LIVE_PRICE
    : VARIATION_REASON.SHORT_HISTORY;
}

export function computeVariations(params: ComputeVariationsParams): readonly WindowVariation[] {
  return VARIATION_WINDOWS.map((window) => {
    const hundredths =
      fromTicks(params, window) ?? (window.canUseCandles ? fromCandles(params, window) : undefined);
    const reason = hundredths === undefined ? missingReason(params, window) : undefined;
    return { window, hundredths, reason };
  });
}
