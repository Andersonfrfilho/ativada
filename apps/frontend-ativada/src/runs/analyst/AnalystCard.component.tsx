// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import { Term } from '../../glossary/Term.component.js';
import { Card } from '../../layout/Card.component.js';
import { useClock } from '../../live/useClock.hook.js';
import controls from '../../styles/Controls.module.css';
import { formatClosingMoment } from '../live-tracking/decision-text.js';
import { CHIP_TONE, StatusChip } from '../live-tracking/StatusChip.component.js';
import { AnalystFacts } from './AnalystFacts.component.js';
import { AnalystGoalProgress } from './AnalystGoalProgress.component.js';
import { AnalystLocks } from './AnalystLocks.component.js';
import { AnalystTeamTable } from './AnalystTeamTable.component.js';
import styles from './Analyst.module.css';
import { ANALYST_TEXT } from './analyst.constant.js';
import { useAnalystQuery } from './analyst.query.js';
import type { Analyst, DecidedAnalystDecision } from './analyst.validation.js';
import { PostureChip } from './PostureChip.component.js';
import { ShadowSeal } from './ShadowSeal.component.js';

const CLOCK_MILLISECONDS = 60_000;

// "Sem previsão": os especialistas que provaram valor não apontam um lado nesta vela (o motivo vem na frase do servidor).
function NoForecastChip({
  decision,
}: {
  readonly decision: DecidedAnalystDecision;
}): ReactElement | null {
  const reason = decision.forecast.noForecastReason;
  if (reason === null || reason === 'no_data') return null;
  return (
    <StatusChip tone={CHIP_TONE.NEUTRAL} icon="info">
      <Term term="noForecast">{ANALYST_TEXT.NO_FORECAST}</Term>
    </StatusChip>
  );
}

// As frases do servidor: a postura, o motivo, o ritmo, a janela de entrada e a saída por tempo.
function DecisionLines({ decision }: { readonly decision: DecidedAnalystDecision }): ReactElement {
  return (
    <>
      <p className={styles.message}>{decision.message}</p>
      <p className={styles.reason}>{decision.reasonMessage}</p>
      {decision.offCadenceMessage === null ? null : (
        <p className={styles.reason}>{decision.offCadenceMessage}</p>
      )}
      {decision.cadenceLine === null ? null : (
        <p className={styles.reason}>{decision.cadenceLine}</p>
      )}
      {decision.timeExitMessage === null ? null : (
        <p className={styles.note}>{decision.timeExitMessage}</p>
      )}
    </>
  );
}

function Decided({
  decision,
  analyst,
}: {
  readonly decision: DecidedAnalystDecision;
  readonly analyst: Analyst;
}): ReactElement {
  const timeZone = useUserTimeZone();
  const now = useClock(CLOCK_MILLISECONDS);
  const closedText = formatClosingMoment(decision.closedAt, { now, timeZone });
  return (
    <div className={styles.stack}>
      <div className={styles.headline}>
        <span className={styles.headlineLabel}>
          <Term term="posture">{ANALYST_TEXT.POSTURE}</Term>
        </span>
        <PostureChip decision={decision} />
        <NoForecastChip decision={decision} />
        <span className={styles.headlineMoment}>
          {ANALYST_TEXT.CLOSED_AT} {closedText}
        </span>
      </div>
      <DecisionLines decision={decision} />
      <AnalystFacts decision={decision} />
      <AnalystGoalProgress progress={analyst.goalProgress} />
      <AnalystTeamTable specialists={decision.specialists} />
      <AnalystLocks locks={analyst.locks} />
      <p className={styles.disclaimer}>{decision.disclaimer}</p>
    </div>
  );
}

function Unavailable({ analyst }: { readonly analyst: Analyst }): ReactElement | null {
  const { current } = analyst;
  if (current.status !== 'unavailable') return null;
  return (
    <div className={styles.stack}>
      <div className={styles.headline}>
        <StatusChip tone={CHIP_TONE.NEUTRAL} icon="info">
          {ANALYST_TEXT.FAILED_WORD}
        </StatusChip>
      </div>
      <p className={styles.message} role="status">
        {current.message}
      </p>
      <AnalystLocks locks={analyst.locks} />
    </div>
  );
}

function Body({ analyst }: { readonly analyst: Analyst }): ReactElement {
  const { current } = analyst;
  return current.status === 'decided' ? (
    <Decided decision={current} analyst={analyst} />
  ) : (
    <Unavailable analyst={analyst} />
  );
}

// O cartão "Analista de risco" (spec 007): a postura, o ritmo, o tamanho e o porquê, a equipe com o auditor e as travas. Em
// sombra o analista só observa. Sem analista na simulação o cartão nem aparece.
export function AnalystCard({ runId }: { readonly runId: string }): ReactElement | null {
  const query = useAnalystQuery(runId);
  const snapshot = query.data;
  if (snapshot === undefined) {
    if (!query.isError) {
      return (
        <Card title={ANALYST_TEXT.TITLE} icon="activity">
          <p className={controls.muted} role="status">
            {ANALYST_TEXT.LOADING}
          </p>
        </Card>
      );
    }
    return (
      <Card title={ANALYST_TEXT.TITLE} icon="activity">
        <p className={controls.error} role="alert">
          {ANALYST_TEXT.ERROR}
        </p>
        <button type="button" className={controls.button} onClick={() => void query.refetch()}>
          {ANALYST_TEXT.RETRY}
        </button>
      </Card>
    );
  }
  if (!snapshot.isEnabled) return null;
  const { analyst } = snapshot;
  return (
    <Card
      title={ANALYST_TEXT.TITLE}
      icon="activity"
      aside={analyst.mode === 'shadow' ? <ShadowSeal /> : undefined}
    >
      <Body analyst={analyst} />
    </Card>
  );
}
