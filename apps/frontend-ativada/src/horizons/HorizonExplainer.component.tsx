// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import styles from './Horizons.module.css';

export function HorizonExplainer(): ReactElement {
  return (
    <details className={styles.explainer}>
      <summary>Como ler esta tela</summary>
      <ul>
        <li>
          Cada linha é um prazo: por quanto tempo você teria ficado com a moeda. Uma
          &quot;tentativa&quot; é um período desse tamanho começando em cada dia do histórico.
        </li>
        <li>
          &quot;Em geral&quot; é o resultado do meio: metade das tentativas foi melhor que ele e
          metade foi pior.
        </li>
        <li>
          &quot;Em quantas vezes deu positivo&quot; conta as tentativas que terminaram no lucro.
          Entre parênteses, quantas foram no total.
        </li>
        <li>
          &quot;No pior caso&quot; é o resultado que só as 10% piores tentativas ficaram abaixo.
          Mostra o tamanho do tombo que já aconteceu.
        </li>
        <li>
          &quot;Comprar e segurar&quot; é só comprar no começo e esperar, sem estratégia. Um prazo
          só vale a pena se for melhor que isso.
        </li>
        <li>
          O selo &quot;Recomendável&quot; aparece em no máximo um prazo de dias, e só quando o
          resultado foi positivo com folga, sem tombo grande e com histórico suficiente. Pode não
          aparecer em nenhum.
        </li>
        <li>
          Os 15 minutos são uma operação rápida nos últimos 90 dias: as taxas de cada compra e venda
          podem comer todo o ganho.
        </li>
      </ul>
    </details>
  );
}
