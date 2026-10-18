// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import type { DeskSpec } from './office-grid.js';
import { placeClass } from './iso-place.js';
import styles from './IsoDesk.module.css';
import { IsoScreen } from './IsoScreen.component.js';

// A mesa de 2 × 1 células (tampo e duas faces visíveis), o computador de pé no fundo dela e a cadeira no assento.
export function IsoDesk({ spec }: { readonly spec: DeskSpec }): ReactElement {
  return (
    <>
      <div className={`${placeClass(spec.desk)} ${styles.desk}`} data-desk={spec.slot}>
        <span className={styles.top} />
        <span className={styles.left} />
        <span className={styles.right} />
        <span className={styles.monitor}>
          <IsoScreen slot={spec.slot} />
        </span>
      </div>
      <span className={`${placeClass(spec.seat)} ${styles.chair}`} />
    </>
  );
}
