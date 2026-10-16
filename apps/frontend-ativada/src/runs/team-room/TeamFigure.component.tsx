// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import styles from './TeamFigure.module.css';
import type { SeatState } from './team-room-sequence.js';
import type { SeatTone } from './team-room.types.js';

export type FigureRole =
  'trend' | 'reversion' | 'volume' | 'sentiment' | 'other' | 'analyst' | 'auditor';

const ROLE_CLASS: Readonly<Record<FigureRole, string | undefined>> = {
  trend: styles.roleTrend,
  reversion: styles.roleReversion,
  volume: styles.roleVolume,
  sentiment: styles.roleSentiment,
  other: styles.roleOther,
  analyst: styles.roleAnalyst,
  auditor: styles.roleAuditor,
};

function Legs(): ReactElement {
  return (
    <>
      <rect className={styles.pants} x="31" y="72" width="8" height="22" rx="2" />
      <rect className={styles.pants} x="41" y="72" width="8" height="22" rx="2" />
      <rect className={styles.shoe} x="28" y="91" width="12" height="6" rx="2.5" />
      <rect className={styles.shoe} x="40" y="91" width="12" height="6" rx="2.5" />
    </>
  );
}

function Torso(): ReactElement {
  return (
    <>
      <rect className={styles.sleeve} x="18" y="48" width="9" height="22" rx="4" />
      <rect className={styles.sleeve} x="53" y="48" width="9" height="22" rx="4" />
      <circle className={styles.skin} cx="22.5" cy="71" r="4" />
      <circle className={styles.skin} cx="57.5" cy="71" r="4" />
      <rect className={styles.shirt} x="26" y="45" width="28" height="31" rx="7" />
      <rect className={styles.skin} x="36" y="39" width="8" height="8" />
    </>
  );
}

function Head(): ReactElement {
  return (
    <>
      <rect className={styles.skin} x="25" y="12" width="30" height="31" rx="10" />
      <rect className={styles.hair} x="24" y="9" width="32" height="12" rx="7" />
      <rect className={styles.hair} x="24" y="13" width="5" height="12" rx="2.5" />
      <rect className={styles.eye} x="33" y="25" width="3" height="4.5" rx="1" />
      <rect className={styles.eye} x="44" y="25" width="3" height="4.5" rx="1" />
      <path className={styles.mouth} d="M36 35q4 3 8 0" />
    </>
  );
}

// Um acessório por papel: boné, seta de volta, fones, coração, gravata com óculos, prancheta com lupa.
function Accessory({ role }: { readonly role: FigureRole }): ReactElement | null {
  switch (role) {
    case 'trend':
      return <rect className={styles.cap} x="23" y="7" width="34" height="11" rx="5" />;
    case 'reversion':
      return <path className={styles.mark} d="M45 57a5 5 0 1 1-5-5h3M41 49l3 3-3 3" />;
    case 'volume':
      return (
        <path className={styles.phones} d="M22 28a18 18 0 0 1 36 0M18 24h7v12h-7zM55 24h7v12h-7z" />
      );
    case 'sentiment':
      return (
        <path
          className={styles.heart}
          d="M40 63s-7-4.4-7-9a3.8 3.8 0 0 1 7-2 3.8 3.8 0 0 1 7 2c0 4.6-7 9-7 9z"
        />
      );
    case 'analyst':
      return (
        <path className={styles.tie} d="M40 46l-3.5 4 3.5 14 3.5-14zM29.6 27h8.8M41.6 27h8.8" />
      );
    case 'auditor':
      return (
        <path
          className={styles.lens}
          d="M11 56h13v17H11zM57 62a6 6 0 1 0 12 0 6 6 0 1 0-12 0M67 66.5l5 5"
        />
      );
    case 'other':
      return null;
  }
}

export type TeamFigureProps = {
  readonly role: FigureRole;
  readonly tone: SeatTone;
  readonly state: SeatState;
  readonly isRinging: boolean;
};

function classNameOf({ role, tone, state, isRinging }: TeamFigureProps): string {
  return [
    styles.figure,
    ROLE_CLASS[role],
    tone === 'quiet' ? styles.quiet : undefined,
    tone === 'voter' ? styles.lit : undefined,
    state === 'thinking' ? styles.thinking : undefined,
    isRinging && tone === 'voter' ? styles.ringing : undefined,
  ]
    .filter((name) => name !== undefined)
    .join(' ');
}

// O bonequinho (SVG à mão, sem imagem externa). Decorativo: o significado está no balão e na lista de texto.
export function TeamFigure(props: TeamFigureProps): ReactElement {
  const { role } = props;
  return (
    <svg className={classNameOf(props)} viewBox="0 0 80 110" aria-hidden="true" focusable="false">
      <polygon className={styles.tile} points="40,88 74,99 40,110 6,99" />
      <ellipse className={styles.shadow} cx="40" cy="99" rx="17" ry="4.5" />
      <circle className={styles.halo} cx="40" cy="58" r="34" />
      <g className={styles.body}>
        <Legs />
        <Torso />
        <Head />
        <Accessory role={role} />
      </g>
    </svg>
  );
}
