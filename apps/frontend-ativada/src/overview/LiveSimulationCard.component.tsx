// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { ROUTE_PATH } from '../app/app.constant.js';
import { formatSymbol } from '../format/format.js';
import { Icon } from '../layout/Icon.component.js';
import { formatDirectedMoney } from '../runs/directed-money.js';
import { teamRunLabel } from '../runs/model-teams/run-source-label.js';
import {
  AnalystBadge,
  MiniComparison,
  ResultChip,
  StateChip,
} from './LiveSimulationParts.component.js';
import styles from './LiveSimulations.module.css';
import { operationsOf, stateOf, type LiveSimulation } from './live-simulations.js';
import { describeCandle, formatRunningFor } from './running-for.js';

export type LiveSimulationCardProps = {
  readonly simulation: LiveSimulation;
  readonly now: number;
  readonly isFeatured: boolean;
  readonly onFeature?: ((runId: string) => void) | undefined;
};

function describeOperations(simulation: LiveSimulation): string {
  const { summary } = simulation;
  if (summary === undefined) return '';
  if (operationsOf(simulation) === 0) return 'Ainda não comprou nem vendeu';
  return `${summary.buyCount} ${summary.buyCount === 1 ? 'compra' : 'compras'} · ${summary.sellCount} ${summary.sellCount === 1 ? 'venda' : 'vendas'}`;
}

function describeLastDecision(simulation: LiveSimulation, now: number): string {
  const decidedAt = simulation.summary?.lastDecisionAt ?? null;
  if (decidedAt === null) return 'Ainda sem decisão: espera a 1ª vela fechar';
  return `Última decisão há ${formatRunningFor(now - decidedAt)}`;
}

function CardBody({
  simulation,
  now,
}: Pick<LiveSimulationCardProps, 'simulation' | 'now'>): ReactElement {
  const { summary } = simulation;
  if (summary === undefined)
    return (
      <p role="status" className={styles.muted}>
        Carregando o saldo…
      </p>
    );
  return (
    <>
      <p className={styles.balance}>
        <span className={styles.muted}>Saldo</span>
        {formatDirectedMoney(summary.balance, 'down')} <span className={styles.unit}>USDT</span>
      </p>
      <ResultChip result={summary.result} rate={summary.resultRate} />
      <MiniComparison summary={summary} />
      <p className={styles.facts}>
        <span>Operações: {describeOperations(simulation)}</span>
        <span>{describeLastDecision(simulation, now)}</span>
      </p>
    </>
  );
}

// A equipe de modelo ◆ no lugar da estratégia fixa do sistema; a execução de regras segue com o nome da estratégia.
function strategyOf(
  source: Parameters<typeof teamRunLabel>[0],
  summary: { readonly strategyName: string } | undefined,
): string {
  const label = teamRunLabel(source) ?? summary?.strategyName;
  return label === undefined ? '' : ` · ${label}`;
}

type FeatureButtonProps = Pick<LiveSimulationCardProps, 'isFeatured' | 'onFeature'> & {
  readonly run: LiveSimulation['run'];
};

function FeatureButton({ run, isFeatured, onFeature }: FeatureButtonProps): ReactElement | null {
  if (onFeature === undefined) return null;
  return (
    <button
      type="button"
      className={styles.featureButton}
      aria-pressed={isFeatured}
      onClick={() => onFeature(run.id)}
    >
      <Icon name={isFeatured ? 'check' : 'eye'} size={16} />
      {isFeatured ? 'Em destaque abaixo' : 'Ver em destaque'}
    </button>
  );
}

// O cartão inteiro abre o detalhe (o link do título cobre a área); o botão "Destacar" fica acima dele.
export function LiveSimulationCard(props: LiveSimulationCardProps): ReactElement {
  const { simulation, isFeatured } = props;
  const { run, summary } = simulation;
  return (
    <li className={isFeatured ? `${styles.card} ${styles.featured}` : styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>
          <Link to={`${ROUTE_PATH.BACKTESTS}/${run.id}`} className={styles.cardLink}>
            {formatSymbol(run.symbol)}
          </Link>
        </h3>
        <StateChip state={stateOf(simulation)} />
      </div>
      <p className={styles.muted}>
        {describeCandle(run.timeframe)}
        {strategyOf(run.signalSource, summary)}
      </p>
      <AnalystBadge mode={summary?.analystMode ?? null} />
      <CardBody simulation={simulation} now={props.now} />
      <FeatureButton run={run} isFeatured={isFeatured} onFeature={props.onFeature} />
    </li>
  );
}
