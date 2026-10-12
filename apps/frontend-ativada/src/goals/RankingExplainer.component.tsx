// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import styles from './Goals.module.css';

export function RankingExplainer(): ReactElement {
  return (
    <details className={styles.explainer}>
      <summary>Como ler este ranking</summary>
      <ul>
        <li>
          Cada linha é uma estratégia aplicada a uma moeda. A posição 1º é a que chegou ao alvo com
          mais frequência no passado.
        </li>
        <li>
          Uma &quot;tentativa&quot; é um período do tamanho do prazo da meta, começando em cada dia
          do histórico. A barra mostra, a cada 100 tentativas, quantas chegaram ao alvo (verde),
          bateram a perda máxima (vermelho) ou terminaram sem nenhum dos dois (cinza).
        </li>
        <li>
          &quot;Comprar e segurar&quot; é o que teria acontecido se você só comprasse no começo e
          esperasse, sem estratégia nenhuma. É a comparação justa: uma estratégia só vale a pena se
          fizer melhor que isso.
        </li>
        <li>
          COMPRAR, SEGURAR e EVITAR descrevem o que o histórico mostrou. Não preveem o futuro.
        </li>
      </ul>
    </details>
  );
}
