// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type ChangeEvent, type ReactElement } from 'react';

import controls from '../styles/Controls.module.css';
import styles from './Notices.module.css';
import { normalizeBalanceInput } from './manual-trade.js';
import { readMyBalance, writeMyBalance } from './my-balance.js';

type FieldProps = { readonly onChange: (balance: string | undefined) => void };

// "Meu saldo" (opcional, D12-A): guardado só neste navegador; com ele, a quantidade proporcional aparece na ficha.
export function MyBalanceField({ onChange }: FieldProps): ReactElement {
  const [text, setText] = useState(() => readMyBalance() ?? '');

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const next = event.target.value;
    setText(next);
    writeMyBalance(next);
    onChange(normalizeBalanceInput(next));
  }
  const isInvalid = text.trim() !== '' && normalizeBalanceInput(text) === undefined;
  return (
    <div className={styles['balanceField']}>
      <label htmlFor="my-balance">Meu saldo (USDT, opcional)</label>
      <input
        id="my-balance"
        className={controls.input}
        inputMode="decimal"
        value={text}
        aria-invalid={isInvalid}
        aria-describedby="my-balance-help"
        onChange={handleChange}
      />
      <span id="my-balance-help" className={styles['help']}>
        {isInvalid
          ? 'Digite só números, por exemplo 2000 ou 2000,50.'
          : 'Fica só neste navegador; nunca é enviado ao servidor.'}
      </span>
    </div>
  );
}
