// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { plainText } from './metric-text.js';
import styles from './Runs.module.css';
import type { Overfitting } from './run.validation.js';

const REASON_TEXT: Readonly<Record<string, string>> = {
  sharpe_below_half_of_in_sample:
    'O Sharpe fora da amostra ficou abaixo da metade do Sharpe do ajuste.',
  negative_out_of_sample_with_positive_in_sample:
    'O resultado fora da amostra ficou negativo, apesar de positivo no ajuste.',
  too_few_eligible_windows:
    'Poucas janelas tiveram operações suficientes para confiar no resultado.',
  out_of_sample_undefined: 'Não foi possível calcular o Sharpe fora da amostra.',
};

function Numbers({ overfitting }: { readonly overfitting: Overfitting }): ReactElement {
  return (
    <p className={styles.sub}>
      Sharpe no ajuste: {plainText(overfitting.inSampleSharpe).text} · fora da amostra:{' '}
      {plainText(overfitting.outOfSampleSharpe).text} · janelas com operações:{' '}
      {overfitting.eligibleWindows} de {overfitting.totalWindows}.
    </p>
  );
}

export type OverfittingCardProps = { readonly overfitting: Overfitting | undefined };

// O relatório principal é o fora da amostra; este bloco diz se ele merece confiança (RF08).
export function OverfittingCard({ overfitting }: OverfittingCardProps): ReactElement | null {
  if (overfitting === undefined) return null;
  if (!overfitting.isAlert) {
    return (
      <div className={styles.okBox}>
        <strong>Sem sinal de sobreajuste.</strong> O resultado fora da amostra acompanhou o do
        ajuste.
        <Numbers overfitting={overfitting} />
      </div>
    );
  }
  return (
    <div role="alert" className={styles.alertBox}>
      <strong>Alerta de sobreajuste: a regra pode ter só decorado o passado.</strong>
      <ul>
        {overfitting.reasons.map((reason) => (
          <li key={reason}>{REASON_TEXT[reason] ?? reason}</li>
        ))}
      </ul>
      <Numbers overfitting={overfitting} />
    </div>
  );
}
