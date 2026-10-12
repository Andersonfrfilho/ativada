// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import formStyles from '../forms/Form.module.css';
import { ProblemList } from '../forms/ProblemList.component.js';
import { Card } from '../layout/Card.component.js';
import controls from '../styles/Controls.module.css';
import { tunableLeaves } from './config-leaves.js';
import { GridRows } from './GridRows.component.js';
import { WalkForwardFields } from './WalkForwardFields.component.js';
import { countCombinations, MAX_COMBINATIONS } from './walk-forward-form.validation.js';
import { useWalkForwardForm } from './useWalkForwardForm.hook.js';
import type { StrategyVersion } from './strategy.validation.js';

export type WalkForwardCardProps = { readonly version: StrategyVersion };

// Pede o walk-forward da versão mais nova: o relatório principal é o fora da amostra, com o alerta de sobreajuste.
export function WalkForwardCard({ version }: WalkForwardCardProps): ReactElement {
  const form = useWalkForwardForm(version);
  return (
    <Card title="Walk-forward">
      <form className={formStyles.form} onSubmit={form.submit} noValidate>
        <p className={controls.muted}>
          Testa cada combinação da grade em janelas móveis de ajuste e de teste e relata só o
          resultado fora da amostra. Versão usada: versão {version.version}.
        </p>
        <GridRows
          rows={form.values.rows}
          options={tunableLeaves(form.leaves)}
          onChange={(rows) => form.patch({ rows })}
        />
        <p className={controls.muted}>
          {countCombinations(form.values.rows)} combinações (teto {MAX_COMBINATIONS}).
        </p>
        <div className={formStyles.grid}>
          <WalkForwardFields values={form.values} onChange={form.patch} />
        </div>
        <ProblemList problems={form.problems} />
        <button
          type="submit"
          className={`${controls.button} ${controls.primary}`}
          disabled={form.isPending}
        >
          Pedir walk-forward
        </button>
      </form>
    </Card>
  );
}
