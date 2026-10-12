// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatDecimal } from '../format/format.js';
import { Card } from '../layout/Card.component.js';
import controls from '../styles/Controls.module.css';
import type { RunMetrics } from '../runs/run.validation.js';

export type CompareCostsProps = {
  readonly first: RunMetrics;
  readonly second: RunMetrics;
};

function paid(metrics: RunMetrics): string {
  return `${formatDecimal(metrics.feesPaid)} em ${metrics.trades} operações`;
}

// A explicação que o resultado bruto esconde: o que o custo come de cada lado.
export function CompareCosts({ first, second }: CompareCostsProps): ReactElement {
  return (
    <Card title="Como ler os custos">
      <p>
        As três colunas já pagam taxa e slippage. Comprar e segurar faz uma compra e uma venda; a
        estratégia paga a cada operação, então operar muito corrói o resultado mesmo quando cada
        operação parece pequena.
      </p>
      <p>
        Taxas pagas: execução A, {paid(first)}; execução B, {paid(second)}.
      </p>
      <p className={controls.muted}>
        É o que a regra teria feito no passado, com dinheiro fictício: não é recomendação de
        investimento e não promete o mesmo no futuro.
      </p>
    </Card>
  );
}
