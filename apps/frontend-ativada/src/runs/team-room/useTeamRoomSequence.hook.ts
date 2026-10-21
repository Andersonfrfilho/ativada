// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useRef, useState } from 'react';

import { TEAM_ROOM_TIMELINE } from './team-room.constant.js';
import { planSequence, REST_STEP, type Timeline } from './team-room-sequence.js';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export type SequenceParams = {
  // A vela mais recente (`candleTime`); só a MUDANÇA dele, depois do primeiro valor, dispara a sequência.
  readonly candleKey: number | undefined;
  readonly seatCount: number;
  readonly isEnabled: boolean;
  readonly timeline?: Timeline;
};

export type TeamRoomSequence = {
  readonly step: number;
  // A vela cuja frase de resumo já pode ser anunciada ao leitor de tela (uma vez por vela nova).
  readonly announcedKey: number | undefined;
  readonly replay: () => void;
};

function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
}

// Vela nova (ou "Repetir"): pensa, fala um a um e o resumo decide por último. Abrir a tela não anima.
export function useTeamRoomSequence(params: SequenceParams): TeamRoomSequence {
  const { candleKey } = params;
  const [step, setStep] = useState(REST_STEP);
  const [announcedKey, setAnnouncedKey] = useState<number | undefined>(undefined);
  const [replayCount, setReplayCount] = useState(0);
  const latest = useRef(params);
  const seen = useRef({ candleKey, replayCount });
  useEffect(() => {
    latest.current = params;
  });
  useEffect(() => {
    const before = seen.current;
    seen.current = { candleKey, replayCount };
    const isNewCandle =
      before.candleKey !== undefined && candleKey !== undefined && before.candleKey !== candleKey;
    if (!isNewCandle && before.replayCount === replayCount) return undefined;
    const { seatCount, isEnabled, timeline = TEAM_ROOM_TIMELINE } = latest.current;
    if (!isEnabled || prefersReducedMotion()) {
      setStep(REST_STEP);
      setAnnouncedKey(candleKey);
      return undefined;
    }
    setStep(0);
    const plan = planSequence(seatCount, timeline);
    const timers = plan.map((planned) => setTimeout(() => setStep(planned.step), planned.at));
    const announceAt = (plan.at(-1)?.at ?? 0) + timeline.announceAfterMilliseconds;
    timers.push(setTimeout(() => setAnnouncedKey(candleKey), announceAt));
    return (): void => timers.forEach(clearTimeout);
  }, [candleKey, replayCount]);
  return { step, announcedKey, replay: () => setReplayCount((count) => count + 1) };
}
