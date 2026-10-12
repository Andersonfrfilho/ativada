// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type FormEvent, type ReactElement } from 'react';

import { useAppConfig } from '../app/useAppContext.hook.js';
import { formatSymbol } from '../format/format.js';
import formStyles from '../forms/Form.module.css';
import { SelectField, TextField } from '../forms/Fields.component.js';
import { ProblemList, type FormProblem } from '../forms/ProblemList.component.js';
import { Card } from '../layout/Card.component.js';
import controls from '../styles/Controls.module.css';
import { ASSET_OPERATION, OPERATION_OPTIONS, type AssetOperation } from './asset.constant.js';
import {
  messageFromAssetError,
  normalizeAssetForm,
  priceLabel,
  validateAssetForm,
  type AssetFormValues,
} from './asset-form.validation.js';
import { useAssetOperationMutation } from './asset.query.js';

function toOperation(value: string): AssetOperation {
  return OPERATION_OPTIONS.find((option) => option.value === value)?.value ?? ASSET_OPERATION.BUY;
}

type OperationForm = {
  readonly values: AssetFormValues;
  readonly problems: readonly FormProblem[];
  readonly update: (patch: Partial<AssetFormValues>) => void;
  readonly submit: () => void;
  readonly mutation: ReturnType<typeof useAssetOperationMutation>;
};

function useOperationForm(): OperationForm {
  const { marketSymbols } = useAppConfig();
  const mutation = useAssetOperationMutation();
  const [edits, setEdits] = useState<Partial<AssetFormValues>>({});
  const [problems, setProblems] = useState<readonly FormProblem[]>([]);
  const values: AssetFormValues = {
    operation: ASSET_OPERATION.BUY,
    symbol: marketSymbols[0] ?? '',
    quantity: '',
    price: '',
    ...edits,
  };
  return {
    values,
    problems,
    mutation,
    update: (patch) => setEdits((current) => ({ ...current, ...patch })),
    submit: (): void => {
      const found = validateAssetForm(values);
      setProblems(found);
      if (found.length > 0) return;
      mutation.mutate(normalizeAssetForm(values), {
        onSuccess: () => setEdits((current) => ({ ...current, quantity: '', price: '' })),
      });
    },
  };
}

function OperationFields({ form }: { readonly form: OperationForm }): ReactElement {
  const { marketSymbols } = useAppConfig();
  const label = priceLabel(form.values.operation);
  return (
    <div className={formStyles.grid}>
      <SelectField
        id="asset-operation"
        label="Operação"
        value={form.values.operation}
        options={OPERATION_OPTIONS}
        onChange={(operation) => form.update({ operation: toOperation(operation) })}
      />
      <SelectField
        id="asset-symbol"
        label="Par"
        value={form.values.symbol}
        options={marketSymbols.map((symbol) => ({ value: symbol, label: formatSymbol(symbol) }))}
        onChange={(symbol) => form.update({ symbol })}
      />
      <TextField
        id="asset-quantity"
        label="Quantidade"
        value={form.values.quantity}
        onChange={(quantity) => form.update({ quantity })}
      />
      {label === undefined ? null : (
        <TextField
          id="asset-price"
          label={label}
          value={form.values.price}
          onChange={(price) => form.update({ price })}
        />
      )}
    </div>
  );
}

export function OperationCard(): ReactElement {
  const form = useOperationForm();
  const message = messageFromAssetError(form.mutation.error);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    form.submit();
  }

  return (
    <Card title="Registrar operação">
      <form className={formStyles.form} onSubmit={handleSubmit} noValidate>
        <OperationFields form={form} />
        <ProblemList problems={form.problems} />
        <button
          type="submit"
          className={`${controls.button} ${controls.primary}`}
          disabled={form.mutation.isPending}
        >
          Registrar
        </button>
      </form>
      {form.mutation.isSuccess ? <p role="status">Operação registrada.</p> : null}
      {message === undefined ? null : (
        <p role="alert" className={controls.error}>
          {message}
        </p>
      )}
    </Card>
  );
}
