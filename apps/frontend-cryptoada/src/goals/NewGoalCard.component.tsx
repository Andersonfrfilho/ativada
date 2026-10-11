// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type FormEvent, type ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { useAppConfig } from '../app/useAppContext.hook.js';
import { formatSymbol } from '../format/format.js';
import formStyles from '../forms/Form.module.css';
import { SelectField, TextField } from '../forms/Fields.component.js';
import { ProblemList, type FormProblem } from '../forms/ProblemList.component.js';
import { Card } from '../layout/Card.component.js';
import controls from '../styles/Controls.module.css';
import {
  DEFAULT_HORIZON_DAYS,
  DEFAULT_MAX_LOSS_PERCENT,
  DEFAULT_TARGET_PERCENT,
} from './goal.constant.js';
import {
  buildGoalRequest,
  problemsFromGoalError,
  validateGoalForm,
  type GoalFormValues,
} from './goal-form.validation.js';
import { useCreateGoalMutation } from './goal.query.js';

type GoalFieldsProps = {
  readonly values: GoalFormValues;
  readonly symbols: readonly string[];
  readonly onChange: (patch: Partial<GoalFormValues>) => void;
};

function GoalFields({ values, symbols, onChange }: GoalFieldsProps): ReactElement {
  return (
    <div className={formStyles.grid}>
      <SelectField
        id="goal-symbol"
        label="Par"
        value={values.symbol}
        options={symbols.map((symbol) => ({ value: symbol, label: formatSymbol(symbol) }))}
        onChange={(symbol) => onChange({ symbol })}
      />
      <TextField
        id="goal-target"
        label="Retorno alvo (%)"
        value={values.targetPercent}
        onChange={(targetPercent) => onChange({ targetPercent })}
      />
      <TextField
        id="goal-horizon"
        label="Prazo (dias)"
        value={values.horizonDays}
        onChange={(horizonDays) => onChange({ horizonDays })}
      />
      <TextField
        id="goal-max-loss"
        label="Perda máxima (%)"
        value={values.maxLossPercent}
        onChange={(maxLossPercent) => onChange({ maxLossPercent })}
      />
    </div>
  );
}

type GoalForm = {
  readonly values: GoalFormValues;
  readonly problems: readonly FormProblem[];
  readonly isPending: boolean;
  readonly update: (patch: Partial<GoalFormValues>) => void;
  readonly handleSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function useGoalForm(): GoalForm {
  const { marketSymbols } = useAppConfig();
  const navigate = useNavigate();
  const create = useCreateGoalMutation();
  const [edits, setEdits] = useState<Partial<GoalFormValues>>({});
  const [clientProblems, setClientProblems] = useState<readonly FormProblem[]>([]);
  const values: GoalFormValues = {
    symbol: marketSymbols[0] ?? '',
    targetPercent: DEFAULT_TARGET_PERCENT,
    horizonDays: DEFAULT_HORIZON_DAYS,
    maxLossPercent: DEFAULT_MAX_LOSS_PERCENT,
    ...edits,
  };
  return {
    values,
    problems: clientProblems.length > 0 ? clientProblems : problemsFromGoalError(create.error),
    isPending: create.isPending,
    update: (patch) => setEdits((current) => ({ ...current, ...patch })),
    handleSubmit: (event): void => {
      event.preventDefault();
      const found = validateGoalForm(values);
      setClientProblems(found);
      if (found.length > 0) return;
      create.mutate(buildGoalRequest(values), {
        onSuccess: (goal) => void navigate(`/metas/${goal.id}`),
      });
    },
  };
}

export function NewGoalCard(): ReactElement {
  const { marketSymbols } = useAppConfig();
  const form = useGoalForm();
  return (
    <Card title="Nova meta">
      <p className={controls.muted}>
        Diga quanto quer ganhar, em quanto tempo e quanto aceita perder. O painel mostra o que cada
        estratégia teria feito com isso no passado.
      </p>
      <form className={formStyles.form} onSubmit={form.handleSubmit} noValidate>
        <GoalFields values={form.values} symbols={marketSymbols} onChange={form.update} />
        <ProblemList problems={form.problems} />
        <button
          type="submit"
          className={`${controls.button} ${controls.primary}`}
          disabled={form.isPending}
        >
          Declarar meta
        </button>
      </form>
    </Card>
  );
}
