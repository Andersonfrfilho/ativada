// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Icon } from '../layout/Icon.component.js';
import styles from './Notices.module.css';
import { buildExchangeUrl } from './exchange-link.js';
import type { CopyTexts } from './manual-trade.js';
import { formatSymbol } from './notice-text.js';
import { useCopyValue } from './useCopyValue.hook.js';

type ButtonsProps = {
  readonly symbol: string;
  readonly texts: CopyTexts;
  readonly speak: (text: string) => void;
};

type CopyItem = {
  readonly key: string;
  readonly label: string;
  readonly text: string | undefined;
};

function listCopyItems(texts: CopyTexts): readonly CopyItem[] {
  return [
    { key: 'price', label: 'Copiar preço', text: texts.price },
    { key: 'quantity', label: 'Copiar quantidade', text: texts.quantity },
    { key: 'target', label: 'Copiar alvo', text: texts.target },
    { key: 'stop', label: 'Copiar proteção', text: texts.stop },
    { key: 'all', label: 'Copiar todas as ordens', text: texts.all },
  ];
}

function CopyButton(props: {
  readonly item: CopyItem;
  readonly isCopied: boolean;
  readonly onCopy: (key: string, text: string) => void;
}): ReactElement | null {
  const { item, isCopied, onCopy } = props;
  if (item.text === undefined) return null;
  return (
    <button
      type="button"
      className={styles['action']}
      onClick={() => onCopy(item.key, item.text ?? '')}
    >
      {isCopied ? <Icon name="check" size={16} /> : null}
      {isCopied ? 'Copiado' : item.label}
    </button>
  );
}

// RF34: os botões de copiar (ponto decimal, no tick do par) e o link do par; o app NUNCA envia ordem.
export function ManualCopyButtons({ symbol, texts, speak }: ButtonsProps): ReactElement {
  const { copiedKey, copy } = useCopyValue(speak);
  const url = buildExchangeUrl(symbol);
  return (
    <div className={styles['actions']}>
      {url === undefined ? null : (
        <a
          className={`${styles['action']} ${styles['actionMain']}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Abrir {formatSymbol(symbol)} na Binance
        </a>
      )}
      {listCopyItems(texts).map((item) => (
        <CopyButton
          key={item.key}
          item={item}
          isCopied={copiedKey === item.key}
          onCopy={(key, text) => void copy({ key, text })}
        />
      ))}
    </div>
  );
}
