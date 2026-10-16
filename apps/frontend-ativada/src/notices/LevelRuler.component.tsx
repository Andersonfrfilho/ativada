// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import styles from './Notices.module.css';
import type { RulerMark, RulerModel } from './level-ruler.js';

const WIDTH = 320;
const FULL = 100;
const LABEL_EDGE = 2;
const ENTRY_LABEL_MARGIN = 56;

function toX(position: number): number {
  return (position / FULL) * WIDTH;
}

function markText(mark: RulerMark): string {
  const percent = mark.percentText === undefined ? '' : ` (${mark.percentText})`;
  return `${mark.label} ${mark.priceText}${percent}`;
}

function findMark(model: RulerModel, key: RulerMark['key']): RulerMark {
  const mark = model.marks.find((candidate) => candidate.key === key);
  if (mark === undefined) throw new Error(`Régua sem a marca ${key}.`);
  return mark;
}

function Zones({ model }: { readonly model: RulerModel }): ReactElement {
  const stop = toX(findMark(model, 'stop').position);
  const entry = toX(findMark(model, 'entry').position);
  const target = toX(findMark(model, 'target').position);
  return (
    <>
      <rect className={styles['axis']} x={0} y={34} width={WIDTH} height={2} />
      <rect className={styles['zoneLoss']} x={stop} y={26} width={entry - stop} height={18} />
      <rect className={styles['zoneGain']} x={entry} y={26} width={target - entry} height={18} />
    </>
  );
}

function Ticks({ model }: { readonly model: RulerModel }): ReactElement {
  return (
    <>
      {model.marks.map((mark) => (
        <line
          key={mark.key}
          className={styles[`tick-${mark.key}`]}
          x1={toX(mark.position)}
          x2={toX(mark.position)}
          y1={22}
          y2={48}
        />
      ))}
    </>
  );
}

function Marks({ model }: { readonly model: RulerModel }): ReactElement {
  const stop = findMark(model, 'stop');
  const entry = findMark(model, 'entry');
  const target = findMark(model, 'target');
  const entryX = toX(entry.position);
  return (
    <>
      <Ticks model={model} />
      <text
        className={styles['rulerText']}
        x={Math.max(LABEL_EDGE, toX(stop.position))}
        y={16}
        textAnchor="start"
      >
        {markText(stop)}
      </text>
      <text
        className={styles['rulerText']}
        x={Math.min(WIDTH - LABEL_EDGE, toX(target.position))}
        y={16}
        textAnchor="end"
      >
        {markText(target)}
      </text>
      <text
        className={styles['rulerText']}
        x={Math.min(WIDTH - ENTRY_LABEL_MARGIN, Math.max(ENTRY_LABEL_MARGIN, entryX))}
        y={64}
        textAnchor="middle"
      >
        {markText(entry)}
      </text>
    </>
  );
}

function Cursor({ model }: { readonly model: RulerModel }): ReactElement | null {
  if (model.cursor === undefined) return null;
  const x = toX(model.cursor.position);
  return (
    <>
      <polygon className={styles['cursorMark']} points={`${x - 5},56 ${x + 5},56 ${x},46`} />
      <text
        className={styles['rulerTextStrong']}
        x={Math.min(WIDTH - ENTRY_LABEL_MARGIN, Math.max(ENTRY_LABEL_MARGIN, x))}
        y={78}
        textAnchor="middle"
      >
        {model.cursor.label}
      </text>
    </>
  );
}

// RF24: a régua dos níveis em SVG (posições como atributos, nunca estilo em linha); abaixo de 280 px vira lista vertical.
export function LevelRuler({ model }: { readonly model: RulerModel }): ReactElement {
  const rows = [...model.marks].reverse();
  return (
    <div className={styles['ruler']} role="img" aria-label={model.description}>
      <svg
        className={styles['rulerSvg']}
        viewBox={`0 0 ${WIDTH} 84`}
        aria-hidden="true"
        focusable="false"
      >
        <Zones model={model} />
        <Marks model={model} />
        <Cursor model={model} />
      </svg>
      <ul className={styles['rulerList']} aria-hidden="true">
        {rows.map((mark) => (
          <li key={mark.key} className={styles[`row-${mark.key}`]}>
            {markText(mark)}
          </li>
        ))}
        {model.cursor === undefined ? null : (
          <li className={styles['row-cursor']}>{model.cursor.label}</li>
        )}
      </ul>
      <p className={styles['rulerLegend']} aria-hidden="true">
        {model.legend}
      </p>
    </div>
  );
}
