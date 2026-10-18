// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { BalconySlot } from '../balcony/balcony.constant.js';
import { OFFICE_DESKS, type Cell } from './office-grid.js';
import type { OfficePayload, Pose } from './office-script.js';

export type Placement = { readonly cell: Cell; readonly pose: Pose };
export type OfficeWalkState = Readonly<Partial<Record<BalconySlot, Placement>>>;

// Todo mundo sentado no próprio assento: o repouso e o começo de cada ciclo.
export const SEATED: OfficeWalkState = Object.fromEntries(
  OFFICE_DESKS.map((spec) => [spec.slot, { cell: spec.seat, pose: 'sit' } satisfies Placement]),
);

export function applyOfficeCue(state: OfficeWalkState, payload: OfficePayload): OfficeWalkState {
  if (payload.kind === 'reset') return SEATED;
  return { ...state, [payload.slot]: { cell: payload.cell, pose: payload.pose } };
}
