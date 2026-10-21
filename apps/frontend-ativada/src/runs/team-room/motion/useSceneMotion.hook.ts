// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useState } from 'react';

import { rhythmOf, type Rhythm } from './motion-rhythm.js';
import { useCalm } from './useCalm.hook.js';
import { useReducedMotion } from './useReducedMotion.hook.js';

export type SceneMotion = {
  // Só com isto verdadeiro a cena agenda o relógio e leva atributos de movimento; senão ficam as poses fixas.
  readonly isMoving: boolean;
  readonly rhythm: Rhythm;
  // O nome do ritmo, para o CSS escolher a duração do passo (espelha `RHYTHM.*.stepMilliseconds`).
  readonly rhythmName: 'lively' | 'calm';
};

export type SceneMotionInput = {
  // O botão de pausar a animação do cartão (preferência) e a pausa automática fora da tela.
  readonly isAnimationOn: boolean;
  readonly isAutoPaused: boolean;
};

function useTabVisible(): boolean {
  const [isVisible, setIsVisible] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const handleChange = (): void => setIsVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', handleChange);
    return (): void => document.removeEventListener('visibilitychange', handleChange);
  }, []);
  return isVisible;
}

// Quando a cena pode se mexer e em que ritmo: movimento reduzido, animação desligada, aba oculta ou cena fora da tela = parada.
export function useSceneMotion({ isAnimationOn, isAutoPaused }: SceneMotionInput): SceneMotion {
  const { isCalm } = useCalm();
  const isReduced = useReducedMotion();
  const isTabVisible = useTabVisible();
  return {
    isMoving: isAnimationOn && !isReduced && isTabVisible && !isAutoPaused,
    rhythm: rhythmOf(isCalm),
    rhythmName: isCalm ? 'calm' : 'lively',
  };
}
