// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { OFFICE_PLANTS } from './office-grid.js';
import type { ClockModel, ScreenModel } from './office-model.js';
import { placeClass } from './iso-place.js';
import styles from './IsoRoom.module.css';

const CITY = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

// A janela com a cidade (dia no tema claro, noite no escuro: tudo por tokens).
function CityWindow(): ReactElement {
  return (
    <div className={styles.window}>
      <ul className={styles.city}>
        {CITY.map((tower) => (
          <li key={tower} className={styles.tower} data-tower={tower} />
        ))}
      </ul>
    </div>
  );
}

// O quadro de cotações na parede: o par da simulação e os fechamentos que o servidor mandou, em linha.
function QuoteBoard({ screen }: { readonly screen: ScreenModel }): ReactElement {
  return (
    <figure className={styles.board}>
      <figcaption className={styles.boardTitle}>{screen.title}</figcaption>
      <svg viewBox="0 0 400 110" className={styles.boardChart} focusable="false">
        <polyline className={styles.boardLine} points={screen.points} />
      </svg>
    </figure>
  );
}

// O relógio da parede: a hora do próximo fechamento (a mesma do escritório frontal).
function WallClock({ clock }: { readonly clock: ClockModel }): ReactElement {
  return (
    <div className={styles.clock}>
      <svg viewBox="0 0 100 100" className={styles.clockFace} focusable="false">
        <circle className={styles.clockRim} cx="50" cy="50" r="46" />
        <line
          className={styles.clockHand}
          x1="50"
          y1="50"
          x2="50"
          y2="28"
          transform={`rotate(${clock.hourAngle} 50 50)`}
        />
        <line
          className={styles.clockHand}
          x1="50"
          y1="50"
          x2="50"
          y2="14"
          transform={`rotate(${clock.minuteAngle} 50 50)`}
        />
      </svg>
      <span className={styles.clockText}>{clock.text}</span>
    </div>
  );
}

export type IsoRoomProps = {
  readonly clock: ClockModel;
  readonly screen: ScreenModel;
};

// O cenário fixo: piso, duas paredes, janela, quadro de cotações, relógio e plantas. Sem movimento.
export function IsoRoom({ clock, screen }: IsoRoomProps): ReactElement {
  return (
    <>
      <span className={styles.floor} />
      <span className={styles.wallRight} />
      <span className={styles.wallLeft} />
      <CityWindow />
      <QuoteBoard screen={screen} />
      <WallClock clock={clock} />
      {OFFICE_PLANTS.map((cell) => (
        <span key={`${cell.x}-${cell.y}`} className={`${placeClass(cell)} ${styles.plant}`}>
          <span className={styles.leaves} />
          <span className={styles.pot} />
        </span>
      ))}
    </>
  );
}
