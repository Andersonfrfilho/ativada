// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { ROUTE_PATH } from '../app/app.constant.js';
import { HORIZON_PARAM } from '../horizons/horizon.constant.js';
import controls from '../styles/Controls.module.css';

export type CompareHorizonsLinkProps = { readonly symbol: string };

export function CompareHorizonsLink({ symbol }: CompareHorizonsLinkProps): ReactElement {
  const query = new URLSearchParams({ [HORIZON_PARAM.SYMBOL]: symbol });
  return (
    <Link className={controls.textLink} to={`${ROUTE_PATH.HORIZONS}?${query.toString()}`}>
      Comparar prazos desta moeda
    </Link>
  );
}
