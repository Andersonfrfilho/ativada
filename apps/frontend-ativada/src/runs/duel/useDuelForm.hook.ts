// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState } from 'react';

import { useAppConfig } from '../../app/useAppContext.hook.js';
import { useStrategiesQuery, useVersionsQuery } from '../../strategies/strategy.query.js';
import type { ModelTeamKey } from '../model-teams/model-teams.constant.js';
import type { CreateDuelBody } from './duel.validation.js';

const DEFAULT_BALANCE = '10000';
const DECIMAL = /^\d+(\.\d+)?$/;

export type DuelForm = {
  readonly symbol: string;
  readonly balance: string;
  readonly picked: readonly ModelTeamKey[];
  readonly withRules: boolean;
  // A estratégia de regras do usuário que entra no duelo (a primeira da lista, na versão mais nova); `undefined` = não há.
  readonly rulesVersionId: string | undefined;
  readonly isBalanceValid: boolean;
  readonly canSubmit: boolean;
  readonly toggleTeam: (team: ModelTeamKey) => void;
  readonly setSymbol: (symbol: string) => void;
  readonly setBalance: (balance: string) => void;
  readonly setWithRules: (withRules: boolean) => void;
  readonly toBody: () => CreateDuelBody;
};

export function useDuelForm(): DuelForm {
  const { marketSymbols } = useAppConfig();
  const [edits, setEdits] = useState<{ symbol?: string; balance?: string; withRules?: boolean }>(
    {},
  );
  const [picked, setPicked] = useState<readonly ModelTeamKey[]>([]);
  const strategies = useStrategiesQuery().data ?? [];
  const versions = useVersionsQuery(strategies[0]?.id ?? '').data ?? [];
  const rulesVersionId = versions[0]?.id;
  const symbol = edits.symbol ?? marketSymbols[0] ?? '';
  const balance = edits.balance ?? DEFAULT_BALANCE;
  const withRules = (edits.withRules ?? false) && rulesVersionId !== undefined;
  const isBalanceValid = DECIMAL.test(balance);
  return {
    symbol,
    balance,
    picked,
    withRules,
    rulesVersionId,
    isBalanceValid,
    canSubmit: picked.length > 0 && isBalanceValid && symbol !== '',
    toggleTeam: (team) =>
      setPicked((current) =>
        current.includes(team) ? current.filter((item) => item !== team) : [...current, team],
      ),
    setSymbol: (next) => setEdits((current) => ({ ...current, symbol: next })),
    setBalance: (next) => setEdits((current) => ({ ...current, balance: next })),
    setWithRules: (next) => setEdits((current) => ({ ...current, withRules: next })),
    toBody: () => ({
      symbol,
      startingBalance: balance,
      teams: picked,
      ...(withRules && rulesVersionId !== undefined
        ? { withMyStrategy: { strategyVersionId: rulesVersionId } }
        : {}),
    }),
  };
}
