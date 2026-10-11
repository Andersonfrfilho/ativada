// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type FormEvent, type ReactElement } from 'react';

import { useAppConfig } from '../app/useAppContext.hook.js';
import { formatSymbol } from '../format/format.js';
import formStyles from '../forms/Form.module.css';
import { SelectField, TextField } from '../forms/Fields.component.js';
import { ProblemList, type FormProblem } from '../forms/ProblemList.component.js';
import controls from '../styles/Controls.module.css';
import { useCreatePriceAlertMutation } from './alerts.query.js';
import {
  normalizeDecimalText,
  validatePriceAlertForm,
  type PriceAlertFormValues,
} from './price-alert-form.validation.js';

const DIRECTION_OPTIONS = [
  { value: 'above', label: 'subir acima de' },
  { value: 'below', label: 'cair abaixo de' },
] as const;

type PriceAlertForm = {
  readonly values: PriceAlertFormValues;
  readonly problems: readonly FormProblem[];
  readonly isPending: boolean;
  readonly update: (patch: Partial<PriceAlertFormValues>) => void;
  readonly handleSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function usePriceAlertForm(): PriceAlertForm {
  const { marketSymbols } = useAppConfig();
  const create = useCreatePriceAlertMutation();
  const [edits, setEdits] = useState<Partial<PriceAlertFormValues>>({});
  const [problems, setProblems] = useState<readonly FormProblem[]>([]);
  const values: PriceAlertFormValues = {
    symbol: marketSymbols[0] ?? '',
    direction: 'above',
    value: '',
    ...edits,
  };
  return {
    values,
    problems,
    isPending: create.isPending,
    update: (patch) => setEdits((current) => ({ ...current, ...patch })),
    handleSubmit: (event): void => {
      event.preventDefault();
      const found = validatePriceAlertForm(values);
      setProblems(found);
      if (found.length > 0) return;
      create.mutate(
        { ...values, value: normalizeDecimalText(values.value), origin: 'manual' },
        { onSuccess: () => setEdits((current) => ({ ...current, value: '' })) },
      );
    },
  };
}

export function NewPriceAlertForm(): ReactElement {
  const { marketSymbols } = useAppConfig();
  const form = usePriceAlertForm();
  return (
    <form className={formStyles.form} onSubmit={form.handleSubmit} noValidate>
      <div className={formStyles.grid}>
        <SelectField
          id="alert-symbol"
          label="Par do alerta"
          value={form.values.symbol}
          options={marketSymbols.map((symbol) => ({ value: symbol, label: formatSymbol(symbol) }))}
          onChange={(symbol) => form.update({ symbol })}
        />
        <SelectField
          id="alert-direction"
          label="Quando o preço"
          value={form.values.direction}
          options={DIRECTION_OPTIONS}
          onChange={(direction) =>
            form.update({ direction: direction === 'below' ? 'below' : 'above' })
          }
        />
        <TextField
          id="alert-value"
          label="Valor do alerta"
          value={form.values.value}
          onChange={(value) => form.update({ value })}
        />
      </div>
      <ProblemList problems={form.problems} />
      <button type="submit" className={controls.button} disabled={form.isPending}>
        Criar alerta
      </button>
    </form>
  );
}
