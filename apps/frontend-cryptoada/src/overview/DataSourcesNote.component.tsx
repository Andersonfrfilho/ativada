// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import controls from '../styles/Controls.module.css';
import {
  EXTERNAL_LINK_REL,
  FEAR_GREED_CREDIT_TEXT,
  FEAR_GREED_CREDIT_URL,
} from './overview.constant.js';

// Crédito exigido pelos termos da alternative.me (RF01, plan D14): o índice entra nas regras como dado opcional.
export function DataSourcesNote(): ReactElement {
  return (
    <footer className={controls.muted}>
      Preços da Binance (mercado à vista). Sentimento de mercado:{' '}
      <a href={FEAR_GREED_CREDIT_URL} target="_blank" rel={EXTERNAL_LINK_REL}>
        {FEAR_GREED_CREDIT_TEXT}
      </a>
      .
    </footer>
  );
}
