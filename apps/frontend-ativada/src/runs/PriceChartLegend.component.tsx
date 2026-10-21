// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement, ReactNode } from 'react';

import { arrowPath } from './price-chart-markers.js';
import styles from './PriceChart.module.css';

const GLYPH_SIZE = 18;
const GLYPH_MIDDLE = GLYPH_SIZE / 2;

export type PriceChartLegendProps = { readonly hasClusters: boolean };

function Glyph({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <svg className={styles.glyph} viewBox={`0 0 ${GLYPH_SIZE} ${GLYPH_SIZE}`} aria-hidden="true">
      {children}
    </svg>
  );
}

function ArrowGlyph({ side }: { readonly side: 'buy' | 'sell' }): ReactElement {
  return (
    <Glyph>
      <path
        className={side === 'buy' ? styles.buyArrow : styles.sellArrow}
        d={arrowPath(side, GLYPH_MIDDLE, GLYPH_MIDDLE)}
      />
    </Glyph>
  );
}

// Forma E texto, nunca só cor: a seta para cima é compra e a para baixo é venda.
export function PriceChartLegend({ hasClusters }: PriceChartLegendProps): ReactElement {
  return (
    <ul className={styles.legend}>
      <li>
        <ArrowGlyph side="buy" />
        Compra (seta para cima)
      </li>
      <li>
        <ArrowGlyph side="sell" />
        Venda (seta para baixo)
      </li>
      <li>
        <Glyph>
          <line className={styles.legendLine} x1={1} x2={17} y1={9} y2={9} />
        </Glyph>
        Preço de fechamento
      </li>
      <li>
        <Glyph>
          <rect className={styles.band} x={1} y={4} width={16} height={10} />
        </Glyph>
        Faixa da mínima à máxima
      </li>
      {hasClusters ? (
        <li>
          <Glyph>
            <circle className={styles.cluster} cx={9} cy={9} r={7} />
          </Glyph>
          Várias operações juntas
        </li>
      ) : null}
    </ul>
  );
}
