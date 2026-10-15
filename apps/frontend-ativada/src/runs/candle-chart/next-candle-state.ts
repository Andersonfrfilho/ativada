// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { LiveCandleView } from '../../live/live-candle.js';
import { formatMomentSkippingToday } from '../../format/zoned-moment.js';
import { TIMEFRAME_PHRASE } from './candle-chart.constant.js';
import type { AvailableProjection, ProjectionCurrent } from './projections.validation.js';

export const NEXT_CANDLE_TEXT = {
  PRICE_STALLED: 'O preço ao vivo parou de chegar; a previsão volta quando ele voltar.',
  LOADING: 'Carregando a previsão…',
  ERROR: 'Não foi possível carregar a previsão; o gráfico e as operações continuam.',
  NO_FORECAST: 'Sem previsão agora',
  PROMISE_TITLE: 'Tendência, não promessa.',
  PROMISE_BODY:
    'Mostra para que lado o placar da estratégia está inclinado. O preço pode ir para o outro lado.',
} as const;

const MILLISECONDS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

export type UnavailableReason =
  'not_running' | 'no_candle' | 'warming_up' | 'neutral' | 'other_timeframe' | 'price_stalled';

export type NextCandleState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'unavailable'; readonly reason: UnavailableReason; readonly message: string }
  | { readonly kind: 'available'; readonly current: AvailableProjection };

export type JudgeNextCandleParams = {
  readonly isStrategyTimeframe: boolean;
  // A vela da execução, a única em que a estratégia decide.
  readonly runTimeframe: string;
  readonly projection: ProjectionCurrent | undefined;
  readonly isError: boolean;
  readonly live: LiveCandleView | undefined;
};

function otherTimeframeMessage(runTimeframe: string): string {
  const phrase = TIMEFRAME_PHRASE[runTimeframe] ?? runTimeframe;
  return `A estratégia decide em velas de ${phrase}; troque para ${runTimeframe} para ver a previsão.`;
}

// Por que o painel mostra (ou não) a tendência, nesta ordem (RF16): outra vela na tela, erro, carregando, preço parado, o
// motivo que o servidor deu e, só então, a tendência. Nunca uma faixa sem tendência por trás.
export function judgeNextCandle(params: JudgeNextCandleParams): NextCandleState {
  const { projection, live } = params;
  if (!params.isStrategyTimeframe) {
    const message = otherTimeframeMessage(params.runTimeframe);
    return { kind: 'unavailable', reason: 'other_timeframe', message };
  }
  if (projection === undefined) return { kind: params.isError ? 'error' : 'loading' };
  if (live?.status === 'no_data') {
    return {
      kind: 'unavailable',
      reason: 'price_stalled',
      message: NEXT_CANDLE_TEXT.PRICE_STALLED,
    };
  }
  if (projection.status === 'unavailable') {
    return { kind: 'unavailable', reason: projection.reason, message: projection.message };
  }
  return { kind: 'available', current: projection };
}

// "15 min", "2 h" ou "2 h 5 min": o que falta até o fechamento da vela, arredondado para cima.
export function formatRemaining(milliseconds: number): string {
  const minutes = Math.ceil(milliseconds / MILLISECONDS_PER_MINUTE);
  if (minutes < MINUTES_PER_HOUR) return `${minutes} min`;
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export type HorizonParams = {
  readonly now: number;
  readonly endsAt: number;
  readonly timeZone: string;
};

// "Próximos 15 min (até a decisão das 07:00)"; depois do fechamento, e antes de a próxima previsão chegar, "Fechando agora".
export function describeHorizon({ now, endsAt, timeZone }: HorizonParams): string {
  const moment = formatMomentSkippingToday(endsAt, { now, timeZone });
  if (endsAt <= now) return `Fechando agora (decisão das ${moment})`;
  return `Próximos ${formatRemaining(endsAt - now)} (até a decisão das ${moment})`;
}

export type PanelWindow = { readonly start: number; readonly end: number };

// O período da vela que está se formando: o servidor diz quando a previsão vale (`closedAt` a `horizonEndsAt`); sem
// previsão, é a vela do relógio (as velas abrem em múltiplos da duração, em UTC).
export function computePanelWindow(
  state: NextCandleState,
  durationMilliseconds: number,
  now: number,
): PanelWindow | undefined {
  if (durationMilliseconds <= 0) return undefined;
  if (state.kind === 'available') {
    return { start: state.current.closedAt, end: state.current.horizonEndsAt };
  }
  const start = Math.floor(now / durationMilliseconds) * durationMilliseconds;
  return { start, end: start + durationMilliseconds };
}

// Há o que desenhar quando o servidor respondeu (com ou sem tendência) e a vela da tela é a da execução.
export function isPanelDrawable(state: NextCandleState): boolean {
  if (state.kind === 'available') return true;
  return state.kind === 'unavailable' && state.reason !== 'other_timeframe';
}
