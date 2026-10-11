// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatDate, formatPrice } from '../format/format.js';
import { useShownPrice } from '../live/useShownPrice.hook.js';
import { Card } from '../layout/Card.component.js';
import controls from '../styles/Controls.module.css';
import { AlertOnPlanButton } from './AlertOnPlanButton.component.js';
import styles from './Goals.module.css';
import {
  BASIS_TEXT,
  describeBuy,
  describeDistance,
  describeStop,
  describeTarget,
} from './plan-text.js';
import type { PlanView } from './plan.validation.js';

export type PlanCardProps = { readonly view: PlanView };

type LevelProps = {
  readonly title: string;
  readonly kind: 'buy' | 'target' | 'stop';
  readonly price: string | null;
  readonly detail: string;
  readonly view: PlanView;
  readonly current: string;
};

function Level({ title, kind, price, detail, view, current }: LevelProps): ReactElement {
  return (
    <div className={styles.level}>
      <h3>{title}</h3>
      <p className={styles.levelValue}>{price === null ? '—' : formatPrice(price)}</p>
      <p className={controls.muted}>{detail}</p>
      {price === null ? null : (
        <>
          <p className={controls.muted}>{describeDistance(price, current)}</p>
          <AlertOnPlanButton
            kind={kind}
            price={price}
            symbol={view.symbol}
            lastClose={view.plan.lastClose}
          />
        </>
      )}
    </div>
  );
}

function PlanLevels({
  view,
  current,
}: {
  readonly view: PlanView;
  readonly current: string;
}): ReactElement {
  const { plan } = view;
  return (
    <div className={styles.levels}>
      <Level
        title="Compra"
        kind="buy"
        price={plan.buy.status === 'price' ? plan.buy.price : null}
        detail={describeBuy(plan.buy, plan.entryReference)}
        view={view}
        current={current}
      />
      <Level
        title="Alvo"
        kind="target"
        price={plan.target?.price ?? null}
        detail={describeTarget(plan.target)}
        view={view}
        current={current}
      />
      <Level
        title="Stop"
        kind="stop"
        price={plan.stop?.price ?? null}
        detail={describeStop(plan.stop)}
        view={view}
        current={current}
      />
    </div>
  );
}

export function PlanCard({ view }: PlanCardProps): ReactElement {
  const { plan } = view;
  const shown = useShownPrice(view.symbol);
  const current = shown?.price ?? plan.lastClose;
  return (
    <Card title="Plano de operação">
      <p>
        {view.strategy.name} · versão {view.strategy.version} · prazo {formatDate(plan.deadlineAt)}{' '}
        ({plan.horizonDays} dias)
      </p>
      <p>
        {shown === undefined
          ? `Último fechamento ${formatPrice(plan.lastClose)}`
          : `Preço agora ${formatPrice(current)}`}
      </p>
      <PlanLevels view={view} current={current} />
      <p className={controls.muted}>{BASIS_TEXT[plan.basis]}</p>
    </Card>
  );
}
