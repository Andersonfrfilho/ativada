// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Term } from '../glossary/Term.component.js';
import type { GlossaryTerm } from '../glossary/glossary.constant.js';

export type MetricLabelProps = {
  readonly label: string;
  readonly term: GlossaryTerm | undefined;
};

// O rótulo de sempre; se a métrica está no glossário, ganha o botão "?" com a frase.
export function MetricLabel({ label, term }: MetricLabelProps): ReactElement {
  if (term === undefined) return <>{label}</>;
  return <Term term={term}>{label}</Term>;
}
