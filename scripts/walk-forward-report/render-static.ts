// Copyright (c) 2026 Ada Technology. All rights reserved.
export const OVERFITTING_REASON_TEXT: Readonly<Record<string, string>> = {
  sharpe_below_half_of_in_sample:
    'o Sharpe fora da amostra ficou abaixo de metade do Sharpe dentro da amostra',
  negative_out_of_sample_with_positive_in_sample:
    'o Sharpe ficou negativo fora da amostra depois de positivo dentro dela',
  too_few_eligible_windows:
    'menos da metade das janelas teve algum parâmetro que operasse o mínimo exigido',
  out_of_sample_undefined: 'o Sharpe fora da amostra não pôde ser calculado',
};

export const GLOSSARY: readonly string[] = [
  '## Como ler este relatório',
  '',
  '- **Dentro da amostra (ajuste):** os meses em que o sistema _escolhe_ os parâmetros que melhor funcionaram no passado.',
  '- **Fora da amostra (teste):** os 2 meses seguintes, que o sistema não viu na hora de escolher. É o único resultado que importa aqui, porque simula "usar o que foi escolhido, sem saber o que vem depois".',
  '- **Retorno líquido de custos:** quanto o dinheiro fictício cresceu ou encolheu já descontadas taxa de corretagem (0,1% por ordem) e slippage (0,05% de escorregamento de preço).',
  '- **Comprar e segurar:** comprar no começo e não fazer mais nada. É a régua mais simples: se um sistema trabalhoso não a supera, o trabalho não se pagou.',
  '- **Drawdown (queda máxima):** a maior queda do saldo a partir de um pico, antes de se recuperar.',
  '- **Sharpe:** retorno dividido pela oscilação; quanto mais negativo, pior; acima de 1 costuma ser considerado bom. É sensível a poucos dados.',
  '- **Taxa de acerto:** percentual de operações encerradas com lucro. Acertar muito não basta: o tamanho dos ganhos e das perdas também conta.',
  '- **Overfitting (ajuste excessivo):** quando os parâmetros "vencedores" só venceram por acaso no passado e não repetem o desempenho fora da amostra.',
  '',
];

export const LIMITATION: readonly string[] = [
  '## Limitação: isto é o passado',
  '',
  'Todos os números acima vêm de preços que já aconteceram. O walk-forward reduz o risco de enganar a si mesmo (porque testa sempre em meses que o ajuste não viu), mas não elimina: a grade de parâmetros e a própria estratégia foram escolhidas por pessoas que já conheciam, em parte, a história do mercado. Os últimos dois anos são um único cenário; um mercado diferente (outra tendência, outra volatilidade, outro regime de liquidez) pode dar resultado muito diferente. Dados reais da Binance, em preços de fechamento de candle, sem falhas de execução, sem fila de ordens e sem impacto no preço.',
  '',
];

export const NOT_PROVEN: readonly string[] = [
  '## O que isto NÃO prova',
  '',
  '- **Não prova que a estratégia dará lucro no futuro**, nem que dará prejuízo: descreve o que teria acontecido no passado, com regras fixas.',
  '- **Não é recomendação de investimento** nem de compra ou venda de nenhum ativo. O simulador usa dinheiro fictício e regras públicas editáveis pelo usuário.',
  '- **Não prova que os parâmetros escolhidos são "os melhores"**: com poucas operações por janela, a escolha é muito influenciada pelo acaso.',
  '- **Não cobre execução real**: ordens reais têm atraso, falham, enfrentam spread e liquidez diferentes dos modelados, e podem ter custos maiores (inclusive tributários).',
  '- **Não cobre eventos raros** (quebra de corretora, congelamento de saques, mudança de regra) nem períodos fora dos últimos dois anos.',
  '- **Poucas janelas e poucas operações** significam pouca confiança estatística: diferenças de alguns pontos percentuais entre duas configurações podem ser ruído.',
  '',
];
