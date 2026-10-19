// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { Card } from '../layout/Card.component.js';
import { Icon } from '../layout/Icon.component.js';
import controls from '../styles/Controls.module.css';
import { LiveRunStatus } from './LiveRunStatus.component.js';
import { RUN_KIND, RUN_STATUS, statusLabel } from './run.constant.js';
import styles from './Runs.module.css';
import { useStopRunMutation } from './runs.query.js';
import type { RunDetail } from './run.validation.js';

export type RunProgressCardProps = { readonly run: RunDetail };

type StopControlProps = {
  readonly label: string;
  readonly isPending: boolean;
  readonly onStop: () => void;
};

type ConfirmStopProps = {
  readonly label: string;
  readonly isPending: boolean;
  readonly onStop: () => void;
  readonly onBack: () => void;
};

function ConfirmStop({ label, isPending, onStop, onBack }: ConfirmStopProps): ReactElement {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmRef.current?.focus();
  }, []);
  return (
    <div
      className={styles.row}
      role="group"
      aria-label="Confirmar o cancelamento"
      onKeyDown={(event) => event.key === 'Escape' && onBack()}
    >
      <button
        ref={confirmRef}
        type="button"
        className={`${controls.button} ${controls.danger}`}
        disabled={isPending}
        onClick={onStop}
      >
        {`Confirmar: ${label.toLowerCase()}`}
      </button>
      <button type="button" className={controls.button} onClick={onBack}>
        Voltar
      </button>
    </div>
  );
}

// O primeiro clique arma, o segundo cancela; "Voltar" ou Esc desarmam e o foco vai para a confirmação.
function StopControl({ label, isPending, onStop }: StopControlProps): ReactElement {
  const [isConfirming, setIsConfirming] = useState(false);
  if (isConfirming) {
    return (
      <ConfirmStop
        label={label}
        isPending={isPending}
        onStop={onStop}
        onBack={() => setIsConfirming(false)}
      />
    );
  }
  return (
    <button
      type="button"
      className={`${controls.button} ${controls.danger}`}
      disabled={isPending}
      onClick={() => setIsConfirming(true)}
    >
      <Icon name="stop" size={14} />
      {label}
    </button>
  );
}

// Simulação ao vivo não termina sozinha: sem barra de andamento, o cartão fica no fim da tela e explica o que o cancelar faz.
export function RunProgressCard({ run }: RunProgressCardProps): ReactElement {
  const stop = useStopRunMutation(run.id);
  const position = run.queuePosition;
  const isLive = run.kind === RUN_KIND.LIVE_PAPER;
  return (
    <Card title="Andamento">
      <p className={styles.sub}>{statusLabel(run.status)}</p>
      <LiveRunStatus run={run} />
      {run.status === RUN_STATUS.QUEUED && position !== null ? (
        <p>
          Posição na fila: {position.own} (de {position.overall} na fila geral)
        </p>
      ) : null}
      {isLive ? (
        <p className={controls.muted}>
          Cancelar encerra a simulação de vez; o histórico fica guardado.
        </p>
      ) : (
        <progress
          className={styles.progress}
          aria-label="Progresso da execução"
          aria-valuenow={run.progress}
          value={run.progress}
          max={100}
        />
      )}
      <div className={styles.row}>
        <StopControl
          label={isLive ? 'Cancelar simulação' : 'Cancelar execução'}
          isPending={stop.isPending}
          onStop={() => stop.mutate()}
        />
      </div>
    </Card>
  );
}
