// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useRef, useState } from 'react';

import { OFFICE_IDLE_MILLISECONDS, type OfficePhase, type OfficeScene } from './office.constant.js';
import { planOf } from './office-scene.js';
import { createSceneRunner, type SceneClock, type SceneRunner } from './scene-runner.js';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const REAL_CLOCK: SceneClock = {
  now: () => performance.now(),
  setTimer: (callback, milliseconds) => {
    const id = setTimeout(callback, milliseconds);
    return () => clearTimeout(id);
  },
};

export type OfficeSceneParams = {
  // A vela mais recente; só a MUDANÇA dela, depois do primeiro valor, dispara a coreografia.
  readonly candleKey: number | undefined;
  readonly scene: OfficeScene;
  readonly isEnabled: boolean;
  // Fora da tela ou aba oculta: pausa sozinha e retoma ao voltar.
  readonly isAutoPaused: boolean;
  readonly clock?: SceneClock;
};

export type OfficeSceneState = {
  // As fases que já começaram; vazio = repouso (o estado final, desenhado no primeiro quadro).
  readonly phases: readonly OfficePhase[];
  readonly isRunning: boolean;
  readonly isIdle: boolean;
  readonly isPaused: boolean;
  readonly announcedKey: number | undefined;
  readonly replay: () => void;
  readonly togglePause: () => void;
};

function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
}

type Setters = {
  readonly setPhases: (phases: readonly OfficePhase[]) => void;
  readonly setIsRunning: (isRunning: boolean) => void;
  readonly setIsIdle: (isIdle: boolean) => void;
  readonly setAnnouncedKey: (key: number | undefined) => void;
};

type StartInput = {
  readonly params: OfficeSceneParams;
  readonly setters: Setters;
  readonly runner: { current: SceneRunner | undefined };
  readonly isPaused: boolean;
};

// Liga a coreografia de uma vela; devolve a limpeza. Sem animação (desligada ou movimento reduzido) vai direto ao repouso.
function startScene({ params, setters, runner, isPaused }: StartInput): (() => void) | undefined {
  const { candleKey, scene, isEnabled, clock = REAL_CLOCK } = params;
  const { setPhases, setIsRunning, setIsIdle, setAnnouncedKey } = setters;
  runner.current?.stop();
  if (!isEnabled || prefersReducedMotion()) {
    setPhases([]);
    setIsRunning(false);
    setAnnouncedKey(candleKey);
    return undefined;
  }
  setIsIdle(false);
  setIsRunning(true);
  let cancelIdle: (() => void) | undefined;
  const next = createSceneRunner({
    plan: planOf(scene),
    clock,
    onPhases: setPhases,
    onDone: () => {
      setPhases([]);
      setIsRunning(false);
      setAnnouncedKey(candleKey);
      setIsIdle(true);
      cancelIdle = clock.setTimer(() => setIsIdle(false), OFFICE_IDLE_MILLISECONDS);
    },
  });
  runner.current = next;
  next.start();
  if (isPaused) next.pause();
  return (): void => {
    next.stop();
    cancelIdle?.();
  };
}

// Vela nova (ou "Repetir"): a coreografia roda uma vez, em ≤ 2,5 s, e o escritório volta ao repouso. Abrir a tela não anima.
export function useOfficeScene(params: OfficeSceneParams): OfficeSceneState {
  const { candleKey, isAutoPaused } = params;
  const [phases, setPhases] = useState<readonly OfficePhase[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const [isUserPaused, setIsUserPaused] = useState(false);
  const [announcedKey, setAnnouncedKey] = useState<number | undefined>(undefined);
  const [replayCount, setReplayCount] = useState(0);
  const latest = useRef({ params, isPaused: false });
  const runner = useRef<SceneRunner | undefined>(undefined);
  const seen = useRef({ candleKey, replayCount });
  const shouldPause = isUserPaused || isAutoPaused;
  useEffect(() => {
    latest.current = { params, isPaused: shouldPause };
  });
  useEffect(() => {
    const before = seen.current;
    seen.current = { candleKey, replayCount };
    const isNewCandle =
      before.candleKey !== undefined && candleKey !== undefined && before.candleKey !== candleKey;
    if (!isNewCandle && before.replayCount === replayCount) return undefined;
    const setters = { setPhases, setIsRunning, setIsIdle, setAnnouncedKey };
    return startScene({ ...latest.current, setters, runner });
  }, [candleKey, replayCount]);
  useEffect(() => {
    if (shouldPause) runner.current?.pause();
    else runner.current?.resume();
  }, [shouldPause]);
  return {
    phases,
    isRunning,
    isIdle,
    isPaused: isUserPaused,
    announcedKey,
    replay: () => setReplayCount((count) => count + 1),
    togglePause: () => setIsUserPaused((paused) => !paused),
  };
}
