// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatDecimal, formatPrice, formatSymbol } from '../format/format.js';
import { Card } from '../layout/Card.component.js';
import { useShownPrice } from '../live/useShownPrice.hook.js';
import { CHIP_TONE, StatusChip } from '../runs/live-tracking/StatusChip.component.js';
import controls from '../styles/Controls.module.css';
import { FAMILY_LABEL, TRIGGER_STATE_LABEL } from './goal.constant.js';
import type { Combination, GoalEvaluation, Situation } from './goal.validation.js';
import styles from './Goals.module.css';
import { describeTrigger, nextTriggerByFamily } from './trigger-text.js';

type CoinSituation = {
  readonly symbol: string;
  readonly strategyName: string;
  readonly situation: Situation | null;
};

// Por moeda, a situação da combinação mais bem colocada no ranking que tem situação.
function pickSituations(combinations: readonly Combination[]): CoinSituation[] {
  const symbols = [...new Set(combinations.map((item) => item.symbol))];
  return symbols.map((symbol) => {
    const own = combinations.filter((item) => item.symbol === symbol);
    const best = own.find((item) => item.situation !== null) ?? own[0];
    return {
      symbol,
      strategyName: best?.strategy.name ?? '',
      situation: best?.situation ?? null,
    };
  });
}

type TriggersBodyProps = {
  readonly name: string;
  readonly strategyName: string;
  readonly triggers: Situation['triggers'];
};

function TriggersBody({ name, strategyName, triggers }: TriggersBodyProps): ReactElement {
  return (
    <>
      <span>
        <StatusChip tone={CHIP_TONE.NEUTRAL} icon="pause">
          {TRIGGER_STATE_LABEL[triggers.state]}
        </StatusChip>
      </span>
      <p>
        Segundo {strategyName}: placar faltando {formatDecimal(triggers.scoreGap)} para o limiar{' '}
        {formatDecimal(triggers.scoreThreshold)}.
      </p>
      <details className={styles.details}>
        <summary>Próximo gatilho por família</summary>
        <ul className={styles.families} aria-label={`Próximo gatilho por família em ${name}`}>
          {nextTriggerByFamily(triggers.rules).map(({ family, rule }) => (
            <li key={family}>
              <strong>{FAMILY_LABEL[family] ?? family}</strong>
              <p className={controls.muted}>{describeTrigger(rule)}</p>
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}

function SituationArticle({ coin }: { readonly coin: CoinSituation }): ReactElement {
  const name = formatSymbol(coin.symbol);
  const triggers = coin.situation?.triggers;
  const price = useShownPrice(coin.symbol);
  return (
    <article className={styles.situation} aria-label={name}>
      <div className={styles.situationHead}>
        <h3>{name}</h3>
        {price === undefined ? null : (
          <strong className={styles.num}>{formatPrice(price.price)}</strong>
        )}
      </div>
      {triggers === undefined ? (
        <p className={controls.muted}>Sem situação: ainda não há velas suficientes.</p>
      ) : (
        <TriggersBody name={name} strategyName={coin.strategyName} triggers={triggers} />
      )}
    </article>
  );
}

export function CoinsSituationCard({
  evaluation,
}: {
  readonly evaluation: GoalEvaluation;
}): ReactElement {
  return (
    <Card
      title="Moedas: situação e próximo gatilho"
      icon="list"
      aside={<span className={controls.muted}>com a estratégia mais bem colocada em cada par</span>}
    >
      <div className={styles.situations}>
        {pickSituations(evaluation.combinations).map((coin) => (
          <SituationArticle key={coin.symbol} coin={coin} />
        ))}
      </div>
    </Card>
  );
}
