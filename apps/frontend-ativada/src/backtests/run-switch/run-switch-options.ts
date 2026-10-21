// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatDate, formatSymbol } from '../../format/format.js';
import type { Run } from '../../runs/run.validation.js';
import type { RecentRun } from './recent-runs.js';
import { kindWord, SWITCH_GROUPS } from './run-switch.constant.js';
import { describeResult, matchesQuery, runTitle, type ResultLook } from './run-switch-text.js';

export const RECENT_SECTION = 'recent';

export type SwitchOption = {
  // Único na lista inteira: a mesma execução pode estar em "Recentes" e no seu grupo.
  readonly key: string;
  readonly runId: string;
  readonly title: string;
  readonly detail: string;
  readonly look: ResultLook | undefined;
  readonly isCurrent: boolean;
};

export type SwitchSection = {
  readonly id: string;
  readonly title: string;
  readonly options: readonly SwitchOption[];
};

export type SwitchListInput = {
  readonly kind: string;
  readonly runs: readonly Run[];
};

export type BuildSectionsInput = {
  readonly lists: readonly SwitchListInput[];
  readonly recents: readonly RecentRun[];
  readonly query: string;
  readonly currentId: string;
  readonly describeStrategy: (strategyVersionId: string) => string;
};

type OptionInput = {
  readonly sectionId: string;
  readonly source: RecentRun;
  readonly run: Run | undefined;
  readonly strategyName: string;
  readonly currentId: string;
};

function detailOf(run: Run | undefined, strategyName: string): string {
  return run === undefined ? strategyName : `${strategyName} · ${formatDate(run.periodStart)}`;
}

function buildOption(input: OptionInput): SwitchOption {
  const { sectionId, source, run, strategyName, currentId } = input;
  return {
    key: `${sectionId}:${source.id}`,
    runId: source.id,
    title: runTitle(source),
    detail: detailOf(run, strategyName),
    look: run === undefined ? undefined : describeResult(run),
    isCurrent: source.id === currentId,
  };
}

// O que a busca enxerga: moeda (com e sem a barra), vela, tipo por extenso e estratégia.
function searchableOf(run: Run, strategyName: string): string {
  return `${run.symbol} ${formatSymbol(run.symbol)} ${run.timeframe} ${kindWord(run.kind)} ${strategyName}`;
}

function groupSections(input: BuildSectionsInput): readonly SwitchSection[] {
  const { lists, query, currentId, describeStrategy } = input;
  return SWITCH_GROUPS.flatMap((group) => {
    const runs = lists.find((list) => list.kind === group.kind)?.runs ?? [];
    const options = runs
      .filter((run) =>
        matchesQuery(searchableOf(run, describeStrategy(run.strategyVersionId)), query),
      )
      .map((run) =>
        buildOption({
          sectionId: group.kind,
          source: run,
          run,
          strategyName: describeStrategy(run.strategyVersionId),
          currentId,
        }),
      );
    return options.length === 0 ? [] : [{ id: group.kind, title: group.title, options }];
  });
}

function recentSection(input: BuildSectionsInput): readonly SwitchSection[] {
  const { lists, recents, currentId, describeStrategy } = input;
  const loaded = new Map(lists.flatMap((list) => list.runs).map((run) => [run.id, run]));
  const options = recents
    .filter((source) => source.id !== currentId)
    .map((source) =>
      buildOption({
        sectionId: RECENT_SECTION,
        source,
        run: loaded.get(source.id),
        strategyName: describeStrategy(source.strategyVersionId),
        currentId,
      }),
    );
  return options.length === 0 ? [] : [{ id: RECENT_SECTION, title: 'Recentes', options }];
}

// Sem busca: "Recentes" no topo e depois um grupo por tipo, cada um do mais novo para o mais antigo. Com busca, só os grupos.
export function buildSections(input: BuildSectionsInput): readonly SwitchSection[] {
  const isSearching = input.query.trim() !== '';
  return [...(isSearching ? [] : recentSection(input)), ...groupSections(input)];
}

export function flattenOptions(sections: readonly SwitchSection[]): readonly SwitchOption[] {
  return sections.flatMap((section) => section.options);
}

// A frase que o leitor de tela ouve quando a busca muda a lista.
export function resultsAnnouncement(count: number): string {
  if (count === 0) return 'Nenhuma execução encontrada.';
  return count === 1 ? '1 execução encontrada.' : `${count} execuções encontradas.`;
}
