// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  NO_DATA_DETAIL,
  POSTURE,
  type AuditedKey,
  type NoDataDetail,
  type Posture,
} from './analyst.constant.js';
import type { CadenceMinutes } from './analyst-decision.types.js';

// Catálogo FECHADO de frases do analista (ADR 0002, A17), pt-BR, sem data nem hora. Nenhuma frase promete resultado:
// nada de "vai subir", "garantido", "recomendamos" nem ordem de compra ou venda.

// O analista não corta o tamanho em LIBERADA e nunca diz "confiante", que soa como promessa.
export const POSTURE_LABEL: Readonly<Record<Posture, string>> = {
  [POSTURE.PAUSE]: 'PAUSA',
  [POSTURE.CAUTION]: 'CAUTELA',
  [POSTURE.NORMAL]: 'MODERADA',
  [POSTURE.CONFIDENT]: 'LIBERADA',
};

export const CADENCE_LABEL: Readonly<Record<CadenceMinutes, string>> = {
  15: '15 min',
  60: '1 hora',
  240: '4 horas',
};

export const RISK_FRACTION_LABEL: Readonly<Record<string, string>> = {
  '0.25': '¼',
  '0.5': '½',
  '1': 'o mesmo',
};

export const PAUSE_LINE =
  'Postura agora: PAUSA · nenhuma entrada nova; as saídas da estratégia continuam valendo.';

export const OFF_CADENCE_MESSAGE: Readonly<Record<string, string>> = {
  '60': 'Fora da janela de entrada: com o ritmo de 1 hora, só a vela que fecha na hora cheia pode abrir operação.',
  '240':
    'Fora da janela de entrada: com o ritmo de 4 horas, só a vela que fecha num múltiplo de 4 horas (UTC) pode abrir operação.',
};

export const NO_DATA_MESSAGE: Readonly<Record<NoDataDetail, string>> = {
  [NO_DATA_DETAIL.WAITING_FOR_DATA]: 'Faltam velas recentes: o analista espera os dados chegarem.',
  [NO_DATA_DETAIL.LATE_CANDLE]:
    'A simulação está atrasada em relação ao mercado: o analista não libera entrada até ela alcançar.',
  [NO_DATA_DETAIL.MISSING_CANDLES]:
    'Falta vela nas últimas 24 horas: sem a média de volume completa, o analista não libera entrada.',
  [NO_DATA_DETAIL.WARMING_UP]:
    'O analista ainda está juntando histórico do par (pelo menos 24 horas de velas de 15 min).',
};

export const TEAM_AGAINST_MESSAGE =
  'Os especialistas que provaram acertar apontam para baixo: o analista não deixa abrir operação contra eles.';
export const NO_PROVEN_SPECIALIST_MESSAGE =
  'Nenhum especialista acertou o lado mais vezes que uma moeda ao ar nos últimos 30 dias. Sem previsão.';
export const PROVEN_NEUTRAL_MESSAGE =
  'Os especialistas que provaram valor estão neutros nesta vela. Sem previsão.';
export const SPLIT_TEAM_MESSAGE =
  'Os especialistas que provaram valor se dividem: nenhum lado tem 2/3 do peso. Sem previsão.';
export const WEAK_FORECAST_MESSAGE =
  'Tendência para cima, fraca: menos de 2/3 do peso aprovado a favor.';
export const FIRM_FORECAST_MESSAGE =
  'Tendência para cima, firme, com volume normal ou acima e oscilação dentro do comum.';
export const FIRM_CAPPED_LOW_VOLUME_MESSAGE =
  'Tendência para cima, firme, mas com volume abaixo do normal: tamanho pela metade.';
export const FIRM_CAPPED_HIGH_VOLATILITY_MESSAGE =
  'Tendência para cima, firme, mas com oscilação acima de 90% das velas dos últimos 30 dias: tamanho pela metade.';

export const TRADE_COUNT_LIMIT_TEXT = '8';
export const LOSS_STREAK_LIMIT_TEXT = '3';
export const GOAL_ROOM_NOT_APPLICABLE_LINE = 'Folga até a perda máxima: sem meta, não se aplica';
export const NO_GOAL_MESSAGE = 'Sem meta: o resultado das operações soma no saldo.';
export const MISSING_VALUE = '—';

export const SHADOW_MODE_MESSAGE =
  'Modo sombra: o analista só observa e mostra o que faria; a simulação segue a estratégia sem mudança.';
export const GOVERN_MODE_MESSAGE = 'O analista está decidindo o ritmo e o tamanho desta simulação.';
export const FAILURE_MESSAGE =
  'O analista não conseguiu decidir nesta vela; a simulação seguiu sem ele.';

export const UNAVAILABLE_MESSAGE = {
  not_running: 'A simulação não está rodando: o analista não decide.',
  stalled: 'A simulação parou de avançar; o analista volta quando ela voltar.',
  waiting_for_data: 'A simulação espera velas que faltam; o analista volta quando elas chegarem.',
  no_candle: 'Aguardando a primeira vela de 15 min fechar.',
  warming_up: 'O analista ainda está juntando histórico do par.',
} as const;

export const ANALYST_DISCLAIMER =
  'O analista é uma regra automática sobre dados passados; não é recomendação. Tendência, não promessa. Tudo simulado, com dinheiro fictício.';

export const SPECIALIST_LABEL: Readonly<Record<AuditedKey, string>> = {
  trend: 'Tendência',
  reversion: 'Reversão',
  volume: 'Volume',
  sentiment: 'Sentimento',
  strategy: 'Tendência da estratégia',
};

export const VOTE_LABEL = {
  FOR: 'a favor',
  AGAINST: 'contra',
  NEUTRAL: 'neutro',
  UNREAD: 'sem leitura',
} as const;

export const VERDICT_LABEL = {
  above: 'provou valor',
  even: 'rebaixado: igual à moeda',
  below: 'rebaixado: errou mais que a moeda',
  too_few: 'em observação: menos de 30',
} as const;

export const STRATEGY_WEIGHT_LABEL = 'não vota';

// Palavras que nenhuma frase do catálogo pode conter (RNF11): o contrato de texto varre o catálogo atrás delas.
export const FORBIDDEN_PHRASES: readonly string[] = [
  'vai subir',
  'garantid',
  'recomendamos',
  'compre',
  'venda',
  'confiante',
];
