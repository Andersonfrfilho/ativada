// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useAppConfig } from '../app/useAppContext.hook.js';
import { formatSymbol } from '../format/format.js';
import { SelectField, TextField } from '../forms/Fields.component.js';
import { TIMEFRAMES } from '../runs/run.constant.js';
import type { WalkForwardFormValues } from './walk-forward-form.validation.js';

export type WalkForwardFieldsProps = {
  readonly values: WalkForwardFormValues;
  readonly onChange: (patch: Partial<WalkForwardFormValues>) => void;
};

export function WalkForwardFields({ values, onChange }: WalkForwardFieldsProps): ReactElement {
  const { marketSymbols } = useAppConfig();
  return (
    <>
      <SelectField
        id="wf-symbol"
        label="Par do walk-forward"
        value={values.symbol}
        options={marketSymbols.map((symbol) => ({ value: symbol, label: formatSymbol(symbol) }))}
        onChange={(symbol) => onChange({ symbol })}
      />
      <SelectField
        id="wf-timeframe"
        label="Timeframe do walk-forward"
        value={values.timeframe}
        options={TIMEFRAMES.map((timeframe) => ({ value: timeframe, label: timeframe }))}
        onChange={(timeframe) => onChange({ timeframe })}
      />
      <TextField
        id="wf-start"
        label="Início do walk-forward"
        type="date"
        value={values.start}
        onChange={(start) => onChange({ start })}
      />
      <TextField
        id="wf-end"
        label="Fim do walk-forward"
        type="date"
        value={values.end}
        onChange={(end) => onChange({ end })}
      />
    </>
  );
}
