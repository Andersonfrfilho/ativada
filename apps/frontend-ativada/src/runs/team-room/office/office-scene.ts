// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AnalystPosture } from '../../analyst/analyst.validation.js';
import type { Decision } from '../../live-tracking/live-status.validation.js';
import {
  OFFICE_PLANS,
  OFFICE_SCENE,
  type OfficePlan,
  type OfficeScene,
} from './office.constant.js';

export type SceneInput = {
  readonly outcome: Decision['outcome'];
  // A postura da Alice na vela e se alguma trava está ligada: ambas travam compra nova.
  readonly posture: AnalystPosture | undefined;
  readonly hasActiveLock: boolean;
};

// Que cena a vela nova pede: trava e pausa primeiro (nenhuma compra nova), depois compra, depois venda; senão, a reunião.
export function sceneOf({ outcome, posture, hasActiveLock }: SceneInput): OfficeScene {
  if (posture === 'pause' || hasActiveLock) return OFFICE_SCENE.LOCKED;
  if (outcome === 'bought' || outcome === 'buy_pending') return OFFICE_SCENE.BUY_SIGNAL;
  if (outcome === 'sold' || outcome === 'exited') return OFFICE_SCENE.SELL_SIGNAL;
  return OFFICE_SCENE.NEW_CANDLE;
}

export function planOf(scene: OfficeScene): OfficePlan {
  return OFFICE_PLANS[scene];
}
