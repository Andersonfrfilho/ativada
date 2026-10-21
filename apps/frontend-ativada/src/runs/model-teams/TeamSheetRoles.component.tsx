// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { GLOSSARY_TERM } from '../../glossary/glossary.constant.js';
import { Term } from '../../glossary/Term.component.js';
import { MODEL_TEAM_ROLES, RISK_WORD, TREND_WORD } from './model-teams.constant.js';
import type { Recommendation } from './model-teams.validation.js';
import styles from './ModelTeamSheet.module.css';

export const HIDDEN_REASON_PHRASE =
  'O modelo deu um motivo fora das regras de linguagem da casa; o texto foi ocultado.';

type Roles = NonNullable<Recommendation['roles']>;

function headline(
  key: (typeof MODEL_TEAM_ROLES)[number]['key'],
  roles: Roles,
  action: string,
): string {
  if (key === 'trend') return `tendência de ${TREND_WORD[roles.trend.stance]}`;
  if (key === 'risk') return `risco ${RISK_WORD[roles.risk.level]}`;
  return action;
}

function reasonOf(
  key: (typeof MODEL_TEAM_ROLES)[number]['key'],
  roles: Roles,
  isHidden: boolean,
): string {
  if (isHidden) return HIDDEN_REASON_PHRASE;
  return roles[key].reason;
}

// Os TRÊS papéis (RF19), cada um com a sua linha: o gestor dá a indicação; o texto do modelo já passou pela higiene do servidor.
export function TeamSheetRoles({
  recommendation,
}: {
  readonly recommendation: Recommendation;
}): ReactElement | null {
  const { roles } = recommendation;
  if (roles === null) return null;
  const action = recommendation.actionLabel ?? 'esperar';
  return (
    <>
      <p className={styles.sectionTitle}>
        <Term term={GLOSSARY_TERM.TEAM_ROLE}>Três papéis</Term> da leitura
      </p>
      <ul className={styles.roles} aria-label="Os três papéis">
        {MODEL_TEAM_ROLES.map((role) => (
          <li key={role.key}>
            <strong>
              {role.label}: {headline(role.key, roles, action)}
            </strong>
            <span>{reasonOf(role.key, roles, recommendation.isReasonHidden)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
