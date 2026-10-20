// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useSyncExternalStore } from 'react';

import { useCalm } from '../team-room/motion/useCalm.hook.js';
import { useSceneMotion } from '../team-room/motion/useSceneMotion.hook.js';

const WIDE_QUERY = '(min-width: 760px)';

function subscribe(onChange: () => void): () => void {
  const list = globalThis.matchMedia?.(WIDE_QUERY);
  list?.addEventListener?.('change', onChange);
  return (): void => list?.removeEventListener?.('change', onChange);
}

function isWideNow(): boolean {
  return globalThis.matchMedia?.(WIDE_QUERY).matches ?? true;
}

export type RoomMotion = { readonly isWide: boolean; readonly isMoving: boolean };

// O piso só existe a partir de 760 px; a cena só se mexe com ele à vista, sem Calmo, sem movimento reduzido e com a aba
// visível. Qualquer um desses congela tudo onde está.
export function useRoomMotion(): RoomMotion {
  const isWide = useSyncExternalStore(subscribe, isWideNow, () => true);
  const { isCalm } = useCalm();
  const { isMoving } = useSceneMotion({ isAnimationOn: !isCalm, isAutoPaused: !isWide });
  return { isWide, isMoving };
}
