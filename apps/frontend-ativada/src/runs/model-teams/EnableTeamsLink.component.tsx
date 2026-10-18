// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Link, useInRouterContext } from 'react-router';

import styles from './EnableTeamsLink.module.css';

export const ENABLE_TEAMS_PATH = '/conta#equipes';
export const ENABLE_TEAMS_TEXT = 'Equipes de modelo (desligadas) · ligar em Conta';

// A única pista quando NENHUMA equipe de modelo está ligada: uma linha discreta que leva a Conta, onde se liga cada uma.
// Dentro do app é navegação do roteador; fora dele (uma peça montada sozinha) é um link comum.
export function EnableTeamsLink(): ReactElement {
  const isInRouter = useInRouterContext();
  return isInRouter ? (
    <Link className={styles.link} to={ENABLE_TEAMS_PATH}>
      {ENABLE_TEAMS_TEXT}
    </Link>
  ) : (
    <a className={styles.link} href={ENABLE_TEAMS_PATH}>
      {ENABLE_TEAMS_TEXT}
    </a>
  );
}
