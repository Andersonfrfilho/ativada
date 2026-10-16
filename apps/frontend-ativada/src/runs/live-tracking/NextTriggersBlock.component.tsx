// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import { formatMomentSkippingToday } from '../../format/zoned-moment.js';
import { Term } from '../../glossary/Term.component.js';
import { Card } from '../../layout/Card.component.js';
import { Icon } from '../../layout/Icon.component.js';
import { describeCurrent, describeDistance, describeNeed } from './trigger-text.js';
import type { LiveStatus, RuleTrigger } from './live-status.validation.js';
import styles from './LiveTracking.module.css';
import { TRIGGERS_ANCHOR } from './LiveTradesState.component.js';
import { NOT_A_FORECAST_TEXT } from './LiveTrackingNotices.component.js';
import { formatScorePoints, ScoreboardRuler } from './ScoreboardRuler.component.js';
import { VoteLabel } from './VoteLabel.component.js';

// O servidor já fecha a frase com este aviso; repeti-lo embaixo era o "i" duplicado.
const FORECAST_DISCLAIMER = 'Isto não é previsão';

type Available = Extract<LiveStatus['triggers'], { readonly status: 'available' }>;

function RuleRow({ rule }: { readonly rule: RuleTrigger }): ReactElement {
  const distance = describeDistance(rule);
  return (
    <tr>
      <td className={styles.ruleName}>
        {rule.label}
        <small>
          voto hoje: <VoteLabel vote={rule.vote} weight={rule.weight} isMissing={false} />
        </small>
      </td>
      <td className={styles.num}>
        <span className={styles.cellLabel}>Agora</span>
        {describeCurrent(rule)}
      </td>
      <td>
        <span className={styles.cellLabel}>Precisa</span>
        {describeNeed(rule)}
      </td>
      <td className={`${styles.right} ${styles.num}`}>
        <span className={styles.cellLabel}>Distância</span>
        {distance.text}
        {distance.basis === undefined ? null : (
          <span className={`${styles.extraSmall} ${styles.muted}`}> {distance.basis}</span>
        )}
      </td>
    </tr>
  );
}

function RulesTable({ rules }: { readonly rules: readonly RuleTrigger[] }): ReactElement {
  return (
    <table className={styles.ruleTable}>
      <caption className={styles.visuallyHidden}>
        O que cada regra precisa para votar a favor
      </caption>
      <thead>
        <tr>
          <th scope="col">Regra</th>
          <th scope="col">Agora</th>
          <th scope="col">Precisa</th>
          <th scope="col" className={styles.right}>
            Distância
          </th>
        </tr>
      </thead>
      <tbody>
        {rules.map((rule) => (
          <RuleRow key={rule.ruleId} rule={rule} />
        ))}
      </tbody>
    </table>
  );
}

function AvailableBody({
  triggers,
  lastClosedAt,
}: {
  readonly triggers: Available;
  readonly lastClosedAt: string;
}): ReactElement {
  const verb = triggers.state === 'holding' ? 'vende' : 'compra';
  return (
    <>
      <p className={`${styles.small} ${styles.muted}`}>
        <Term term="score">Pontuação do placar</Term> na última vela ({lastClosedAt}). A estratégia{' '}
        {verb} quando a soma dos votos chega a {formatScorePoints(triggers.scoreThreshold, true)} (o{' '}
        <Term term="threshold">limiar</Term>).
      </p>
      <ScoreboardRuler
        score={triggers.score}
        threshold={triggers.scoreThreshold}
        weights={triggers.rules.map((rule) => rule.weight)}
        verb={verb}
      />
      <p className={styles.gapLine}>{triggers.message}</p>
      {triggers.rules.length === 0 ? null : <RulesTable rules={triggers.rules} />}
    </>
  );
}

// "O que falta para comprar agora" (RF07): régua do placar e, por regra, valor atual, necessário e distância; nada de previsão.
export function NextTriggersBlock({ status }: { readonly status: LiveStatus }): ReactElement {
  const timeZone = useUserTimeZone();
  const triggers = status.triggers;
  const verb =
    triggers.status === 'available' && triggers.state === 'holding' ? 'vender' : 'comprar';
  const lastClosedAt =
    status.run.lastDecisionAt === null
      ? '—'
      : formatMomentSkippingToday(status.run.lastDecisionAt, { now: Date.now(), timeZone });
  return (
    <Card id={TRIGGERS_ANCHOR} title={`O que falta para ${verb} agora`} icon="flag">
      {triggers.status === 'available' ? (
        <AvailableBody triggers={triggers} lastClosedAt={lastClosedAt} />
      ) : (
        <p className={styles.gapLine}>{triggers.message}</p>
      )}
      {triggers.message.includes(FORECAST_DISCLAIMER) ? null : (
        <p className={`${styles.extraSmall} ${styles.muted}`}>
          <Icon name="info" size={14} /> {NOT_A_FORECAST_TEXT}
        </p>
      )}
    </Card>
  );
}
