// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import styles from './Horizons.module.css';

const EXPLANATIONS = [
  'Cada linha é um prazo: por quanto tempo você teria ficado com a moeda. Uma "tentativa" é um período desse tamanho começando em cada dia do histórico.',
  'Cada linha mostra a melhor das suas estratégias naquele prazo, escolhida olhando o passado; por isso o resultado real tende a ser um pouco pior.',
  '"Em geral" é o resultado do meio: metade das tentativas foi melhor que ele e metade foi pior.',
  '"Em quantas vezes deu positivo" conta as tentativas que terminaram no lucro. Entre parênteses, quantas foram no total.',
  '"No pior caso" é o resultado que só as 10% piores tentativas ficaram abaixo. Mostra o tamanho do tombo que já aconteceu.',
  '"Comprar e segurar" é só comprar no começo e esperar, sem estratégia. Um prazo só vale a pena se for melhor que isso.',
  'O selo "Recomendável" aparece em no máximo um prazo de dias, e só quando o resultado foi positivo com folga, sem tombo grande e com histórico suficiente. Pode não aparecer em nenhum.',
  'Os 15 minutos são uma operação rápida nos últimos 90 dias: as taxas de cada compra e venda podem comer todo o ganho.',
] as const;

export function HorizonExplainer(): ReactElement {
  return (
    <details className={styles.explainer}>
      <summary>Como ler esta tela</summary>
      <ul>
        {EXPLANATIONS.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
    </details>
  );
}
