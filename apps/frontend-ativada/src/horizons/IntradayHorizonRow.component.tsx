// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import runStyles from '../runs/Runs.module.css';
import controls from '../styles/Controls.module.css';
import { formatFees, formatRate, rateTone } from './horizon-format.js';
import { HorizonFigure } from './HorizonFigure.component.js';
import { INTRADAY_VERDICT } from './horizon.constant.js';
import type { IntradayRowData } from './horizon.validation.js';
import styles from './Horizons.module.css';

export type IntradayHorizonRowProps = { readonly row: IntradayRowData };

export function IntradayHorizonRow({ row }: IntradayHorizonRowProps): ReactElement {
  const isWorth = row.verdict === INTRADAY_VERDICT.WORTH;
  return (
    <li className={styles.row}>
      <div className={styles.head}>
        <h3 className={styles.rowTitle}>15 minutos</h3>
        <span className={isWorth ? styles.verdictWorth : styles.verdictNotWorth}>
          <span aria-hidden="true">{isWorth ? '✓ ' : '✕ '}</span>
          {isWorth ? 'Compensa' : 'Não compensa'}
        </span>
      </div>
      <p className={styles.message}>{row.message}</p>
      <p className={controls.muted}>
        {row.strategy.name} · versão {row.strategy.version} · últimos {row.days} dias
      </p>
      <dl className={runStyles.facts} aria-label="15 minutos">
        <HorizonFigure
          label="Resultado depois das taxas"
          value={formatRate(row.netReturn, true)}
          tone={rateTone(row.netReturn)}
        />
        <HorizonFigure label="Operações" value={String(row.tradeCount)} />
        <HorizonFigure label="Taxas pagas" value={formatFees(row.feesPaid)} />
        <HorizonFigure
          label="Taxas sobre o ganho bruto"
          value={formatRate(row.feeShareOfGross, false)}
        />
      </dl>
    </li>
  );
}
