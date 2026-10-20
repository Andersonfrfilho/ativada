// Copyright (c) 2026 Ada Technology. All rights reserved.
import { STRATEGY_FAMILY, toEngineDecimal, type StrategyFamily } from '@ativada/strategy-engine';

import { formatPoints } from '../live-status/live-number-format.js';

// O catálogo fechado das respostas de "Pergunte à equipe" (ADR 0002 "Perguntas à equipe"): nenhuma frase leva data nem hora (o
// painel mostra a vela no fuso do usuário) e nenhuma manda comprar ou vender.
export const QUESTIONS_NOTICE =
  'Leitura da estratégia desta simulação sobre velas já fechadas. Não é recomendação de compra ou venda.';

const FAMILY_NOUN: Readonly<Record<StrategyFamily, string>> = {
  [STRATEGY_FAMILY.TREND]: 'tendência',
  [STRATEGY_FAMILY.REVERSION]: 'reversão',
  [STRATEGY_FAMILY.VOLUME]: 'volume',
  [STRATEGY_FAMILY.SENTIMENT]: 'sentimento',
};

// Como o voto da regra se lê em cada família (+1 a favor da compra, −1 contra, 0 neutro).
const VOTE_READING: Readonly<Record<StrategyFamily, Readonly<Record<-1 | 0 | 1, string>>>> = {
  [STRATEGY_FAMILY.TREND]: {
    1: 'a tendência está de alta e a regra vota a favor da compra',
    0: 'a tendência está sem direção e a regra fica neutra',
    [-1]: 'a tendência está de baixa e a regra vota contra a compra',
  },
  [STRATEGY_FAMILY.REVERSION]: {
    1: 'o preço está esticado para baixo, e a regra vota a favor da compra',
    0: 'o preço não está esticado, e a regra fica neutra',
    [-1]: 'o preço está esticado para cima, e a regra vota contra a compra',
  },
  [STRATEGY_FAMILY.VOLUME]: {
    1: 'o volume confirma a alta, e a regra vota a favor da compra',
    0: 'o volume não confirma nem nega, e a regra fica neutra',
    [-1]: 'o volume não confirma a alta, e a regra vota contra a compra',
  },
  [STRATEGY_FAMILY.SENTIMENT]: {
    1: 'o sentimento favorece a compra',
    0: 'o sentimento deixa a regra neutra',
    [-1]: 'o sentimento pesa contra a compra',
  },
};

export function describeNoData(symbol: string): string {
  return `Sem dados de ${symbol} ainda.`;
}

export function describeWarmingUp(symbol: string): string {
  return `Ainda não há velas fechadas suficientes de ${symbol} para essa leitura.`;
}

export function describeNoRule(family: StrategyFamily): string {
  return `A estratégia desta simulação não tem regra de ${FAMILY_NOUN[family]}: essa leitura fica fora do placar.`;
}

// "Em ETHUSDT, pela EMA 9×21, a tendência está de alta…" e, se a regra ainda não vota a favor, o que falta (a frase do próximo
// gatilho, ou nada quando ela já vota).
export function describeRuleReading(params: {
  readonly symbol: string;
  readonly label: string;
  readonly family: StrategyFamily;
  readonly vote: -1 | 0 | 1;
  readonly trigger: string | undefined;
}): string {
  const lead = `Em ${params.symbol}, pela ${params.label}, ${VOTE_READING[params.family][params.vote]}.`;
  return params.trigger === undefined ? lead : `${lead} ${params.trigger}`;
}

// O índice com 1 casa no máximo; a leitura vem do motor como número.
function formatIndex(value: number): string {
  return formatPoints(toEngineDecimal(String(value)).toDecimalPlaces(1).toFixed());
}

export function describeSentiment(params: {
  readonly value: number | undefined;
  readonly isScored: boolean;
}): string {
  if (params.value === undefined) return 'Ainda não há leitura recente do Fear & Greed.';
  const lead = `O Fear & Greed mais recente está em ${formatIndex(params.value)} de 100 (0 é medo extremo, 100 é ganância extrema). Ele vale para o mercado inteiro, não só para um par.`;
  return params.isScored
    ? lead
    : `${lead} A estratégia desta simulação não usa o sentimento no placar.`;
}

export function describeOtherSymbolPlan(params: {
  readonly symbol: string;
  readonly runSymbol: string;
}): string {
  return `O plano de operação só existe para ${params.runSymbol}, o par desta simulação. Para ${params.symbol}, pergunte o que falta para comprar.`;
}

export function describeOtherSymbolTrackRecord(runSymbol: string): string {
  return `Só conto as previsões desta simulação, que é em ${runSymbol}.`;
}

export function describeTeamRunTrackRecord(): string {
  return 'Esta simulação segue a leitura de uma equipe de modelo: não há previsão do placar para contar.';
}
