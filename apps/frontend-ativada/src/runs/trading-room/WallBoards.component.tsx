// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import { formatTimeInZone } from '../../format/zoned-time.js';
import { formatPrice } from '../../format/format.js';
import type { LiveStatus } from '../live-tracking/live-status.validation.js';
import { strategyPlanRows } from './room-plan-rows.js';
import type { TradePlan } from './trade-plan.validation.js';
import { scorePips } from './wall-model.js';
import styles from './Wall.module.css';

function ScorePips({
  score,
  threshold,
}: {
  readonly score: string;
  readonly threshold: string;
}): ReactElement {
  return (
    <div className={styles.pips} aria-hidden="true">
      {scorePips(score, threshold).map((pip) => (
        <span
          key={pip.value}
          className={styles.pip}
          data-side={pip.side}
          data-on={pip.isOn}
          data-gate={pip.isGate}
        />
      ))}
    </div>
  );
}

// O quadro "Próxima vela": quando a equipe decide de novo (no fuso do usuário) e o placar de agora com o limiar.
export function NextCandleBoard({ status }: { readonly status: LiveStatus }): ReactElement {
  const timeZone = useUserTimeZone();
  const { nextDecisionAt } = status.run;
  const { triggers } = status;
  return (
    <section className={styles.board} aria-label="Próxima vela">
      <h4 className={styles.boardTitle}>Próxima vela</h4>
      <p className={styles.clock}>
        {nextDecisionAt === null ? '--:--' : formatTimeInZone(nextDecisionAt, timeZone)}
      </p>
      {triggers.status === 'available' ? (
        <>
          <p className={styles.score}>
            Placar <strong>{triggers.score}</strong> · compra a partir de {triggers.scoreThreshold}
          </p>
          <ScorePips score={triggers.score} threshold={triggers.scoreThreshold} />
          <p className={styles.boardNote}>{triggers.message}</p>
        </>
      ) : (
        <p className={styles.boardNote}>{triggers.message}</p>
      )}
    </section>
  );
}

// O quadro de preços: o plano do servidor em linhas (compra, alvo, lucro previsto, proteção) e o último fechamento.
export function PriceBoard({
  tradePlan,
}: {
  readonly tradePlan: TradePlan | undefined;
}): ReactElement {
  const plan = tradePlan?.plan;
  return (
    <section className={styles.board} aria-label="Quadro de preços">
      <h4 className={styles.boardTitle}>Quadro de preços</h4>
      <ul className={styles.priceRows}>
        {strategyPlanRows(plan).map((row) => (
          <li key={row.label} className={styles.priceRow} data-tone={row.tone}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
            {row.detail === undefined ? null : <em>{row.detail}</em>}
          </li>
        ))}
        {plan === undefined || plan.status === 'unavailable' ? null : (
          <li className={styles.priceRow} data-tone="neutral">
            <span>Último fechamento</span>
            <strong>{formatPrice(plan.currentPrice)}</strong>
          </li>
        )}
      </ul>
      {plan === undefined ? null : <p className={styles.boardNote}>{plan.message}</p>}
    </section>
  );
}
