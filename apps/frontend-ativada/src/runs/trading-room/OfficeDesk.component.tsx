// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useRef, type ReactElement } from 'react';

import { ArtRects } from './ArtRects.component.js';
import { buildDeskArt, buildLecternArt } from './desk-art.js';
import { IntentChip } from './IntentChip.component.js';
import { DESKS, LECTERN } from './office-geometry.js';
import { OUT_OF_SCORE, summarize, type RoomOpinion } from './room-opinions.js';
import { usePlacement } from './usePlacement.hook.js';
import styles from './Office.module.css';

function Nameplate({ opinion }: { readonly opinion: RoomOpinion }): ReactElement {
  const [first, second] = summarize(opinion);
  return (
    <div className={styles.nameplate} data-out={opinion.isOut ? 'true' : undefined}>
      <span className={styles.plateHead}>
        <strong>
          {opinion.name}
          {opinion.kind === 'model' ? ' ◆' : ''}
        </strong>
        <IntentChip look={opinion.intent} />
      </span>
      <span className={styles.plateLine}>{first}</span>
      <span className={styles.plateSub}>{opinion.isOut ? OUT_OF_SCORE : second}</span>
      {opinion.wallet === undefined ? null : (
        <span className={styles.plateWallet}>{opinion.wallet}</span>
      )}
    </div>
  );
}

// A mesa de um agente com os monitores e a plaquinha do que ele acha agora (o resumo fixo; o balão traz o detalhe).
export function OfficeDesk({ opinion }: { readonly opinion: RoomOpinion }): ReactElement | null {
  const ref = useRef<HTMLDivElement>(null);
  const desk = DESKS[opinion.slot];
  usePlacement(ref, desk ?? LECTERN);
  if (desk === undefined) return null;
  return (
    <div ref={ref} className={styles.desk} data-tone={opinion.intent.tone}>
      <svg viewBox="0 0 72 44" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
        <ArtRects rects={buildDeskArt(desk.side, desk.kinds)} />
      </svg>
      <Nameplate opinion={opinion} />
    </div>
  );
}

export function Lectern(): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  usePlacement(ref, LECTERN);
  return (
    <div ref={ref} className={`${styles.desk} ${styles.lectern}`}>
      <svg viewBox="0 0 32 40" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
        <ArtRects rects={buildLecternArt()} />
      </svg>
      <span className={styles.lecternTag}>Alice · líder</span>
    </div>
  );
}
