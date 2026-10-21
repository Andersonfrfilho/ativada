// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createContext, useContext, type ReactElement, type ReactNode } from 'react';

import type { Gesture } from '../motion/gesture.js';
import type { BalconySlot } from './balcony.constant.js';
import type { BalconyScene } from './useBalconyScene.hook.js';

const SceneContext = createContext<BalconyScene | undefined>(undefined);

export function BalconySceneProvider({
  scene,
  children,
}: {
  readonly scene: BalconyScene;
  readonly children: ReactNode;
}): ReactElement {
  return <SceneContext.Provider value={scene}>{children}</SceneContext.Provider>;
}

export type SlotMotion = {
  // Os dois só existem com a cena se mexendo; parada, `undefined` (nenhum atributo de movimento no DOM).
  readonly isTurns: boolean;
  readonly isSpeaking: boolean;
  readonly gesture: Gesture | undefined;
};

// O que a cena diz a UM agente: se é a vez dele de falar e que gesto faz. Sem cena (ou parada), nada se mexe.
export function useSlotMotion(slot: BalconySlot): SlotMotion {
  const scene = useContext(SceneContext);
  if (scene === undefined || !scene.isTurns) {
    return { isTurns: false, isSpeaking: false, gesture: undefined };
  }
  return { isTurns: true, isSpeaking: scene.speaker === slot, gesture: scene.gestures[slot] };
}
