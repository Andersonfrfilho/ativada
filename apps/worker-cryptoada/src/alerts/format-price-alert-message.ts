// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { PriceAlertPayload } from '../live/alert-payload.schema.js';

const DISCLAIMER = 'Aviso de preço configurado por você: não é recomendação de investimento.';

const VERB = { above: 'subiu acima de', below: 'caiu abaixo de' } as const;

// O disparo de um alerta de preço no Telegram: o par, o valor do usuário e o preço que o cruzou; nada da pessoa.
export function formatPriceAlertMessage(payload: PriceAlertPayload): string {
  return [
    `Alerta de preço · ${payload.symbol}`,
    `O preço ${VERB[payload.direction]} ${payload.threshold} (agora ${payload.price}).`,
    DISCLAIMER,
  ].join('\n');
}
