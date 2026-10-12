// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState } from 'react';

import type { SavedVersion } from './ParameterEditor.component.js';
import { useAddVersionMutation } from './strategy.mutation.js';
import type { StrategyVersion } from './strategy.validation.js';

export type StrategyEditing = {
  // A lista do servidor mais a versão recém-salva enquanto a lista ainda não a trouxe (a releitura pode chegar atrasada).
  readonly versions: readonly StrategyVersion[];
  readonly base: StrategyVersion | undefined;
  readonly latest: StrategyVersion | undefined;
  readonly saved: SavedVersion | undefined;
  readonly isSaving: boolean;
  readonly saveError: Error | null;
  readonly save: (config: unknown) => void;
  readonly selectBase: (versionId: string) => void;
};

// A mutação mora fora do editor: ele troca de chave ao mudar a base e levaria o callback da mutação junto.
export function useStrategyEditing(
  strategyId: string,
  serverVersions: readonly StrategyVersion[],
): StrategyEditing {
  const [baseId, setBaseId] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState<SavedVersion | undefined>(undefined);
  const add = useAddVersionMutation();
  const isSavedMissing =
    saved !== undefined && !serverVersions.some((version) => version.id === saved.version.id);
  const versions = isSavedMissing ? [saved.version, ...serverVersions] : serverVersions;
  const latest = versions[0];

  function save(config: unknown): void {
    const knownIds = versions.map((version) => version.id);
    add.mutate(
      { strategyId, config },
      {
        onSuccess: ({ version }) => {
          setSaved({ version, isNew: !knownIds.includes(version.id) });
          setBaseId(version.id);
        },
      },
    );
  }

  return {
    versions,
    base: versions.find((version) => version.id === baseId) ?? latest,
    latest,
    saved,
    isSaving: add.isPending,
    saveError: add.error,
    save,
    selectBase: (versionId): void => {
      setSaved(undefined);
      setBaseId(versionId);
    },
  };
}
