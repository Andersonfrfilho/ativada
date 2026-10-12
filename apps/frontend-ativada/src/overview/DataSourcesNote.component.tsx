// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import controls from '../styles/Controls.module.css';

// Crédito exigido pelos termos da alternative.me (RF01, plan D14): o índice entra nas regras como dado opcional.
export function DataSourcesNote(): ReactElement {
  return (
    <footer className={controls.muted}>
      Preços da Binance (mercado à vista). O sentimento de mercado e o crédito da fonte estão no
      cartão acima.
    </footer>
  );
}
