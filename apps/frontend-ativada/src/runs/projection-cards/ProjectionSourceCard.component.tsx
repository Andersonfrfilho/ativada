// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import { formatPrice, formatSymbol } from '../../format/format.js';
import { formatTimeInZone } from '../../format/zoned-time.js';
import { Term } from '../../glossary/Term.component.js';
import { Card } from '../../layout/Card.component.js';
import { Icon } from '../../layout/Icon.component.js';
import controls from '../../styles/Controls.module.css';
import { TIMEFRAME_PHRASE } from '../candle-chart/candle-chart.constant.js';
import { useProjectionsQuery } from '../candle-chart/candle-chart.query.js';
import { NEXT_CANDLE_TEXT } from '../candle-chart/next-candle-state.js';
import type {
  AvailableProjection,
  ProjectionCurrent,
} from '../candle-chart/projections.validation.js';
import { useLiveStatusQuery } from '../live-tracking/live-status.query.js';
import type { LiveStatus } from '../live-tracking/live-status.validation.js';
import { ScoreboardRuler } from '../live-tracking/ScoreboardRuler.component.js';
import { VoteLabel } from '../live-tracking/VoteLabel.component.js';
import styles from './ProjectionCards.module.css';

export const SOURCE_TEXT = {
  TITLE: 'De onde vem a previsão',
  LOADING: 'Carregando de onde vem a previsão…',
  ERROR: 'Não foi possível carregar de onde vem a previsão.',
  WEAK_NOTE: '"Fraco" quer dizer que só metade do caminho até a compra foi andado.',
} as const;

type Triggers = Extract<LiveStatus['triggers'], { readonly status: 'available' }>;

function Votes({ triggers }: { readonly triggers: Triggers }): ReactElement {
  return (
    <ul className={styles.votes} aria-label="Voto de cada regra">
      {triggers.rules.map((rule) => (
        <li key={rule.ruleId} className={styles.voteRow}>
          <span>{rule.label}:</span>
          <VoteLabel vote={rule.vote} weight={rule.weight} isMissing={false} />
        </li>
      ))}
    </ul>
  );
}

function Scoreboard({ triggers }: { readonly triggers: Triggers }): ReactElement {
  const verb = triggers.state === 'holding' ? 'vende' : 'compra';
  return (
    <>
      <ScoreboardRuler
        score={triggers.score}
        threshold={triggers.scoreThreshold}
        weights={triggers.rules.map((rule) => rule.weight)}
        verb={verb}
      />
      <Votes triggers={triggers} />
      <p className={styles.gap}>
        <Icon name="flag" size={14} />
        <span>
          <strong>O que falta:</strong> {triggers.message}
        </span>
      </p>
    </>
  );
}

type BandProps = {
  readonly current: AvailableProjection;
  readonly symbol: string;
  readonly timeframe: string;
};

// A faixa em palavras: o ATR e os dois preços vêm do servidor; aqui só a frase.
function BandSentence({ current, symbol, timeframe }: BandProps): ReactElement | null {
  if (current.atr === null || current.bandLow === null || current.bandHigh === null) return null;
  const phrase = TIMEFRAME_PHRASE[timeframe] ?? timeframe;
  return (
    <p className={styles.gap}>
      <Icon name="activity" size={14} />
      <span>
        <strong>
          <Term term="atrBand">Faixa</Term>:
        </strong>{' '}
        numa vela de {phrase} o {formatSymbol(symbol)} costuma andar até{' '}
        <span className={styles.number}>{formatPrice(current.atr)}</span> USDT. Por isso a faixa vai
        de <span className={styles.number}>{formatPrice(current.bandLow)}</span> a{' '}
        <span className={styles.number}>{formatPrice(current.bandHigh)}</span>.
      </span>
    </p>
  );
}

type BodyProps = { readonly status: LiveStatus; readonly current: ProjectionCurrent };

function introOf(current: ProjectionCurrent, timeZone: string): string {
  if (current.status !== 'available') return current.message;
  const closedAt = formatTimeInZone(current.closedAt, timeZone);
  return `A previsão não é outra conta: é o placar da própria estratégia na vela que fechou às ${closedAt}.`;
}

function SourceBody({ status, current }: BodyProps): ReactElement {
  const timeZone = useUserTimeZone();
  const { triggers, run } = status;
  return (
    <>
      <p className={styles.lead}>{introOf(current, timeZone)}</p>
      {triggers.status === 'available' ? (
        <Scoreboard triggers={triggers} />
      ) : (
        <p className={styles.gap}>{triggers.message}</p>
      )}
      {current.status === 'available' ? (
        <BandSentence current={current} symbol={run.symbol} timeframe={run.timeframe} />
      ) : null}
      <p className={styles.promise}>
        <Icon name="info" size={14} />
        <span>
          <strong>{NEXT_CANDLE_TEXT.PROMISE_TITLE}</strong> {SOURCE_TEXT.WEAK_NOTE}
        </span>
      </p>
    </>
  );
}

// "De onde vem a previsão" (RF15): a régua do placar, o voto de cada regra em palavras, o que falta (o mesmo cálculo e as mesmas
// frases do acompanhamento, spec 008) e a faixa em palavras. Só na simulação ao vivo, que é onde há "próxima vela".
export function ProjectionSourceCard({ runId }: { readonly runId: string }): ReactElement {
  const status = useLiveStatusQuery(runId, true);
  const projections = useProjectionsQuery({ runId });
  const live = status.data;
  const current = projections.data?.current;
  return (
    <Card title={SOURCE_TEXT.TITLE} icon="activity">
      {live === undefined || current === undefined ? (
        <p className={controls.muted} role="status">
          {status.isError || projections.isError ? SOURCE_TEXT.ERROR : SOURCE_TEXT.LOADING}
        </p>
      ) : (
        <SourceBody status={live} current={current} />
      )}
    </Card>
  );
}
