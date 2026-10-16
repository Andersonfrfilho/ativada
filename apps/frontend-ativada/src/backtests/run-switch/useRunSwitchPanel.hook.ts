// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type KeyboardEvent } from 'react';

import { useAppConfig } from '../../app/useAppContext.hook.js';
import { useVersionIndexQuery } from '../../strategies/strategy.query.js';
import { describeLookup, lookupVersion } from '../../strategies/version-index.js';
import { readRecentRuns } from './recent-runs.js';
import {
  buildSections,
  flattenOptions,
  type SwitchOption,
  type SwitchSection,
} from './run-switch-options.js';
import { nextActiveIndex } from './run-switch-order.js';
import { useRunSwitchLists, type SwitchLists } from './useRunSwitchLists.hook.js';

export type RunSwitchPanelInput = {
  readonly currentId: string;
  readonly onSelect: (runId: string) => void;
  readonly onClose: () => void;
};

export type RunSwitchPanelModel = {
  readonly symbols: readonly string[];
  readonly symbol: string | undefined;
  readonly query: string;
  readonly sections: readonly SwitchSection[];
  readonly optionCount: number;
  readonly active: SwitchOption | undefined;
  readonly data: SwitchLists;
  readonly setSymbol: (symbol: string | undefined) => void;
  readonly setQuery: (query: string) => void;
  readonly activate: (option: SwitchOption) => void;
  readonly handleInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
};

type SectionsInput = {
  readonly lists: SwitchLists['lists'];
  readonly query: string;
  readonly currentId: string;
};

// As "Recentes" são lidas uma vez ao abrir a lista; o nome da estratégia vem do índice de versões (uma consulta só).
function useSwitchSections(input: SectionsInput): readonly SwitchSection[] {
  const index = useVersionIndexQuery();
  const [recents] = useState(() => readRecentRuns());
  return buildSections({
    ...input,
    recents,
    describeStrategy: (versionId) => describeLookup(lookupVersion(index, versionId)),
  });
}

function useSearchState(): {
  readonly symbol: string | undefined;
  readonly query: string;
  readonly activeIndex: number;
  readonly setSymbol: (symbol: string | undefined) => void;
  readonly setQuery: (query: string) => void;
  readonly setActiveIndex: (index: number) => void;
} {
  const [symbol, setSymbolState] = useState<string | undefined>(undefined);
  const [query, setQueryState] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  return {
    symbol,
    query,
    activeIndex,
    setSymbol: (next): void => {
      setSymbolState(next);
      setActiveIndex(0);
    },
    setQuery: (next): void => {
      setQueryState(next);
      setActiveIndex(0);
    },
    setActiveIndex,
  };
}

// Estado da lista pesquisável: a busca, o chip de moeda, a opção ativa (setas) e a escolha (Enter).
export function useRunSwitchPanel(input: RunSwitchPanelInput): RunSwitchPanelModel {
  const { currentId, onSelect } = input;
  const { marketSymbols } = useAppConfig();
  const search = useSearchState();
  const data = useRunSwitchLists(search.symbol, true);
  const sections = useSwitchSections({ lists: data.lists, query: search.query, currentId });
  const options = flattenOptions(sections);
  const activeIndex = Math.max(0, Math.min(search.activeIndex, options.length - 1));
  const active = options[activeIndex];

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    const next = nextActiveIndex(event.key, activeIndex, options.length);
    if (next !== undefined) {
      event.preventDefault();
      search.setActiveIndex(next);
    } else if (event.key === 'Enter' && active !== undefined) {
      event.preventDefault();
      onSelect(active.runId);
    }
  }
  return {
    symbols: marketSymbols,
    symbol: search.symbol,
    query: search.query,
    sections,
    optionCount: options.length,
    active,
    data,
    setSymbol: search.setSymbol,
    setQuery: search.setQuery,
    activate: (option) =>
      search.setActiveIndex(options.findIndex((item) => item.key === option.key)),
    handleInputKeyDown,
  };
}
