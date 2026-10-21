// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  EngineDecimal,
  INTRADAY_VERDICT,
  toEngineDecimal,
  type HorizonSummary,
  type IntradaySummary,
} from '@ativada/strategy-engine';

import { HORIZON_INTRADAY_DAYS } from './horizon.constant.js';

const PERCENT_FACTOR = 100;
const DECIMAL_SEPARATOR = ',';

const MESSAGE = {
  INTRADAY_LABEL: 'Operar de 15 em 15 minutos',
  NO_STRATEGY: 'Você ainda não tem estratégia para comparar os prazos desta moeda.',
  NO_DATA: 'Ainda não há candles suficientes para comparar os prazos desta moeda.',
  NO_HORIZON_WORTH: 'Nenhum prazo compensou no histórico desta moeda.',
  SHORT_HISTORY: 'Histórico curto: poucas janelas para confiar.',
  RECOMMENDED: 'É o prazo mais recomendável no histórico.',
} as const;

type PercentParams = {
  readonly places: 0 | 1;
  // Contra o usuário: o ganho e a fração de acertos para baixo, a fatia das taxas para cima.
  readonly rounding: typeof EngineDecimal.ROUND_FLOOR | typeof EngineDecimal.ROUND_CEIL;
  readonly hasSign: boolean;
};

// "0.0041" vira "+0,4%": a conta é no texto decimal, nunca em `Number`, e o arredondamento é sempre contra o usuário.
function formatPercent(fraction: string, params: PercentParams): string {
  const percent = toEngineDecimal(fraction)
    .times(PERCENT_FACTOR)
    .toDecimalPlaces(params.places, params.rounding);
  const digits = percent.toFixed(params.places).replace('.', DECIMAL_SEPARATOR);
  return `${params.hasSign && percent.greaterThan(0) ? '+' : ''}${digits}%`;
}

function describeIntradayWorth(summary: IntradaySummary): string {
  const net = formatPercent(summary.netReturn ?? '0', {
    places: 1,
    rounding: EngineDecimal.ROUND_FLOOR,
    hasSign: true,
  });
  const trades = summary.tradeCount === 1 ? '1 operação' : `${summary.tradeCount} operações`;
  const share =
    summary.feeShareOfGross === null
      ? ''
      : `, taxas de ${formatPercent(summary.feeShareOfGross, { places: 0, rounding: EngineDecimal.ROUND_CEIL, hasSign: false })} do ganho bruto`;
  return `${MESSAGE.INTRADAY_LABEL}: compensou nos últimos ${HORIZON_INTRADAY_DAYS} dias, ${net} depois das taxas (${trades}${share}).`;
}

function intradayReason(summary: IntradaySummary): string {
  if (summary.netReturn === null) return 'sem resultado calculado';
  if (summary.tradeCount === 0)
    return `a estratégia não fechou nenhuma operação nos últimos ${HORIZON_INTRADAY_DAYS} dias`;
  if (summary.feeShareOfGross !== null) return 'as taxas comem o ganho';
  return 'a estratégia perdeu dinheiro mesmo antes das taxas';
}

// RF06: a frase da linha de 15 minutos, escrita aqui e só exibida pelo painel.
export function describeIntradayRow(summary: IntradaySummary): string {
  if (summary.verdict === INTRADAY_VERDICT.WORTH) return describeIntradayWorth(summary);
  return `${MESSAGE.INTRADAY_LABEL}: não compensa (${intradayReason(summary)}).`;
}

// RF06: a frase da linha de N dias. "Recomendável" vai no fim, e só numa linha.
export function describeDailyRow(params: {
  readonly summary: HorizonSummary;
  readonly isRecommended: boolean;
}): string {
  const { summary } = params;
  const label = `Por ${summary.horizonDays} dias`;
  if (summary.median === null || summary.positiveRate === null) {
    return `${label}: ainda não há histórico suficiente para este prazo.`;
  }
  const median = formatPercent(summary.median, {
    places: 1,
    rounding: EngineDecimal.ROUND_FLOOR,
    hasSign: true,
  });
  const positive = formatPercent(summary.positiveRate, {
    places: 0,
    rounding: EngineDecimal.ROUND_FLOOR,
    hasSign: false,
  });
  return [
    `${label}: em geral ${median}, positivo em ${positive} das vezes.`,
    summary.isShortHistory ? MESSAGE.SHORT_HISTORY : undefined,
    params.isRecommended ? MESSAGE.RECOMMENDED : undefined,
  ]
    .filter((sentence) => sentence !== undefined)
    .join(' ');
}

export function describeRecommendation(params: {
  readonly evaluatedStrategies: number;
  readonly hasDailyRows: boolean;
  readonly recommendedHorizonDays: number | undefined;
}): string {
  if (params.evaluatedStrategies === 0) return MESSAGE.NO_STRATEGY;
  if (!params.hasDailyRows) return MESSAGE.NO_DATA;
  if (params.recommendedHorizonDays === undefined) return MESSAGE.NO_HORIZON_WORTH;
  return `O prazo mais recomendável no histórico desta moeda é de ${params.recommendedHorizonDays} dias.`;
}
