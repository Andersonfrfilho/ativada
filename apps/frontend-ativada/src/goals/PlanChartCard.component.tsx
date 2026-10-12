// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useShownPrice } from '../live/useShownPrice.hook.js';
import { Card } from '../layout/Card.component.js';
import { PlanChart, type PlanChartLevel } from './PlanChart.component.js';
import { usePlanCandlesQuery } from './plan.query.js';
import type { PlanView } from './plan.validation.js';

function collectLevels(view: PlanView, now: string | undefined): PlanChartLevel[] {
  const { plan } = view;
  const levels: (PlanChartLevel | undefined)[] = [
    plan.buy.status === 'price' && plan.buy.price !== null
      ? { key: 'buy', label: 'Compra', price: plan.buy.price }
      : undefined,
    plan.target === null ? undefined : { key: 'target', label: 'Alvo', price: plan.target.price },
    plan.stop === null ? undefined : { key: 'stop', label: 'Stop', price: plan.stop.price },
    now === undefined ? undefined : { key: 'now', label: 'Agora', price: now },
  ];
  return levels.filter((level): level is PlanChartLevel => level !== undefined);
}

export function PlanChartCard({ view }: { readonly view: PlanView }): ReactElement {
  const candles = usePlanCandlesQuery(view.symbol).data ?? [];
  const now = useShownPrice(view.symbol)?.price ?? view.plan.lastClose;
  return (
    <Card title="Preço e níveis">
      <PlanChart
        candles={candles}
        levels={collectLevels(view, now)}
        startsAt={view.plan.startsAt}
        deadlineAt={view.plan.deadlineAt}
      />
    </Card>
  );
}
