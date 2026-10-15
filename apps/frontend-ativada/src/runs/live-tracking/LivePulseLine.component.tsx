// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import { formatPrice, formatSymbol } from '../../format/format.js';
import { formatMomentSkippingToday } from '../../format/zoned-moment.js';
import { Icon } from '../../layout/Icon.component.js';
import { useClock } from '../../live/useClock.hook.js';
import { useShownPrice } from '../../live/useShownPrice.hook.js';
import { RUN_STATUS } from '../run.constant.js';
import { useRunDetailQuery } from '../runs.query.js';
import { formatAge, formatCountdown, OUTCOME_WORD } from './live-pulse.js';
import { useLiveStatusQuery } from './live-status.query.js';
import type { LiveStatus } from './live-status.validation.js';
import styles from './LivePulse.module.css';

const TICK_MILLISECONDS = 1_000;
const MILLISECONDS_PER_SECOND = 1_000;

export type LivePulseLineProps = { readonly runId: string; readonly symbol: string };

type PulseRun = LiveStatus['run'];

function PulseState({ run }: { readonly run: PulseRun }): ReactElement {
  if (run.stalledSince !== undefined) {
    return (
      <span className={`${styles.state} ${styles.stateWarn}`}>
        <Icon name="alert" size={16} />
        Parada
      </span>
    );
  }
  if (run.waitingForData !== null) {
    return (
      <span className={`${styles.state} ${styles.stateWarn}`}>
        <Icon name="alert" size={16} />
        Aguardando dados do mercado
      </span>
    );
  }
  if (run.status === RUN_STATUS.QUEUED) return <span className={styles.state}>Na fila</span>;
  return (
    <span className={styles.state}>
      <span className={styles.liveDot} aria-hidden="true" />
      Rodando
    </span>
  );
}

function PulsePrice({ symbol }: { readonly symbol: string }): ReactElement | null {
  const price = useShownPrice(symbol);
  if (price === undefined) return null;
  const age =
    price.source === 'live' && price.secondsSinceTick !== undefined
      ? `ao vivo · ${formatAge(price.secondsSinceTick * MILLISECONDS_PER_SECOND)}`
      : 'último fechamento';
  return (
    <span className={styles.item}>
      {formatSymbol(symbol)} <strong>{formatPrice(price.price)}</strong>{' '}
      <span className={styles.muted}>{age}</span>
    </span>
  );
}

type DecisionPulseProps = {
  readonly decision: LiveStatus['decisions']['items'][number] | undefined;
  readonly now: number;
  readonly timeZone: string;
};

function PulseLastDecision({ decision, now, timeZone }: DecisionPulseProps): ReactElement {
  if (decision === undefined) {
    return <span className={styles.item}>Ainda sem vela fechada</span>;
  }
  return (
    <span className={styles.item}>
      Última decisão{' '}
      <strong>{formatMomentSkippingToday(decision.closedAt, { now, timeZone })}</strong>:{' '}
      <strong>{OUTCOME_WORD[decision.outcome]}</strong>
    </span>
  );
}

function PulseNext({
  run,
  now,
  timeZone,
}: { readonly run: PulseRun } & Omit<DecisionPulseProps, 'decision'>): ReactElement | null {
  if (run.nextDecisionAt === null || run.stalledSince !== undefined) return null;
  if (now >= run.nextDecisionAt) return <span className={styles.item}>Processando a vela…</span>;
  return (
    <span className={styles.item}>
      Próxima às <strong>{formatMomentSkippingToday(run.nextDecisionAt, { now, timeZone })}</strong>
      , em <span className={styles.countdown}>{formatCountdown(run.nextDecisionAt - now)}</span>
    </span>
  );
}

const PULSE_LABEL = {
  STALLED: 'Simulação parada',
  WAITING: 'Simulação aguardando dados do mercado',
  QUEUED: 'Simulação na fila',
  RUNNING: 'Simulação rodando agora',
} as const;

// O nome da região acompanha o estado mostrado: "rodando agora" não pode rotular uma simulação parada.
function describePulse(run: PulseRun): string {
  if (run.stalledSince !== undefined) return PULSE_LABEL.STALLED;
  if (run.waitingForData !== null) return PULSE_LABEL.WAITING;
  return run.status === RUN_STATUS.QUEUED ? PULSE_LABEL.QUEUED : PULSE_LABEL.RUNNING;
}

// "Painel atualizado há N s": a última resposta do servidor ao painel (o detalhe da execução é consultado a cada 2 s enquanto roda);
// não afirma que o simulador está ativo.
function PulseHeartbeat({
  answeredAt,
  now,
}: {
  readonly answeredAt: number;
  readonly now: number;
}): ReactElement | null {
  if (answeredAt === 0) return null;
  return (
    <span className={`${styles.item} ${styles.muted}`}>
      Painel atualizado {formatAge(now - answeredAt)}
    </span>
  );
}

// A linha de pulso (redesenho aprovado): em toda tela com simulação ao vivo, diz que está rodando, a hora da última decisão e o relógio da próxima.
export function LivePulseLine({ runId, symbol }: LivePulseLineProps): ReactElement | null {
  const timeZone = useUserTimeZone();
  const now = useClock(TICK_MILLISECONDS);
  const status = useLiveStatusQuery(runId, true).data;
  const answeredAt = useRunDetailQuery(runId).dataUpdatedAt;
  if (status === undefined) return null;
  const run = status.run;
  if (run.status !== RUN_STATUS.RUNNING && run.status !== RUN_STATUS.QUEUED) return null;
  const isHealthy = run.stalledSince === undefined && run.waitingForData === null;
  return (
    <section
      className={isHealthy ? styles.pulse : `${styles.pulse} ${styles.pulseWarn}`}
      aria-label={describePulse(run)}
    >
      <PulseState run={run} />
      <PulsePrice symbol={symbol} />
      <PulseLastDecision decision={status.decisions.items[0]} now={now} timeZone={timeZone} />
      <PulseNext run={run} now={now} timeZone={timeZone} />
      {isHealthy ? <PulseHeartbeat answeredAt={answeredAt} now={now} /> : null}
    </section>
  );
}
