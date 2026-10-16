// Copyright (c) 2026 Ada Technology. All rights reserved.
export const GLOSSARY_TERM = {
  SHARPE: 'sharpe',
  SORTINO: 'sortino',
  PROFIT_FACTOR: 'profitFactor',
  MAX_DRAWDOWN: 'maxDrawdown',
  WIN_RATE: 'winRate',
  SLIPPAGE: 'slippage',
  CANDLE: 'candle',
  SCORE: 'score',
  THRESHOLD: 'threshold',
  BUY_AND_HOLD: 'buyAndHold',
  STOP_PRICE: 'stopPrice',
  TARGET_PRICE: 'targetPrice',
  FORMING_CANDLE: 'formingCandle',
  VOLUME: 'volume',
  SCOREBOARD: 'scoreboard',
  TREND: 'trend',
  ATR_BAND: 'atrBand',
  SIDE_HIT_RATE: 'sideHitRate',
  COIN_FLIP: 'coinFlip',
  TEAM: 'team',
  SPECIALIST: 'specialist',
  AUDITOR: 'auditor',
  ANALYST: 'analyst',
  POSTURE: 'posture',
  CADENCE: 'cadence',
  CONFIDENCE_INTERVAL: 'confidenceInterval',
  NO_FORECAST: 'noForecast',
  LOCK: 'lock',
  SHADOW_MODE: 'shadowMode',
} as const;

export type GlossaryTerm = (typeof GLOSSARY_TERM)[keyof typeof GLOSSARY_TERM];

export type GlossaryEntry = { readonly label: string; readonly phrase: string };

