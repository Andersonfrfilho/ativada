// Copyright (c) 2026 Ada Technology. All rights reserved.
export const TEAM_FAMILY = {
  TREND: 'trend',
  REVERSION: 'reversion',
  VOLUME: 'volume',
  SENTIMENT: 'sentiment',
  OTHER: 'other',
} as const;

export type TeamFamily = (typeof TEAM_FAMILY)[keyof typeof TEAM_FAMILY];

// A família de cada regra segue o ADR 0002 (vocabulário do motor); regra desconhecida vai para "Outras regras".
const FAMILY_BY_KIND: Readonly<Record<string, TeamFamily>> = {
  ema_cross: TEAM_FAMILY.TREND,
  macd: TEAM_FAMILY.TREND,
  donchian_breakout: TEAM_FAMILY.TREND,
  rsi: TEAM_FAMILY.REVERSION,
  bollinger: TEAM_FAMILY.REVERSION,
  obv_trend: TEAM_FAMILY.VOLUME,
  fear_greed: TEAM_FAMILY.SENTIMENT,
};

export function familyOfKind(kind: string): TeamFamily {
  return FAMILY_BY_KIND[kind] ?? TEAM_FAMILY.OTHER;
}

export const FAMILY_ORDER: readonly TeamFamily[] = [
  TEAM_FAMILY.TREND,
  TEAM_FAMILY.REVERSION,
  TEAM_FAMILY.VOLUME,
  TEAM_FAMILY.SENTIMENT,
  TEAM_FAMILY.OTHER,
];

export const FAMILY_LABEL: Readonly<Record<TeamFamily, string>> = {
  trend: 'Tendência',
  reversion: 'Reversão',
  volume: 'Volume',
  sentiment: 'Sentimento',
  other: 'Outras regras',
};

export const TEAM_ROOM_TEXT = {
  TITLE: 'Sala da equipe',
  SUBTITLE:
    'Cada especialista é uma família de regras da estratégia e diz o que votou; o resumo do placar mostra a decisão; o auditor confere os acertos contra a moeda ao ar.',
  ANALYST_NAME: 'Resumo do placar da estratégia',
  AUDITOR_NAME: 'Auditor',
  DISCLAIMER:
    'Tendência, não promessa. Tudo simulado, com dinheiro fictício; nada aqui é recomendação de compra ou venda.',
  NO_OPINION:
    'A equipe não tem opinião nesta vela: nenhuma regra que conta no placar votou a favor ou contra.',
  WAITING_FOR_CANDLE: 'Aguardando a primeira vela fechar.',
  STOPPED: 'Sem simulação rodando agora: a sala mostra a última vela decidida.',
  LOADING: 'Carregando a sala da equipe…',
  ERROR: 'Não deu para carregar a sala agora.',
  RETRY: 'Tentar de novo',
  LINES_SUMMARY: 'Falas desta vela em texto',
  REPLAY: 'Repetir',
  ANIMATION_ON: 'Animação: ligada',
  ANIMATION_OFF: 'Animação: desligada',
  HIDE: 'Esconder a sala',
  SHOW: 'Mostrar a sala',
  PREVIOUS: '← Vela anterior',
  NEXT: 'Próxima vela →',
  BACK_TO_NOW: 'Voltar para agora',
  MORE_OLDER: 'Ver decisões anteriores',
  LAYOUT_CHART_AND_TEAM: 'Gráfico + equipe',
  LAYOUT_ROOM_WITH_CHART: 'Sala com o gráfico',
  NOT_VOTING: 'fora do placar',
  COMPACT_TITLE: 'Equipe agora',
  LATEST_CANDLE: 'Vela que fechou',
  POINTED_CANDLE: 'Vela apontada no gráfico, fechou',
  POINTED_WITHOUT_SPEECH:
    'Esta vela não tem falas gravadas (ainda não fechou ou é anterior às decisões carregadas).',
  MONITOR: 'Monitor da sala: o gráfico da simulação',
  COMPACT_LOADING: 'Carregando a equipe…',
  COMPACT_ERROR: 'Não deu para carregar a equipe agora.',
  COMPACT_HISTORICAL:
    'Esta execução roda sobre o passado: a equipe só opina nas simulações ao vivo. As compras e vendas estão marcadas no gráfico.',
  COMPACT_STOPPED:
    'Esta simulação não está rodando e ainda não registrou nenhuma opinião da equipe.',
  COMPACT_WAITING: 'A equipe ainda está olhando o mercado.',
  COMPACT_FIRST_OPINION: 'A primeira opinião chega quando a primeira vela fechar.',
} as const;

// Legenda (RF13): o que cada voto quer dizer.
export const TEAM_LEGEND = [
  { word: 'a favor', meaning: 'a regra votou a favor de comprar' },
  { word: 'contra', meaning: 'a regra votou contra' },
  { word: 'neutro', meaning: 'sem opinião' },
  { word: 'balão tracejado', meaning: 'fora do placar (não conta nesta vela)' },
] as const;

// Os atrasos da sequência (vela nova, ≤ 1,8 s no total); as durações das animações vêm dos tokens no CSS.
export const TEAM_ROOM_TIMELINE = {
  thinkMilliseconds: 450,
  betweenMilliseconds: 120,
  analystThinkMilliseconds: 250,
  analystSpeakMilliseconds: 300,
  announceAfterMilliseconds: 200,
} as const;

export const MAX_SEQUENCE_MILLISECONDS = 1_800;

export const TEAM_ROOM_STORAGE_KEY = 'ativada.team-room';
