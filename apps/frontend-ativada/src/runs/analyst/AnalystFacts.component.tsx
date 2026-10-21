// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Term } from '../../glossary/Term.component.js';
import { ANALYST_TEXT } from './analyst.constant.js';
import styles from './Analyst.module.css';
import { cadenceText, durationText, sizeText } from './analyst-text.js';
import type { DecidedAnalystDecision } from './analyst.validation.js';

function Fact({
  label,
  value,
}: {
  readonly label: ReactElement | string;
  readonly value: string;
}): ReactElement {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>{value}</dd>
    </div>
  );
}

// Ritmo, tamanho e duração da operação que o analista libera agora (texto pronto do catálogo; nada é calculado aqui).
export function AnalystFacts({
  decision,
}: {
  readonly decision: DecidedAnalystDecision;
}): ReactElement {
  return (
    <dl className={styles.facts}>
      <Fact
        label={<Term term="cadence">{ANALYST_TEXT.FACT_CADENCE}</Term>}
        value={cadenceText(decision)}
      />
      <Fact label={ANALYST_TEXT.FACT_SIZE} value={sizeText(decision)} />
      <Fact label={ANALYST_TEXT.FACT_DURATION} value={durationText(decision)} />
    </dl>
  );
}
