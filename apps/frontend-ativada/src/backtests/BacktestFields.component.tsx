// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useAppConfig } from '../app/useAppContext.hook.js';
import { formatSymbol } from '../format/format.js';
import { SelectField, TextField } from '../forms/Fields.component.js';
import { TIMEFRAMES } from '../runs/run.constant.js';
import type { BacktestForm } from './useBacktestForm.hook.js';

export function StrategyFields({ form }: { readonly form: BacktestForm }): ReactElement {
  const { marketSymbols } = useAppConfig();
  const { values, update } = form;
  return (
    <>
      <SelectField
        id="bt-strategy"
        label="Estratégia"
        value={values.strategyId}
        options={form.strategies.map((s) => ({ value: s.id, label: s.name }))}
        onChange={(strategyId) => update({ strategyId, versionId: '' })}
      />
      <SelectField
        id="bt-version"
        label="Versão"
        value={values.versionId}
        options={form.versions.map((v) => ({ value: v.id, label: `versão ${v.version}` }))}
        onChange={(versionId) => update({ versionId })}
      />
      <SelectField
        id="bt-symbol"
        label="Par"
        value={values.symbol}
        options={marketSymbols.map((symbol) => ({ value: symbol, label: formatSymbol(symbol) }))}
        onChange={(symbol) => update({ symbol })}
      />
      <SelectField
        id="bt-timeframe"
        label="Timeframe"
        value={values.timeframe}
        options={TIMEFRAMES.map((timeframe) => ({ value: timeframe, label: timeframe }))}
        onChange={(timeframe) => update({ timeframe })}
      />
    </>
  );
}

export function PeriodAndCostFields({ form }: { readonly form: BacktestForm }): ReactElement {
  const { values, update } = form;
  return (
    <>
      <TextField
        id="bt-start"
        label="Início"
        type="date"
        value={values.start}
        onChange={(start) => update({ start })}
      />
      <TextField
        id="bt-end"
        label="Fim"
        type="date"
        value={values.end}
        onChange={(end) => update({ end })}
      />
      <TextField
        id="bt-balance"
        label="Capital inicial"
        value={values.initialBalance}
        onChange={(initialBalance) => update({ initialBalance })}
      />
      <TextField
        id="bt-fee"
        label="Taxa por ordem"
        value={values.feeRate}
        onChange={(feeRate) => update({ feeRate })}
      />
      <TextField
        id="bt-slippage"
        label="Slippage"
        value={values.slippageRate}
        onChange={(slippageRate) => update({ slippageRate })}
      />
    </>
  );
}
