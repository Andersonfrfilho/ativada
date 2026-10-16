// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Icon, type IconName } from '../../../layout/Icon.component.js';
import { useShownPrice } from '../../../live/useShownPrice.hook.js';
import type { LiveStatus } from '../../live-tracking/live-status.validation.js';
import { useRunDetailQuery } from '../../runs.query.js';
import { BALCONY_TEXT } from './balcony.constant.js';
import styles from './Balcony.module.css';
import { buildProtection, type ProtectionView } from './protection-model.js';
import { readCostRates, type ProtectionLevel } from './protection-math.js';

const LEVEL_LOOK: Readonly<Record<ProtectionLevel, { icon: IconName; word: string }>> = {
  far: { icon: 'check', word: 'longe' },
  near: { icon: 'alert', word: 'perto' },
  veryNear: { icon: 'alert', word: 'muito perto' },
};

const BAR_WIDTH = 100;

function DistanceBar({ view }: { readonly view: ProtectionView }): ReactElement | null {
  const { distance } = view;
  if (distance === undefined) return null;
  const look = LEVEL_LOOK[distance.level];
  return (
    <div className={styles.distance} data-level={distance.level}>
      <svg viewBox={`0 0 ${BAR_WIDTH} 6`} className={styles.distanceBar} aria-hidden="true">
        <rect className={styles.distanceTrack} width={BAR_WIDTH} height="6" rx="3" />
        <rect className={styles.distanceFill} width={distance.remainingPercent} height="6" rx="3" />
      </svg>
      <span className={styles.distanceText}>
        <Icon name={look.icon} size={12} /> {look.word}: faltam {distance.gapText}% até a proteção
      </span>
    </div>
  );
}

function netText(net: ProtectionView['stopNet']): string {
  return net === undefined ? '—' : `${net.percent} líquido (${net.amount})`;
}

function ProtectionBody({ view }: { readonly view: ProtectionView }): ReactElement {
  return (
    <ul className={styles.boardList}>
      <li className={styles.protectionLine}>
        <strong>
          <Icon name="shield" size={14} /> {BALCONY_TEXT.PROTECTION_TITLE}
        </strong>{' '}
        {view.stopPrice} · {netText(view.stopNet)}
        <span className={styles.boardNote}>
          {`Se cair a ${view.stopPrice}, vende aqui${view.fallFromEntry === undefined ? '' : ` (${view.fallFromEntry} da entrada)`} para limitar a perda. ${BALCONY_TEXT.NOT_AN_ORDER}`}
        </span>
        <DistanceBar view={view} />
      </li>
      <li>
        <strong>{BALCONY_TEXT.TARGET_TITLE}</strong> {view.targetPrice} · {netText(view.targetNet)}
      </li>
    </ul>
  );
}

export type BoardProtectionsProps = {
  readonly runId: string;
  readonly symbol: string;
  readonly position: LiveStatus['openPosition'];
};

type OpenPosition = NonNullable<LiveStatus['openPosition']>;

function EmptyProtection(): ReactElement {
  return <p className={styles.boardNote}>{BALCONY_TEXT.NO_POSITION}</p>;
}

// O preço de agora só é lido quando há operação aberta (sem ela não há distância a medir).
function PositionProtection({
  runId,
  symbol,
  position,
}: BoardProtectionsProps & { readonly position: OpenPosition }): ReactElement {
  const run = useRunDetailQuery(runId).data;
  const shown = useShownPrice(symbol);
  const view = buildProtection({
    symbol,
    position,
    costs: run === undefined ? undefined : readCostRates(run.runParameters),
    currentPrice: shown?.price,
  });
  return view === undefined ? <EmptyProtection /> : <ProtectionBody view={view} />;
}

// A aba "Proteções": a proteção contra queda e o alvo da operação aberta; sem operação, diz por que não há nada a proteger.
export function BoardProtections(props: BoardProtectionsProps): ReactElement {
  const { position } = props;
  if (position === null) return <EmptyProtection />;
  return <PositionProtection {...props} position={position} />;
}
