// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatDecimalText } from '../../format/decimal.js';
import { formatPrice } from '../../format/format.js';
import { formatDirectedPercent } from './decision-text.js';
import type { RuleTrigger } from './live-status.validation.js';

const POINT_FORMAT = { minimumFraction: 0, maximumFraction: 2 } as const;
const MISSING_TEXT = '—';
const MET_TEXT = 'já atendida';
const NO_ESTIMATE_TEXT = 'depende da próxima vela';

function side(rule: RuleTrigger, above: string, below: string): string {
  return rule.direction === 'above' ? above : below;
}

function formatMetric(rule: RuleTrigger, text: string): string {
  return rule.metric === 'close_price' ? formatPrice(text) : formatDecimalText(text, POINT_FORMAT);
}

// O valor de hoje do indicador que a regra olha; sem leitura ainda, um traço.
export function describeCurrent(rule: RuleTrigger): string {
  return rule.current === null ? MISSING_TEXT : formatMetric(rule, rule.current);
}

// A condição em palavras (o que a regra precisa para votar), no mesmo catálogo do servidor.
export function describeNeed(rule: RuleTrigger): string {
  const limit = rule.threshold === null ? undefined : formatMetric(rule, rule.threshold);
  switch (rule.metric) {
    case 'close_price':
      return limit === undefined
        ? MISSING_TEXT
        : `fechar ${side(rule, 'acima', 'abaixo')} de ${limit}`;
    case 'rsi':
      return limit === undefined
        ? MISSING_TEXT
        : `RSI ${side(rule, 'acima', 'abaixo')} de ${limit}`;
    case 'macd_gap':
      return `MACD ${side(rule, 'acima', 'abaixo')} da linha de sinal`;
    case 'obv_gap':
      return `volume (OBV) ${side(rule, 'acima', 'abaixo')} da média dele`;
    case 'fear_greed_index':
      return limit === undefined
        ? MISSING_TEXT
        : `Fear & Greed em ${limit} ${side(rule, 'ou mais', 'ou menos')}`;
  }
}

export type DistanceText = { readonly text: string; readonly basis: string | undefined };

// A distância em % (a conta é "exata" ou "aproximada", conforme o servidor) ou o motivo de não haver estimativa.
export function describeDistance(rule: RuleTrigger): DistanceText {
  if (rule.isMet) return { text: MET_TEXT, basis: undefined };
  if (rule.distanceRate === null) return { text: NO_ESTIMATE_TEXT, basis: undefined };
  const basis = rule.basis === 'exact' ? 'exata' : 'aproximada';
  return { text: formatDirectedPercent(rule.distanceRate, 'up'), basis };
}
