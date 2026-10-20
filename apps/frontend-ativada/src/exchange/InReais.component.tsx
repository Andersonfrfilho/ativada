// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, type ReactElement, type ReactNode } from 'react';

import { toReais } from '../assets/asset-math.js';
import { formatScaled, parseScaled } from '../format/decimal.js';
import styles from './InReais.module.css';
import { useUsdtBrlRate } from './useUsdtBrlRate.hook.js';

export type InReaisProps = {
  // Valor em USDT, em texto decimal (como a API manda).
  readonly usdt: string;
  readonly children: ReactNode;
};

// O valor em USDT com o "≈ R$" num tooltip (passar o mouse ou focar); sem cotação, só o valor.
export function InReais({ usdt, children }: InReaisProps): ReactElement {
  const id = useId();
  const { rate } = useUsdtBrlRate();
  const value = parseScaled(usdt);
  if (rate === undefined || value === undefined) return <>{children}</>;
  return (
    <span className={styles.anchor} tabIndex={0} aria-describedby={id}>
      {children}
      <span id={id} role="tooltip" className={styles.tip}>
        ≈ R$ {formatScaled(toReais(value, rate))}
      </span>
    </span>
  );
}
