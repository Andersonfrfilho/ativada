// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Icon } from '../../../layout/Icon.component.js';
import { OFFICE_TEXT } from './office.constant.js';
import styles from './Office.module.css';
import type { BoardModel, ClockModel, LevelMark, ScreenModel } from './office-model.js';

const SCREEN_VIEW = '0 0 400 130';

function Clock({ clock }: { readonly clock: ClockModel }): ReactElement {
  return (
    <div className={styles.clock}>
      <svg className={styles.clockFace} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <circle className={styles.clockRim} cx="50" cy="50" r="46" />
        <line
          className={styles.clockHour}
          x1="50"
          y1="50"
          x2="50"
          y2="28"
          transform={`rotate(${clock.hourAngle} 50 50)`}
        />
        <line
          className={styles.clockMinute}
          x1="50"
          y1="50"
          x2="50"
          y2="14"
          transform={`rotate(${clock.minuteAngle} 50 50)`}
        />
      </svg>
      <p className={styles.clockText}>
        <span className={styles.wallLabel}>{OFFICE_TEXT.NEXT_CLOSE}</span>
        <strong className={styles.clockTime}>{clock.text}</strong>
        <span className={styles.wallCaption}>{clock.caption}</span>
      </p>
    </div>
  );
}

function LevelLine({ mark }: { readonly mark: LevelMark }): ReactElement | null {
  if (mark.y === undefined) return null;
  return (
    <g className={styles.screenLevel} data-level={mark.key} data-animated="">
      <line x1="8" y1={mark.y} x2="392" y2={mark.y} />
      <text x="392" y={mark.y - 3} textAnchor="end">
        {mark.label} {mark.priceText}
      </text>
    </g>
  );
}

// O telão: os fechamentos que o servidor mandou, em linha, e os níveis da operação aberta (entrada, alvo e proteção).
function Screen({ screen }: { readonly screen: ScreenModel }): ReactElement {
  return (
    <figure className={styles.screen}>
      <svg viewBox={SCREEN_VIEW} aria-hidden="true" focusable="false">
        <rect className={styles.screenBackdrop} x="0" y="0" width="400" height="130" rx="8" />
        <text className={styles.screenHeading} x="10" y="14">
          {screen.title}
        </text>
        <g transform="translate(0 16)">
          <polyline className={styles.screenLine} points={screen.points} />
          {screen.levels.map((mark) => (
            <LevelLine key={mark.key} mark={mark} />
          ))}
        </g>
      </svg>
      <figcaption className={styles.screenCaption}>{screen.caption}</figcaption>
    </figure>
  );
}

function Locks({ board }: { readonly board: BoardModel }): ReactElement {
  const { locks } = board;
  const active = locks?.active ?? 0;
  return (
    <p className={styles.locks}>
      <span className={styles.wallLabel}>{OFFICE_TEXT.LOCKS}</span>
      {locks === undefined ? (
        <span className={styles.wallCaption}>{OFFICE_TEXT.LOCKS_UNKNOWN}</span>
      ) : (
        <>
          <span className={styles.lockIcons}>
            {locks.flags.map((isActive, index) => (
              <span key={index} className={styles.lockIcon} data-active={isActive}>
                <Icon name="lock" size={16} />
              </span>
            ))}
          </span>
          <span className={styles.wallCaption}>
            {active} de {locks.total} ativas
          </span>
        </>
      )}
    </p>
  );
}

// O quadro de avisos: o que a simulação fez na vela (palavra e pontuação do servidor), as cinco travas e a meta.
function Board({ board }: { readonly board: BoardModel }): ReactElement {
  return (
    <aside className={styles.board} data-has-locks={(board.locks?.active ?? 0) > 0}>
      <h4 className={styles.boardTitle}>{OFFICE_TEXT.BOARD}</h4>
      <p>
        <span className={styles.wallLabel}>{OFFICE_TEXT.SIGNAL}</span>
        <span className={styles.boardValue}>{board.signal}</span>
      </p>
      <Locks board={board} />
      {board.goal === undefined ? null : (
        <p className={`${styles.wallCaption} ${styles.goalLine}`}>{board.goal}</p>
      )}
    </aside>
  );
}

export type OfficeWallProps = {
  readonly clock: ClockModel;
  readonly screen: ScreenModel;
  readonly board: BoardModel;
};

export function OfficeWall({ clock, screen, board }: OfficeWallProps): ReactElement {
  return (
    <div className={styles.wall}>
      <Clock clock={clock} />
      <Screen screen={screen} />
      <Board board={board} />
    </div>
  );
}
