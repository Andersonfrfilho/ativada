// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useRef, type ReactElement } from 'react';

import type { Run } from '../../runs/run.validation.js';
import { useVersionIndexQuery } from '../../strategies/strategy.query.js';
import { describeLookup, lookupVersion } from '../../strategies/version-index.js';
import { RunSwitchSteps, RunSwitchTrigger } from './RunSwitchControls.component.js';
import { runTitle } from './run-switch-text.js';
import { RunSwitchPanel } from './RunSwitchPanel.component.js';
import styles from './RunSwitcher.module.css';
import { useRunSwitcher } from './useRunSwitcher.hook.js';

// Sem execução para mostrar (não existe ou falhou), a lista continua à mão para a pessoa ir para outra.
const FAILED_LABEL = 'Escolher outra execução';

export type RunSwitcherProps = {
  readonly runId: string;
  readonly run: Run | undefined;
  readonly isFailed: boolean;
};

// A barra no topo do detalhe: o botão com a execução de agora (abre a lista) e as setas para a vizinha da lista.
export function RunSwitcher({ runId, run, isFailed }: RunSwitcherProps): ReactElement {
  const index = useVersionIndexQuery();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const model = useRunSwitcher({ runId, run });
  const current =
    run === undefined
      ? isFailed
        ? FAILED_LABEL
        : 'Carregando…'
      : `${runTitle(run)} · ${describeLookup(lookupVersion(index, run.strategyVersionId))}`;

  function leave(action: () => void): void {
    action();
    triggerRef.current?.focus();
  }
  return (
    <div className={styles.bar} role="group" aria-label="Trocar de execução">
      <RunSwitchTrigger
        triggerRef={triggerRef}
        current={current}
        isOpen={model.isOpen}
        isDisabled={run === undefined && !isFailed}
        onOpen={model.open}
      />
      <RunSwitchSteps
        neighbours={model.neighbours}
        onPrevious={model.goPrevious}
        onNext={model.goNext}
      />
      {model.isOpen ? (
        <RunSwitchPanel
          currentId={runId}
          onSelect={(runId) => leave(() => model.goTo(runId))}
          onClose={() => leave(model.close)}
        />
      ) : null}
    </div>
  );
}
