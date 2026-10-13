// Copyright (c) 2026 Ada Technology. All rights reserved.
export const GLOSSARY_TERM = {
  SHARPE: 'sharpe',
  SORTINO: 'sortino',
  PROFIT_FACTOR: 'profitFactor',
  MAX_DRAWDOWN: 'maxDrawdown',
  WIN_RATE: 'winRate',
  SLIPPAGE: 'slippage',
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
};
