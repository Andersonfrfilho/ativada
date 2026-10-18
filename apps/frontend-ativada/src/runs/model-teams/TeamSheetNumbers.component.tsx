// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { GLOSSARY_TERM } from '../../glossary/glossary.constant.js';
import { Term } from '../../glossary/Term.component.js';
import type { RunModelTeams, TeamState } from './model-teams.validation.js';
import { describeFailures, describeScoreboard, formatUsd } from './team-sheet-text.js';

export type TeamSheetNumbersProps = {
  readonly state: TeamState;
  readonly costNotice: RunModelTeams['costNotice'];
};

// Acertos de lado com Wilson, custo de hoje e do mês e taxa de falha (RF19). O acerto é a régua; o retorno só informa.
export function TeamSheetNumbers({ state, costNotice }: TeamSheetNumbersProps): ReactElement {
  const score = describeScoreboard(state.scoreboard);
  const isFew = state.scoreboard.verdict === 'too_few';
  return (
    <ul>
      <li>
        <Term term={GLOSSARY_TERM.SIDE_HIT_RATE}>Acertos de lado</Term> (
        {state.scoreboard.sinceDays} dias): {score.headline}
      </li>
      <li>
        {isFew ? <Term term={GLOSSARY_TERM.IN_OBSERVATION}>{score.verdict}</Term> : score.verdict}
      </li>
      {score.range === undefined ? null : (
        <li>
          <Term term={GLOSSARY_TERM.CONFIDENCE_INTERVAL}>{score.range}</Term>
        </li>
      )}
      <li>
        <Term term={GLOSSARY_TERM.ESTIMATED_COST}>Custo estimado</Term>: hoje{' '}
        {formatUsd(state.cost.todayUsd)} · mês {formatUsd(state.cost.monthUsd)}
      </li>
      <li>{costNotice}</li>
      <li>{describeFailures(state.failures)}</li>
    </ul>
  );
}
