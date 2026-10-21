// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import styles from './Analyst.module.css';
import type { AnalystGoalProgress as GoalProgress } from './analyst.validation.js';

// A meta somada: o resultado das operações soma no saldo; a frase vem pronta do servidor.
export function AnalystGoalProgress({
  progress,
}: {
  readonly progress: GoalProgress | null;
}): ReactElement | null {
  return progress === null ? null : <p className={styles.note}>{progress.message}</p>;
}
