// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import styles from './Notices.module.css';

// A barra de progresso até a condição de compra (RF25): % inteiro em BigInt, como atributo do SVG (nunca estilo em linha).
export function TriggerProgress({ percent }: { readonly percent: bigint }): ReactElement {
  const text = percent.toString();
  return (
    <div
      className={styles['progress']}
      role="progressbar"
      aria-label="Quão perto o preço está do ponto de compra"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Number.parseInt(text, 10)}
    >
      <svg viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <rect className={styles['progressTrack']} x="0" y="0" width="100" height="8" rx="4" />
        <rect className={styles['progressFill']} x="0" y="0" width={text} height="8" rx="4" />
      </svg>
    </div>
  );
}
