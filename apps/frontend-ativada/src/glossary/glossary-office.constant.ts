// Copyright (c) 2026 Ada Technology. All rights reserved.
// Os termos do escritório de investimento (equipe, balões, lousa, plaquinhas e faixas): uma frase e, quando ajuda, um exemplo.
export type GlossaryEntry = {
  readonly label: string;
  readonly phrase: string;
  // Um exemplo com números de tela, quando ajuda; a dica nunca promete resultado.
  readonly example?: string;
};

export const OFFICE_TERM = {
  RSI: 'rsi',
  BOLLINGER: 'bollinger',
  EMA: 'ema',
  MACD: 'macd',
  DONCHIAN: 'donchian',
  OBV: 'obv',
  FEAR_GREED: 'fearGreed',
  PROTECTION: 'protection',
  NET: 'net',
  GAIN_OVER_RISK: 'gainOverRisk',
  BUY_BAND: 'buyBand',
  SELL_BAND: 'sellBand',
  PROTECTION_BAND: 'protectionBand',
  RULE_AGENT: 'ruleAgent',
  MODEL_AGENT: 'modelAgent',
  IN_OBSERVATION: 'inObservation',
  WEIGHT: 'weight',
  MODEL_TEAM: 'modelTeam',
  TEAM_ROLE: 'teamRole',
  DUEL: 'duel',
  ESTIMATED_COST: 'estimatedCost',
  COST_CEILING: 'costCeiling',
  ON_DEMAND: 'onDemand',
} as const;

export type OfficeTerm = (typeof OFFICE_TERM)[keyof typeof OFFICE_TERM];

export const OFFICE_ENTRIES: Readonly<Record<OfficeTerm, GlossaryEntry>> = {
  [OFFICE_TERM.RSI]: {
    label: 'RSI',
    phrase:
      'Mede, de 0 a 100, se o preço subiu ou caiu rápido demais. Abaixo de 30 lê-se barato; acima de 70, caro.',
    example: 'Exemplo: RSI 34,6 não é barato nem caro.',
  },
  [OFFICE_TERM.BOLLINGER]: {
    label: 'Banda de Bollinger',
    phrase:
      'Faixa em volta da média das últimas 20 velas. Fechar abaixo da banda de baixo é um exagero que às vezes volta.',
    example: 'Exemplo: banda de baixo em 12,862.',
  },
  [OFFICE_TERM.EMA]: {
    label: 'EMA (média)',
    phrase:
      'Média do preço que pesa mais as velas recentes. Rápida acima da lenta indica preço subindo.',
    example: 'Exemplo: EMA 9 em 12,928 e EMA 21 em 12,948.',
  },
  [OFFICE_TERM.MACD]: {
    label: 'MACD',
    phrase:
      'Diferença entre duas médias do preço contra uma linha de sinal. Acima da linha indica força para cima.',
  },
  [OFFICE_TERM.DONCHIAN]: {
    label: 'Donchian',
    phrase: 'A máxima e a mínima das últimas 20 velas. Fechar acima da máxima indica rompimento.',
  },
  [OFFICE_TERM.OBV]: {
    label: 'OBV (volume)',
    phrase:
      'Soma o volume das velas que subiram e desconta o das que caíram. Acima da média dele, o volume confirma a subida.',
  },
  [OFFICE_TERM.FEAR_GREED]: {
    label: 'Medo e Ganância',
    phrase:
      'Índice diário de 0 a 100 do humor do mercado de cripto. Até 25 é medo; a partir de 75, ganância.',
    example: 'Exemplo: hoje 41, nem medo nem ganância.',
  },
  [OFFICE_TERM.PROTECTION]: {
    label: 'Proteção contra queda',
    phrase:
      'O preço em que a simulação vende para limitar a perda. É a regra da simulação, não uma ordem para você.',
    example: 'Exemplo: se cair a 12,789, vende (−0,93% líquido).',
  },
  [OFFICE_TERM.NET]: {
    label: 'Líquido',
    phrase: 'O resultado depois da taxa e do deslizamento na compra e na venda.',
    example: 'Exemplo: custo de ida e volta de 0,30% tira 0,30 ponto do bruto.',
  },
  [OFFICE_TERM.GAIN_OVER_RISK]: {
    label: 'Ganho ÷ risco',
    phrase:
      'Quanto se ganha no alvo para cada 1 perdido na proteção, com custos. Abaixo de 1, ganha-se menos do que se arrisca.',
    example: 'Exemplo: 0,76% ÷ 0,93% = 0,8.',
  },
  [OFFICE_TERM.BUY_BAND]: {
    label: 'Faixa de compra',
    phrase:
      'Zona de preço até onde a regra da estratégia passa a votar a favor de comprar. É regra da simulação, não recomendação.',
  },
  [OFFICE_TERM.SELL_BAND]: {
    label: 'Faixa de venda',
    phrase:
      'Zona de preço da entrada até o alvo, onde a simulação realiza o lucro. É regra da simulação, não recomendação.',
  },
  [OFFICE_TERM.PROTECTION_BAND]: {
    label: 'Faixa de proteção',
    phrase:
      'Zona de preço do stop até a entrada, onde a simulação vende para limitar a perda. Não é recomendação.',
  },
  [OFFICE_TERM.RULE_AGENT]: {
    label: 'Agente de regra',
    phrase: 'Segue uma conta fixa sobre o preço: a mesma vela dá sempre a mesma opinião.',
  },
  [OFFICE_TERM.MODEL_AGENT]: {
    label: 'Agente de modelo',
    phrase:
      'Usa um modelo de linguagem em vez de uma conta fixa. Pode errar, e o auditor mede o acerto dele à parte.',
  },
  [OFFICE_TERM.IN_OBSERVATION]: {
    label: 'Em observação',
    phrase: 'Menos de 30 previsões contadas: ainda não dá para medir o acerto, então não vota.',
    example: 'Exemplo: Nina: 12 contadas, faltam 18.',
  },
  [OFFICE_TERM.WEIGHT]: {
    label: 'Peso',
    phrase: 'Quanto o voto conta para a Alice. Quem não provou valor tem peso 0.',
  },
  [OFFICE_TERM.MODEL_TEAM]: {
    label: 'Equipe de modelo',
    phrase:
      'Um modelo de linguagem com três papéis (tendência, risco e gestor) que indica compra, venda ou espera. Pode errar.',
    example: 'Exemplo: ◆ Nina (Gemini) indica comprar.',
  },
  [OFFICE_TERM.TEAM_ROLE]: {
    label: 'Papel',
    phrase:
      'Cada equipe tem três papéis: o analista de tendência, o analista de risco e o gestor, que dá a indicação.',
  },
  [OFFICE_TERM.DUEL]: {
    label: 'Duelo',
    phrase:
      'Equipes e regras operam o mesmo par, na mesma vela e com o mesmo saldo fictício, para comparar.',
  },
  [OFFICE_TERM.ESTIMATED_COST]: {
    label: 'Custo estimado',
    phrase:
      'O gasto da chamada ao modelo, pelos tokens e pelo preço configurado. A fatura do provedor é a palavra final.',
    example: 'Exemplo: US$ 0,0109 por opinião.',
  },
  [OFFICE_TERM.COST_CEILING]: {
    label: 'Teto de custo',
    phrase:
      'O limite de gasto com modelos por dia e por mês; ao chegar nele, as equipes param até o período virar.',
  },
  [OFFICE_TERM.ON_DEMAND]: {
    label: 'Pedido avulso',
    phrase:
      'Uma opinião pedida na hora, só para testar. Não entra no placar de acertos e nunca comanda ordem.',
  },
};