// Fonte única das dicas (spec 005, RF13): a mesma palavra tem a mesma frase em toda tela.
export const GLOSSARY: Readonly<Record<GlossaryTerm, GlossaryEntry>> = {
  [GLOSSARY_TERM.SHARPE]: {
    label: 'Sharpe',
    phrase: 'Quanto a estratégia ganhou para cada unidade de sobe-e-desce. Acima de 1 é bom.',
  },
  [GLOSSARY_TERM.SORTINO]: {
    label: 'Sortino',
    phrase: 'Igual ao Sharpe, mas só conta as quedas como risco.',
  },
  [GLOSSARY_TERM.PROFIT_FACTOR]: {
    label: 'Fator de lucro',
    phrase:
      'Tudo o que se ganhou dividido por tudo o que se perdeu. Acima de 1, ganhou mais do que perdeu.',
  },
  [GLOSSARY_TERM.MAX_DRAWDOWN]: {
    label: 'Maior queda',
    phrase: 'A maior perda, do ponto mais alto ao mais baixo, antes de se recuperar.',
  },
  [GLOSSARY_TERM.WIN_RATE]: {
    label: 'Taxa de acerto',
    phrase: 'De cada 100 operações, quantas terminaram no lucro.',
  },
  [GLOSSARY_TERM.SLIPPAGE]: {
    label: 'Slippage',
    phrase: 'A diferença entre o preço esperado e o preço em que a ordem de fato saiu.',
  },
  [GLOSSARY_TERM.CANDLE]: {
    label: 'Vela',
    phrase:
      'Um trecho de tempo (1 hora, por exemplo) com o preço de abertura, o maior, o menor e o de fechamento.',
  },
  [GLOSSARY_TERM.SCORE]: {
    label: 'Pontuação do placar',
    phrase:
      'A soma dos votos das regras: cada uma vota a favor, contra ou fica neutra, e o peso dela conta.',
  },
  [GLOSSARY_TERM.THRESHOLD]: {
    label: 'Limiar',
    phrase: 'A pontuação mínima que dispara a compra ou a venda; abaixo dela, a simulação espera.',
  },
  [GLOSSARY_TERM.BUY_AND_HOLD]: {
    label: 'Comprar e segurar',
    phrase: 'O que você teria hoje se tivesse comprado no começo e nunca mais vendido, sem operar.',
  },
  [GLOSSARY_TERM.STOP_PRICE]: {
    label: 'Stop',
    phrase: 'O preço de proteção: se o preço cair até ele, a simulação vende para limitar a perda.',
  },
  [GLOSSARY_TERM.TARGET_PRICE]: {
    label: 'Alvo',
    phrase: 'O preço de lucro: se o preço subir até ele, a simulação vende e garante o ganho.',
  },
  [GLOSSARY_TERM.FORMING_CANDLE]: {
    label: 'Vela em formação',
    phrase: 'A vela de agora, que ainda não fechou: os valores mudam até o tempo dela acabar.',
  },
  [GLOSSARY_TERM.VOLUME]: {
    label: 'Volume',
    phrase: 'Quanto da moeda foi negociado durante a vela. Barra alta quer dizer muita negociação.',
  },
  [GLOSSARY_TERM.SCOREBOARD]: {
    label: 'Placar',
    phrase:
      'A pontuação das regras em cada vela: acima de zero puxa para comprar, abaixo, para vender.',
  },
  [GLOSSARY_TERM.TREND]: {
    label: 'Tendência',
    phrase: 'Para que lado o placar está inclinado agora. Não é promessa nem previsão do preço.',
  },
  [GLOSSARY_TERM.ATR_BAND]: {
    label: 'Faixa (ATR)',
    phrase:
      'Quanto o preço costuma andar numa vela, pela média das últimas (ATR). Não é um limite.',
  },
  [GLOSSARY_TERM.SIDE_HIT_RATE]: {
    label: 'Acerto do lado',
    phrase:
      'Em quantas previsões o preço fechou, na vela seguinte, do lado que a tendência apontava.',
  },
  [GLOSSARY_TERM.COIN_FLIP]: {
    label: 'Moeda ao ar',
    phrase: 'A referência de 50%: o acerto esperado de quem escolhe o lado jogando uma moeda.',
  },
  [GLOSSARY_TERM.TEAM]: {
    label: 'Equipe',
    phrase:
      'As famílias de regras da estratégia (tendência, reversão, volume e sentimento), cada uma com o seu voto.',
  },
  [GLOSSARY_TERM.SPECIALIST]: {
    label: 'Especialista',
    phrase:
      'Uma família de indicadores (tendência, reversão, volume ou sentimento). Vota a favor, contra ou fica neutra.',
  },
  [GLOSSARY_TERM.AUDITOR]: {
    label: 'Auditor',
    phrase:
      'Confere em quantas velas cada especialista acertou o lado e compara com a moeda ao ar (50%).',
  },
  [GLOSSARY_TERM.ANALYST]: {
    label: 'Analista de risco',
    phrase:
      'Uma regra automática que só tira risco: pausa as entradas e reduz o tamanho; nunca compra por conta própria.',
  },
  [GLOSSARY_TERM.POSTURE]: {
    label: 'Postura',
    phrase: 'O quanto o analista libera a simulação agora: pausa, cautela, moderada ou liberada.',
  },
  [GLOSSARY_TERM.CADENCE]: {
    label: 'Ritmo',
    phrase:
      'De quanto em quanto tempo o analista aceita uma entrada nova: a cada 15 min, 1 hora ou 4 horas.',
  },
  [GLOSSARY_TERM.CONFIDENCE_INTERVAL]: {
    label: 'Intervalo de confiança',
    phrase:
      'A faixa em que o acerto verdadeiro provavelmente está, com 95% de confiança; poucas previsões deixam a faixa larga.',
  },
  [GLOSSARY_TERM.NO_FORECAST]: {
    label: 'Sem previsão',
    phrase:
      'Quando os especialistas que provaram valor não apontam um lado, o analista não opina sobre a próxima vela.',
  },
  [GLOSSARY_TERM.LOCK]: {
    label: 'Trava',
    phrase:
      'Um freio automático das entradas: perda do dia, perdas seguidas, excesso de operações, pouca folga ou taxas altas.',
  },
  [GLOSSARY_TERM.SHADOW_MODE]: {
    label: 'Modo sombra',
    phrase:
      'O analista só observa e mostra o que faria; a simulação segue a estratégia sem nenhuma mudança.',
  },
};
