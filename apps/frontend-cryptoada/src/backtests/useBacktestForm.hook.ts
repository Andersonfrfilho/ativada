// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState } from 'react';

import { useAppConfig } from '../app/useAppContext.hook.js';
import { useStrategiesQuery, useVersionsQuery } from '../strategies/strategy.query.js';
import type { Strategy, StrategyVersion } from '../strategies/strategy.validation.js';
import { defaultFormValues, type BacktestFormValues } from './backtest-form.validation.js';

export type BacktestForm = {
  readonly values: BacktestFormValues;
  readonly strategies: readonly Strategy[];
  readonly versions: readonly StrategyVersion[];
  readonly selectedVersion: StrategyVersion | undefined;
  readonly update: (patch: Partial<BacktestFormValues>) => void;
  // O envio só vale com a estratégia e a versão lidas: antes disso (ou com a leitura falha) o botão fica desligado.
  readonly isLoading: boolean;
  readonly isError: boolean;
};

// A estratégia e a versão escolhidas são DERIVADAS: sem escolha do usuário valem a primeira estratégia e a versão mais nova.
export function useBacktestForm(): BacktestForm {
  const { marketSymbols } = useAppConfig();
  const [edits, setEdits] = useState<Partial<BacktestFormValues>>({});
  const strategiesQuery = useStrategiesQuery();
  const strategies = strategiesQuery.data ?? [];
  const strategyId = edits.strategyId ?? strategies[0]?.id ?? '';
  const versionsQuery = useVersionsQuery(strategyId);
  const versions = versionsQuery.data ?? [];
  const selectedVersion = versions.find((version) => version.id === edits.versionId) ?? versions[0];
  const values: BacktestFormValues = {
    ...defaultFormValues(Date.now(), marketSymbols[0] ?? ''),
    ...edits,
    strategyId,
    versionId: selectedVersion?.id ?? '',
  };
  return {
    values,
    strategies,
    versions,
    selectedVersion,
    update: (patch) => setEdits((current) => ({ ...current, ...patch })),
    isLoading: strategiesQuery.isPending || (strategyId !== '' && versionsQuery.isPending),
    isError: strategiesQuery.isError || versionsQuery.isError,
  };
}
