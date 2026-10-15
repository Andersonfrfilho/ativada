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
};
