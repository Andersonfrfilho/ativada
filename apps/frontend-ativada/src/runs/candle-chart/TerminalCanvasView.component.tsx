// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, useRef, type ReactElement } from 'react';

import { LeaderFocusProvider } from '../team-room/balcony/leader-focus.context.js';
import styles from './CandleChart.module.css';
import { CanvasControls, CanvasNotices } from './CanvasControls.component.js';
import { CanvasOverlays } from './CanvasOverlays.component.js';
import {
  CanvasFooter,
  ChartSide,
  SurfaceBox,
  type CanvasViewProps,
  type DescriptionIds,
} from './CanvasParts.component.js';

// O gráfico no telão da sala: uma faixa fina (vela, zoom em ícones, balão de valores e o menu "Camadas"), o canvas com o
// volume e, se couber, a "Próxima vela de perto". Resumo, período, tabela e crédito ficam na seção "Operações".
export function TerminalCanvasView(props: CanvasViewProps): ReactElement {
  const { view } = props;
  // No telão a previsão fica sempre ao lado do gráfico; a camada "Previsão" só liga o cone sobre as velas.
  const hasSide = view.isLive;
  const ids: DescriptionIds = { help: useId(), caption: useId() };
  const figureRef = useRef<HTMLElement>(null);
  return (
    <LeaderFocusProvider>
      <figure ref={figureRef} className={`${styles.wrapper} ${styles.terminalFigure}`}>
        <div className={styles.terminalBar}>
          <CanvasControls {...props} />
        </div>
        <div className={hasSide ? styles.chartLayout : styles.chartAlone}>
          <SurfaceBox {...props} ids={ids} />
          {hasSide ? <ChartSide {...props} /> : null}
        </div>
        <div className={styles.terminalNotices}>
          <CanvasNotices {...props} />
        </div>
        <CanvasFooter {...props} ids={ids} hasCredit={false} />
        <CanvasOverlays {...props} figureRef={figureRef} />
      </figure>
    </LeaderFocusProvider>
  );
}
