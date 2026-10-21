// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import runStyles from '../runs/Runs.module.css';

export type HorizonFigureProps = {
  readonly label: string;
  readonly value: string;
  readonly tone?: 'positive' | 'negative' | undefined;
};

export function HorizonFigure({ label, value, tone }: HorizonFigureProps): ReactElement {
  return (
    <div className={runStyles.fact}>
      <dt>{label}</dt>
      <dd className={tone === undefined ? undefined : runStyles[tone]}>{value}</dd>
    </div>
  );
}
