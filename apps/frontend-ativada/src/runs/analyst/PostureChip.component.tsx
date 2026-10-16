// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { StatusChip } from '../live-tracking/StatusChip.component.js';
import { ANALYST_TEXT, FAILED_LOOK, POSTURE_LOOK } from './analyst.constant.js';
import type { AnalystDecision } from './analyst.validation.js';

// A postura em ícone + palavra + cor; a palavra (PAUSA, CAUTELA, MODERADA, LIBERADA) é a do servidor.
export function PostureChip({ decision }: { readonly decision: AnalystDecision }): ReactElement {
  if (decision.status === 'failed') {
    return (
      <StatusChip tone={FAILED_LOOK.tone} icon={FAILED_LOOK.icon}>
        {ANALYST_TEXT.FAILED_WORD}
      </StatusChip>
    );
  }
  const look = POSTURE_LOOK[decision.posture];
  return (
    <StatusChip tone={look.tone} icon={look.icon}>
      {decision.postureLabel}
    </StatusChip>
  );
}
