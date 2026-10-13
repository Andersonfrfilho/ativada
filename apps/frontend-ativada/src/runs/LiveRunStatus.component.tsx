// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useUserTimeZone } from '../account/useUserTimeZone.hook.js';
import { formatInZone, zoneLabel } from '../format/zoned-time.js';
import controls from '../styles/Controls.module.css';
import { deriveLiveRunState, type LiveRunStatusInput } from './live-run-status.js';
import styles from './LiveRunStatus.module.css';

export type LiveRunStatusProps = { readonly run: LiveRunStatusInput };

// Mesmo texto em toda tela: parada (faixa), espera por dado, aguardando a primeira vela, última e próxima decisão.
export function LiveRunStatus({ run }: LiveRunStatusProps): ReactElement | null {
  const timeZone = useUserTimeZone();
  const now = Date.now();
  const state = deriveLiveRunState(run, { now, timeZone });
  if (state.kind === 'none') return null;
  if (state.kind === 'waitingForData') {
    return (
      <p className={styles.state}>
        Aguardando dados do mercado
        <span className={controls.muted}> desde {formatInZone(state.since, timeZone)}</span>
      </p>
    );
  }
  return (
    <div className={state.kind === 'stalled' ? styles.stalled : styles.status}>
      <p role={state.kind === 'stalled' ? 'status' : undefined}>
        {state.kind === 'stalled' ? (
          <>
            <span aria-hidden="true">⚠ </span>
            <strong>Parada. </strong>
          </>
        ) : null}
        {state.text}
      </p>
      <small className={controls.muted}>Horários em {zoneLabel(timeZone, now)}.</small>
    </div>
  );
}
