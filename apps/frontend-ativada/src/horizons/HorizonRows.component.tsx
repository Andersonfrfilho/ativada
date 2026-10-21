// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { DailyHorizonRow } from './DailyHorizonRow.component.js';
import { HORIZON_ROW_KIND } from './horizon.constant.js';
import type { HorizonRowData } from './horizon.validation.js';
import styles from './Horizons.module.css';
import { IntradayHorizonRow } from './IntradayHorizonRow.component.js';

export type HorizonRowsProps = { readonly rows: readonly HorizonRowData[] };

// A ordem é a do servidor (15 minutos, 7, 15 e 30 dias): a tela não reordena nem remonta frase alguma.
export function HorizonRows({ rows }: HorizonRowsProps): ReactElement | null {
  if (rows.length === 0) return null;
  return (
    <ol className={styles.rows} aria-label="Prazos comparados">
      {rows.map((row) =>
        row.kind === HORIZON_ROW_KIND.DAILY ? (
          <DailyHorizonRow key={`daily:${row.horizonDays}`} row={row} />
        ) : (
          <IntradayHorizonRow key="intraday" row={row} />
        ),
      )}
    </ol>
  );
}
