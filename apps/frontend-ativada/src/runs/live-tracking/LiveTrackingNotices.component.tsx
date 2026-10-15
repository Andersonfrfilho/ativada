// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import {
  isSimulationTimeframe,
  SIMULATION_EVERY_TEXT,
  SIMULATION_TIMEFRAME_LABEL,
} from '../../goals/simulation-timeframe.constant.js';
import { Term } from '../../glossary/Term.component.js';
import { Icon } from '../../layout/Icon.component.js';
import styles from './LiveTracking.module.css';

export const NOT_A_FORECAST_TEXT =
  'Isto não é previsão: o preço pode nunca chegar lá, e as regras podem mudar de voto antes.';
export const PLAY_MONEY_TEXT =
  'Simulação com dinheiro fictício; nada aqui é recomendação de compra ou venda.';

// Os avisos fixos do cartão (RF10), curtos: o que é uma vela, de quanto em quanto tempo ela decide e que o dinheiro é fictício.
export function LiveTrackingNotices({ timeframe }: { readonly timeframe: string }): ReactElement {
  const label = isSimulationTimeframe(timeframe)
    ? SIMULATION_TIMEFRAME_LABEL[timeframe]
    : timeframe;
  const every = isSimulationTimeframe(timeframe) ? SIMULATION_EVERY_TEXT[timeframe] : undefined;
  return (
    <ul className={styles.notices} aria-label="Avisos sobre a simulação">
      <li>
        <Icon name="info" size={14} />
        <span>
          <Term term="candle">Vela</Term>: o resumo do preço em {label}, com abertura, máxima,
          mínima e fechamento.
        </span>
      </li>
      <li>
        <Icon name="info" size={14} />
        <span>
          A simulação olha o mercado {every ?? `a cada vela de ${label}`} e decide só quando a vela
          fecha.
        </span>
      </li>
      <li>
        <Icon name="info" size={14} />
        <span>{PLAY_MONEY_TEXT}</span>
      </li>
    </ul>
  );
}
