// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import controls from '../styles/Controls.module.css';

export type FormProblem = { readonly field: string; readonly message: string };

export type ProblemListProps = { readonly problems: readonly FormProblem[] };

// Todos os problemas de uma vez, cada um com o nome do campo, num alerta só.
export function ProblemList({ problems }: ProblemListProps): ReactElement | null {
  if (problems.length === 0) return null;
  return (
    <div role="alert" className={controls.error}>
      <p>Confira os campos:</p>
      <ul>
        {problems.map((problem) => (
          <li key={`${problem.field}:${problem.message}`}>
            <strong>{problem.field}</strong>: {problem.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
