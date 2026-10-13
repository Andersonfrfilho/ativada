// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import runStyles from '../runs/Runs.module.css';
import { formatRate, rateTone } from './horizon-format.js';
import { HorizonFigure } from './HorizonFigure.component.js';

export type Distribution = {
  readonly median: string | null;
  readonly positiveRate: string | null;
  readonly worstDecile: string | null;
};

export type DistributionFiguresProps = {
  readonly label: string;
  readonly distribution: Distribution;
  readonly windowNote?: string | undefined;
};

export function DistributionFigures({
  label,
  distribution,
  windowNote,
}: DistributionFiguresProps): ReactElement {
  const { median, positiveRate, worstDecile } = distribution;
  return (
    <dl className={runStyles.facts} aria-label={label}>
      <HorizonFigure label="Em geral" value={formatRate(median, true)} tone={rateTone(median)} />
      <HorizonFigure
        label="Em quantas vezes deu positivo"
        value={`${formatRate(positiveRate, false)}${windowNote ?? ''}`}
      />
      <HorizonFigure
        label="No pior caso"
        value={formatRate(worstDecile, true)}
        tone={rateTone(worstDecile)}
      />
    </dl>
  );
}
