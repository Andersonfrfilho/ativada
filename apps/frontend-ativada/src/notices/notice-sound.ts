// Copyright (c) 2026 Ada Technology. All rights reserved.
import { NOTICE_KIND, NOTICE_STATE } from './notice.constant.js';
import type { Notice } from './notice.validation.js';

const TONE_SECONDS = 0.12;
const TONE_GAP_SECONDS = 0.1;
const TONE_VOLUME = 0.08;
const BUY_TONES = [523, 659] as const;
const SELL_TONES = [659, 523] as const;
const NEUTRAL_TONES = [587] as const;

type AudioContextConstructor = new () => AudioContext;

let context: AudioContext | undefined;

function readConstructor(): AudioContextConstructor | undefined {
  const scope: { readonly AudioContext?: AudioContextConstructor } = globalThis;
  return scope.AudioContext;
}

// O `AudioContext` só nasce depois de um gesto: o clique no interruptor "Som" chama isto (nunca ao abrir a tela).
export function primeNoticeSound(): void {
  if (context !== undefined) return;
  const Constructor = readConstructor();
  if (Constructor === undefined) return;
  try {
    context = new Constructor();
  } catch {
    context = undefined;
  }
}

function tonesFor(notice: Notice): readonly number[] {
  if (notice.kind === NOTICE_KIND.ENTRY && notice.state === NOTICE_STATE.FILLED) return BUY_TONES;
  if (notice.kind === NOTICE_KIND.EXIT) return SELL_TONES;
  return NEUTRAL_TONES;
}

// Dois tons curtos (sobe na compra, desce na venda, um tom neutro no resto), sem arquivo de áudio.
export function playNoticeSound(notice: Notice): void {
  const audio = context;
  if (audio === undefined) return;
  try {
    tonesFor(notice).forEach((frequency, index) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const start = audio.currentTime + index * (TONE_SECONDS + TONE_GAP_SECONDS);
      oscillator.frequency.value = frequency;
      gain.gain.value = TONE_VOLUME;
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + TONE_SECONDS);
    });
  } catch {
    return;
  }
}
