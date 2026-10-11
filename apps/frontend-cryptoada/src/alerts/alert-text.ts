// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatDecimal, formatSymbol } from '../format/format.js';
import { ApiError } from '../http/api.error.js';
import type { PriceAlert } from './alerts.validation.js';

export const PRICE_ALERT_ERROR_TEXT: Readonly<Record<string, string>> = {
  PRICE_ALERT_LIMIT_REACHED:
    'Você atingiu o limite de alertas de preço ligados. Desligue ou apague um.',
  PRICE_ALERT_NOT_FOUND: 'Esse alerta não existe mais.',
};

export function describeAlert(alert: Pick<PriceAlert, 'symbol' | 'direction' | 'value'>): string {
  const verb = alert.direction === 'above' ? 'subiu acima de' : 'caiu abaixo de';
  return `${formatSymbol(alert.symbol)} ${verb} ${formatDecimal(alert.value)}`;
}

// O nome do alerta nos botões: sem verbo no passado, para valer também para o que ainda não disparou.
export function nameAlert(alert: Pick<PriceAlert, 'symbol' | 'direction' | 'value'>): string {
  const side = alert.direction === 'above' ? 'acima de' : 'abaixo de';
  return `${formatSymbol(alert.symbol)} ${side} ${formatDecimal(alert.value)}`;
}

export function messageFromAlertError(error: Error | null): string | undefined {
  if (error === null) return undefined;
  if (error instanceof ApiError) return PRICE_ALERT_ERROR_TEXT[error.code] ?? error.message;
  return 'Não foi possível concluir. Tente novamente.';
}
