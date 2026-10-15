// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { FormingCandle } from './candle-store.js';
import { STREAM_STATUS, type StreamStatus } from './stream.constant.js';
import type { StreamCandle } from './stream.validation.js';

const MILLISECONDS_PER_SECOND = 1_000;

// O que a tela faz com a vela em formação: desenha (`forming`) ou diz que o preço parou (`no_data`). Sem vela conhecida, nada.
export type LiveCandleView =
  | { readonly status: 'forming'; readonly candle: StreamCandle }
  | { readonly status: 'no_data'; readonly secondsWithoutData: number };

export type JudgeLiveCandleParams = {
  readonly stored: FormingCandle | undefined;
  readonly streamStatus: StreamStatus;
  readonly now: number;
  readonly silenceMilliseconds: number;
};

// Como o preço (RF16): sem mensagem da vela há mais que o limite, ou com o socket fora do ar, a vela em formação some e
// a tela diz "sem dados". A simulação parada (ou a corretora muda) cai aqui sem ninguém avisar.
export function judgeLiveCandle(params: JudgeLiveCandleParams): LiveCandleView | undefined {
  const { stored, streamStatus, now, silenceMilliseconds } = params;
  if (stored === undefined) return undefined;
  const silence = now - stored.receivedAt;
  if (streamStatus === STREAM_STATUS.LIVE && silence <= silenceMilliseconds) {
    return { status: 'forming', candle: stored.candle };
  }
  return {
    status: 'no_data',
    secondsWithoutData: Math.max(0, Math.floor(silence / MILLISECONDS_PER_SECOND)),
  };
}
