// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { ROUTE_PATH } from '../../app/app.constant.js';
import type { Run } from '../../runs/run.validation.js';
import { recordRecentRun } from './recent-runs.js';
import { useRunNeighbours, type RunNeighbours } from './useRunNeighbours.hook.js';
import { useSwitchShortcuts } from './useSwitchShortcuts.hook.js';

export type RunSwitcherModel = {
  readonly isOpen: boolean;
  readonly neighbours: RunNeighbours;
  readonly open: () => void;
  readonly close: () => void;
  readonly goTo: (runId: string) => void;
  readonly goPrevious: () => void;
  readonly goNext: () => void;
};

// O detalhe de uma execução é a última visitada: guardada neste navegador como conveniência (5 no máximo).
function useRecordVisit(run: Run | undefined): void {
  useEffect(() => {
    if (run !== undefined) recordRecentRun(run);
  }, [run]);
}

export type RunSwitcherInput = { readonly runId: string; readonly run: Run | undefined };

export function useRunSwitcher({ runId: currentId, run }: RunSwitcherInput): RunSwitcherModel {
  const navigate = useNavigate();
  const neighbours = useRunNeighbours(run);
  const [isOpen, setIsOpen] = useState(false);
  useRecordVisit(run);

  function goTo(runId: string): void {
    setIsOpen(false);
    if (runId !== currentId) void navigate(`${ROUTE_PATH.BACKTESTS}/${runId}`);
  }
  function goPrevious(): void {
    if (neighbours.previousId !== undefined) goTo(neighbours.previousId);
  }
  function goNext(): void {
    if (neighbours.nextId !== undefined) goTo(neighbours.nextId);
    else if (neighbours.canLoadNext) void neighbours.loadNext().then((id) => id && goTo(id));
  }
  useSwitchShortcuts({ isEnabled: !isOpen, onPrevious: goPrevious, onNext: goNext });
  return {
    isOpen,
    neighbours,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    goTo,
    goPrevious,
    goNext,
  };
}
