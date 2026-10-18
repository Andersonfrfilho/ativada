// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, type ReactElement } from 'react';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import { formatTimeInZone } from '../../format/zoned-time.js';
import { GLOSSARY_TERM } from '../../glossary/glossary.constant.js';
import { Term } from '../../glossary/Term.component.js';
import controls from '../../styles/Controls.module.css';
import { useAnalystQuery } from '../analyst/analyst.query.js';
import { useLiveStatusQuery } from '../live-tracking/live-status.query.js';
import { useRequestOpinionMutation } from './model-teams.query.js';
import type { Recommendation } from './model-teams.validation.js';
import styles from './ModelTeamSheet.module.css';
import { describeOpinionError, ON_DEMAND_TEXT, whyOnDemandBlocked } from './on-demand-text.js';
import { describeLevels } from './team-sheet-text.js';
import type { ModelTeamsView, TeamCardModel } from './useModelTeamsView.hook.js';

function ResultLine({ report }: { readonly report: Recommendation }): ReactElement {
  const timeZone = useUserTimeZone();
  if (report.status === 'pending') return <li>{ON_DEMAND_TEXT.WAITING}</li>;
  if (report.status !== 'decided') {
    return (
      <li>
        {ON_DEMAND_TEXT.FAILED} {report.failureCode ?? '—'}
      </li>
    );
  }
  return (
    <li>
      <strong>{report.actionLabel ?? 'esperar'}</strong> (vela das{' '}
      {formatTimeInZone(report.closedAt, timeZone)})
      {report.levels === null ? null : <> · {describeLevels(report.levels)}</>}
      {report.roles === null || report.isReasonHidden ? null : (
        <> · {report.roles.decision.reason}</>
      )}
      {report.isReasonHidden ? <> · {ON_DEMAND_TEXT.HIDDEN}</> : null}
    </li>
  );
}

// Os pedidos avulsos desta equipe, marcados e fora do placar (RF20): nunca comandam ordem.
function OnDemandResults({ card }: { readonly card: TeamCardModel }): ReactElement | null {
  const reports = card.state?.onDemand ?? [];
  if (reports.length === 0) return null;
  return (
    <div>
      <p className={styles.sectionTitle}>
        <Term term={GLOSSARY_TERM.ON_DEMAND}>{ON_DEMAND_TEXT.MARK}</Term>
      </p>
      <ul>
        {reports.map((report) => (
          <ResultLine key={report.id} report={report} />
        ))}
      </ul>
    </div>
  );
}

export type OnDemandButtonProps = {
  readonly card: TeamCardModel;
  readonly view: ModelTeamsView;
};

// "Pedir opinião agora": um relatório avulso sobre a última vela fechada. Desabilitado, mostra a frase do motivo.
export function OnDemandButton({ card, view }: OnDemandButtonProps): ReactElement | null {
  const reasonId = useId();
  const { runId } = view;
  const request = useRequestOpinionMutation();
  const live = useLiveStatusQuery(runId ?? '', runId !== undefined);
  const analyst = useAnalystQuery(runId ?? '');
  if (runId === undefined || view.status !== 'ready') return null;
  const reason = whyOnDemandBlocked({
    card,
    isRunning: live.data === undefined ? undefined : live.data.run.status === 'running',
    hasAnalyst: analyst.data?.isEnabled,
    isPending: request.isPending || card.latest?.status === 'pending',
  });
  return (
    <div>
      <button
        type="button"
        className={controls.button}
        disabled={reason !== undefined}
        aria-describedby={reason === undefined ? undefined : reasonId}
        onClick={() => request.mutate({ runId, teamKey: card.key })}
      >
        {ON_DEMAND_TEXT.BUTTON}
      </button>
      {reason === undefined ? null : (
        <p id={reasonId} className={styles.footer}>
          {reason}
        </p>
      )}
      {request.isError ? (
        <p role="alert" className={styles.footer}>
          {describeOpinionError(request.error)}
        </p>
      ) : null}
      <OnDemandResults card={card} />
    </div>
  );
}
