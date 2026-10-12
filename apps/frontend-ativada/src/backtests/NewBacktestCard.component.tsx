// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type FormEvent, type ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { formatPercent } from '../format/format.js';
import formStyles from '../forms/Form.module.css';
import { ProblemList, type FormProblem } from '../forms/ProblemList.component.js';
import { Card } from '../layout/Card.component.js';
import { useCreateRunMutation } from '../runs/runs.query.js';
import controls from '../styles/Controls.module.css';
import {
  buildBacktestRequest,
  problemsFromApiError,
  readRiskPerTrade,
  validateBacktestForm,
} from './backtest-form.validation.js';
import { PeriodAndCostFields, StrategyFields } from './BacktestFields.component.js';
import { useBacktestForm, type BacktestForm } from './useBacktestForm.hook.js';

function RiskNote({
  config,
}: {
  readonly config: Record<string, unknown> | undefined;
}): ReactElement | null {
  const risk = config === undefined ? undefined : readRiskPerTrade(config);
  if (risk === undefined) return null;
  return (
    <p className={controls.muted}>
      Risco por operação: {formatPercent(risk)} do saldo (vem da versão da estratégia; mude em
      Estratégias).
    </p>
  );
}

function LoadState({ form }: { readonly form: BacktestForm }): ReactElement | null {
  if (form.isError) {
    return (
      <p role="alert" className={controls.error}>
        Não foi possível carregar suas estratégias. Recarregue a página para tentar de novo.
      </p>
    );
  }
  if (!form.isLoading) return null;
  return (
    <p role="status" aria-label="Carregando estratégias">
      Carregando suas estratégias…
    </p>
  );
}

export function NewBacktestCard(): ReactElement {
  const form = useBacktestForm();
  const navigate = useNavigate();
  const create = useCreateRunMutation();
  const [clientProblems, setClientProblems] = useState<readonly FormProblem[]>([]);
  const problems = clientProblems.length > 0 ? clientProblems : problemsFromApiError(create.error);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const found = validateBacktestForm(form.values);
    setClientProblems(found);
    if (found.length > 0) return;
    create.mutate(buildBacktestRequest(form.values), {
      onSuccess: (run) => void navigate(`/backtests/${run.id}`),
    });
  }

  return (
    <Card title="Novo backtest">
      <form className={formStyles.form} onSubmit={handleSubmit} noValidate>
        <div className={formStyles.grid}>
          <StrategyFields form={form} />
          <PeriodAndCostFields form={form} />
        </div>
        <RiskNote config={form.selectedVersion?.config} />
        <ProblemList problems={problems} />
        <LoadState form={form} />
        <button
          type="submit"
          className={`${controls.button} ${controls.primary}`}
          disabled={create.isPending || form.isLoading || form.isError}
        >
          Rodar backtest
        </button>
      </form>
    </Card>
  );
}
