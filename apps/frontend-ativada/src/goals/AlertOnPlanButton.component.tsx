// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { messageFromAlertError } from '../alerts/alert-text.js';
import { useCreatePriceAlertMutation } from '../alerts/alerts.query.js';
import { formatPrice } from '../format/format.js';
import controls from '../styles/Controls.module.css';

const LEVEL_NAME = { buy: 'compra', target: 'alvo', stop: 'stop' } as const;

export type AlertOnPlanButtonProps = {
  readonly kind: keyof typeof LEVEL_NAME;
  readonly price: string;
  readonly symbol: string;
  readonly lastClose: string;
};

// O alerta dispara do lado de onde o preço vem: nível acima do último fechamento avisa na subida, abaixo avisa na queda.
export function AlertOnPlanButton({
  kind,
  price,
  symbol,
  lastClose,
}: AlertOnPlanButtonProps): ReactElement {
  const create = useCreatePriceAlertMutation();
  const message = messageFromAlertError(create.error);

  function handleClick(): void {
    create.mutate({
      symbol,
      direction: Number(price) > Number(lastClose) ? 'above' : 'below',
      value: price,
      origin: 'plan',
    });
  }

  return (
    <div>
      <button
        type="button"
        className={controls.button}
        aria-label={`Avisar no plano: ${LEVEL_NAME[kind]} em ${formatPrice(price)}`}
        disabled={create.isPending}
        onClick={handleClick}
      >
        Avisar no plano
      </button>
      {create.isSuccess ? (
        <p role="status">Alerta criado: avisamos quando o preço chegar lá.</p>
      ) : null}
      {message === undefined ? null : (
        <p role="alert" className={controls.error}>
          {message}
        </p>
      )}
    </div>
  );
}
