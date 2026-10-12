# Relatório de walk-forward do Placar clássico (T6.4)

> Simulação com dados do passado e dinheiro fictício. Não é recomendação de investimento nem promessa de resultado.

## Resumo para quem decide

- **BTCUSDT 1 hora:** fora da amostra, a estratégia fez -30,41% líquido de custos contra -14,51% de comprar e segurar nos mesmos meses; 0 de 8 janelas terminaram positivas.
- BTCUSDT 1 hora: 206 operações, taxa de acerto 34,5%, queda máxima 36,36%; Sharpe fora da amostra -2,32.
- BTCUSDT 1 hora: alerta de overfitting **apagado** (apagado porque o melhor parâmetro já não ganhava no ajuste: isso não indica robustez); em 0 de 8 janelas elegíveis o parâmetro vencedor no ajuste perdeu dinheiro no teste. Sem custos o retorno seria -3,58%.
- **ETHUSDT 1 dia:** fora da amostra, a estratégia fez -1,67% líquido de custos contra -39,74% de comprar e segurar nos mesmos meses; 1 de 5 janelas terminaram positivas.
- ETHUSDT 1 dia: 6 operações, taxa de acerto 33,3%, queda máxima 3,85%; Sharpe fora da amostra -0,62.
- ETHUSDT 1 dia: alerta de overfitting **aceso**; em 2 de 5 janelas elegíveis o parâmetro vencedor no ajuste perdeu dinheiro no teste. Sem custos o retorno seria -2,77%.
- Este relatório descreve o passado com dinheiro fictício. Não é recomendação de investimento e não promete resultado futuro (ver "O que isto NÃO prova").

## O que foi testado

- **Estratégia:** o "Placar clássico" de fábrica: quatro votos (cruzamento de médias EMA, MACD, RSI e volume OBV) ponderados pelo regime de mercado (ADX); compra com pontuação a partir de +2, vende a partir de −2, stop de 2× ATR e alvo de 3× ATR, risco de 1% do saldo por operação.
- **Método:** walk-forward. A cada passo, o sistema escolhe, entre 162 combinações da grade abaixo, a que teve o melhor Sharpe nos 6 meses de ajuste e a aplica nos 2 meses seguintes, que ele ainda não viu; depois anda 2 meses e repete. O resultado principal é só o dos meses de teste emendados.
- **Grade de parâmetros** (catálogo fechado do produto):
  - `rules.ema-9-21.fastPeriod`: 6, 9, 12
  - `rules.ema-9-21.slowPeriod`: 18, 21, 26
  - `thresholds.buy`: 1.5, 2, 2.5
  - `risk.stopAtrMultiple`: 1.5, 2, 3
  - `risk.targetAtrMultiple`: 3, 4
- **Custos:** taxa de 0,1% por ordem e slippage de 0,05% (padrões do produto), sempre descontados. Para medir o peso deles, cada série foi rodada também com custo zero.
- **Dados:** velas (candles) reais da Binance guardadas na base da simulação ao vivo, dos últimos 2 anos; consulta somente leitura. O mínimo de operações exigido no ajuste, por série, está em "Rastreabilidade".

## Como ler este relatório

- **Dentro da amostra (ajuste):** os meses em que o sistema _escolhe_ os parâmetros que melhor funcionaram no passado.
- **Fora da amostra (teste):** os 2 meses seguintes, que o sistema não viu na hora de escolher. É o único resultado que importa aqui, porque simula "usar o que foi escolhido, sem saber o que vem depois".
- **Retorno líquido de custos:** quanto o dinheiro fictício cresceu ou encolheu já descontadas taxa de corretagem (0,1% por ordem) e slippage (0,05% de escorregamento de preço).
- **Comprar e segurar:** comprar no começo e não fazer mais nada. É a régua mais simples: se um sistema trabalhoso não a supera, o trabalho não se pagou.
- **Drawdown (queda máxima):** a maior queda do saldo a partir de um pico, antes de se recuperar.
- **Sharpe:** retorno dividido pela oscilação; quanto mais negativo, pior; acima de 1 costuma ser considerado bom. É sensível a poucos dados.
- **Taxa de acerto:** percentual de operações encerradas com lucro. Acertar muito não basta: o tamanho dos ganhos e das perdas também conta.
- **Overfitting (ajuste excessivo):** quando os parâmetros "vencedores" só venceram por acaso no passado e não repetem o desempenho fora da amostra.

## Resultado fora da amostra

### BTCUSDT 1 hora

Resultado dos meses de teste emendados (8 janelas, 11688 candles), com custos.

| Medida | Valor |
| --- | --- |
| Retorno líquido de custos (fora da amostra, concatenado) | -30,41% |
| Retorno anualizado | -23,81% |
| Comprar e segurar nos mesmos meses de teste | -14,51% |
| Diferença para comprar e segurar | -15,90% |
| Sharpe / Sortino | -2,32 / -3,28 |
| Queda máxima (drawdown) / duração | 36,36% / 467 dias |
| Operações fechadas | 206 |
| Taxa de acerto | 34,5% |
| Fator de lucro (ganhos ÷ perdas) | 0,66 |
| Tempo exposto ao mercado | 31,0% |
| Taxas pagas | US$ 2.181,46 |
| Resultado em dinheiro fictício (saldo inicial US$ 10.000) | US$ -3.040,57 |

**Por janela** (cada janela começa com saldo fictício novo; a coluna "Sharpe no ajuste" é o resultado do parâmetro vencedor _dentro_ da amostra):

| # | Meses de teste | Parâmetros escolhidos no ajuste | Sharpe no ajuste | Retorno no teste | Comprar e segurar | Queda máx. | Operações | Acerto |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2025-04-21 a 2025-06-21 | fastPeriod=9, slowPeriod=26, buy=2.5, stopAtrMultiple=3, targetAtrMultiple=4 | -0,39 | -0,96% | 20,91% | 5,11% | 24 | 38% |
| 2 | 2025-06-21 a 2025-08-21 | fastPeriod=9, slowPeriod=26, buy=2.5, stopAtrMultiple=3, targetAtrMultiple=4 | -2,07 | -0,98% | 10,29% | 3,22% | 19 | 47% |
| 3 | 2025-08-21 a 2025-10-21 | fastPeriod=9, slowPeriod=26, buy=2.5, stopAtrMultiple=3, targetAtrMultiple=4 | -0,85 | -0,30% | -3,56% | 3,59% | 20 | 45% |
| 4 | 2025-10-21 a 2025-12-21 | fastPeriod=9, slowPeriod=26, buy=2.5, stopAtrMultiple=3, targetAtrMultiple=4 | -0,37 | -7,33% | -20,30% | 9,37% | 21 | 29% |
| 5 | 2025-12-21 a 2026-02-21 | fastPeriod=6, slowPeriod=26, buy=2.5, stopAtrMultiple=2, targetAtrMultiple=3 | -1,11 | -6,85% | -23,25% | 7,07% | 23 | 30% |
| 6 | 2026-02-21 a 2026-04-21 | fastPeriod=9, slowPeriod=26, buy=2.5, stopAtrMultiple=2, targetAtrMultiple=3 | -1,71 | -5,48% | 11,16% | 7,53% | 28 | 36% |
| 7 | 2026-04-21 a 2026-06-21 | fastPeriod=12, slowPeriod=26, buy=2.5, stopAtrMultiple=2, targetAtrMultiple=3 | -1,77 | -7,21% | -15,47% | 8,91% | 26 | 31% |
| 8 | 2026-06-21 a 2026-08-21 | fastPeriod=9, slowPeriod=18, buy=2, stopAtrMultiple=3, targetAtrMultiple=4 | -2,26 | -5,97% | 13,23% | 10,19% | 39 | 28% |

Janelas com retorno positivo: **0 de 8**. Retorno médio por janela: -4,39%; mediana: -5,73%; pior: -7,33%; melhor: -0,30%. Operações por janela de teste, em média: 25,0.

Em 6 janela(s) havia posição aberta no fim do teste; ela é encerrada ao preço de fechamento para a janela seguinte começar do zero.

### ETHUSDT 1 dia

Resultado dos meses de teste emendados (5 janelas, 304 candles), com custos.

| Medida | Valor |
| --- | --- |
| Retorno líquido de custos (fora da amostra, concatenado) | -1,67% |
| Retorno anualizado | -2,00% |
| Comprar e segurar nos mesmos meses de teste | -39,74% |
| Diferença para comprar e segurar | 38,07% |
| Sharpe / Sortino | -0,62 / -0,85 |
| Queda máxima (drawdown) / duração | 3,85% / 223 dias |
| Operações fechadas | 6 |
| Taxa de acerto | 33,3% |
| Fator de lucro (ganhos ÷ perdas) | 0,49 |
| Tempo exposto ao mercado | 34,9% |
| Taxas pagas | US$ 9,90 |
| Resultado em dinheiro fictício (saldo inicial US$ 10.000) | US$ -166,59 |

**Por janela** (cada janela começa com saldo fictício novo; a coluna "Sharpe no ajuste" é o resultado do parâmetro vencedor _dentro_ da amostra):

| # | Meses de teste | Parâmetros escolhidos no ajuste | Sharpe no ajuste | Retorno no teste | Comprar e segurar | Queda máx. | Operações | Acerto |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2025-10-26 a 2025-12-26 | fastPeriod=9, slowPeriod=18, buy=1.5, stopAtrMultiple=2, targetAtrMultiple=4 | 1,96 | -1,00% | -26,77% | 1,00% | 1 | 0% |
| 2 | 2025-12-26 a 2026-02-26 | fastPeriod=12, slowPeriod=26, buy=1.5, stopAtrMultiple=1.5, targetAtrMultiple=4 | 1,79 | -1,00% | -29,36% | 2,10% | 1 | 0% |
| 3 | 2026-02-26 a 2026-04-26 | fastPeriod=12, slowPeriod=26, buy=1.5, stopAtrMultiple=2, targetAtrMultiple=3 | -1,98 | -0,33% | 12,40% | 1,78% | 1 | 0% |
| 4 | 2026-04-26 a 2026-06-26 | fastPeriod=6, slowPeriod=26, buy=1.5, stopAtrMultiple=1.5, targetAtrMultiple=3 | -0,33 | 0,00% | -32,61% | 0,00% | 0 | n/d |
| 5 | 2026-06-26 a 2026-08-26 | fastPeriod=6, slowPeriod=21, buy=1.5, stopAtrMultiple=3, targetAtrMultiple=3 | 0,07 | 0,67% | 55,33% | 0,62% | 1 | 100% |

Janelas com retorno positivo: **1 de 5**. Retorno médio por janela: -0,33%; mediana: -0,33%; pior: -1,00%; melhor: 0,67%. Operações por janela de teste, em média: 0,8.

**Pouca confiança estatística:** só 6 operações no total fora da amostra. Com tão poucas operações, o resultado é dominado pelo acaso e não permite concluir que a estratégia ganha ou perde.

Em 2 janela(s) havia posição aberta no fim do teste; ela é encerrada ao preço de fechamento para a janela seguinte começar do zero.

## Comparação com comprar e segurar

**BTCUSDT 1 hora.** Nos mesmos meses de teste, a estratégia fez -30,41% e comprar e segurar fez -14,51% (diferença -15,90%). Em **4 de 8 janelas** a estratégia ficou abaixo de comprar e segurar. Para contexto, comprar e segurar de 2024-10-21 até 2026-10-12 (o período todo, não só os meses de teste, sem custos) teria feito 21,12%.

**ETHUSDT 1 dia.** Nos mesmos meses de teste, a estratégia fez -1,67% e comprar e segurar fez -39,74% (diferença 38,07%). Em **2 de 5 janelas** a estratégia ficou abaixo de comprar e segurar. Para contexto, comprar e segurar de 2025-04-26 até 2026-10-12 (o período todo, não só os meses de teste, sem custos) teria feito 42,16%.

## Alerta de overfitting

**BTCUSDT 1 hora: alerta apagado.** Sharpe dentro da amostra: -1,32; fora da amostra: -2,32; razão fora ÷ dentro: n/d. Motivos: nenhum critério de alerta foi atingido.

Em **0 de 8 janelas** com parâmetro elegível, o parâmetro vencedor tinha Sharpe positivo no ajuste e **perdeu dinheiro** no teste seguinte. Janelas com algum parâmetro elegível: 8 de 8.

**Atenção ao alerta apagado:** o alerta só compara o teste com um ganho que existisse no ajuste. Aqui o melhor parâmetro de cada janela já não ganhava nem dentro da amostra (Sharpe no ajuste zero ou negativo). Alerta apagado, neste caso, **não indica robustez**: indica ausência de vantagem desde o ajuste.

Em 8 de 8 janelas pelo menos um parâmetro vencedor ficou na **borda da grade** (o menor ou o maior valor testado): isso sugere que a grade pode não conter o melhor valor, e que o "vencedor" é só o menos ruim entre as opções oferecidas.

**ETHUSDT 1 dia: ALERTA ACESO.** Sharpe dentro da amostra: 0,30; fora da amostra: -0,62; razão fora ÷ dentro: -2,05. Motivos: o Sharpe fora da amostra ficou abaixo de metade do Sharpe dentro da amostra; o Sharpe ficou negativo fora da amostra depois de positivo dentro dela.

Em **2 de 5 janelas** com parâmetro elegível, o parâmetro vencedor tinha Sharpe positivo no ajuste e **perdeu dinheiro** no teste seguinte. Janelas com algum parâmetro elegível: 5 de 5.

Em 5 de 5 janelas pelo menos um parâmetro vencedor ficou na **borda da grade** (o menor ou o maior valor testado): isso sugere que a grade pode não conter o melhor valor, e que o "vencedor" é só o menos ruim entre as opções oferecidas.

## Impacto dos custos

**BTCUSDT 1 hora.**

| Cenário | Retorno fora da amostra | Operações | Taxas pagas (US$) | Sharpe |
| --- | --- | --- | --- | --- |
| Com custos (taxa 0,1% + slippage 0,05%) | -30,41% | 206 | 2.181,46 | -2,32 |
| Sem custos (taxa 0 e slippage 0) | -3,58% | 358 | 0,00 | -0,09 |

Os custos tiraram cerca de 26,83% (pontos percentuais) do retorno. O slippage não aparece na coluna de taxas: está embutido no preço de execução. Cada rodada escolhe seus próprios parâmetros, então a diferença mistura custo e escolha diferente.

**ETHUSDT 1 dia.**

| Cenário | Retorno fora da amostra | Operações | Taxas pagas (US$) | Sharpe |
| --- | --- | --- | --- | --- |
| Com custos (taxa 0,1% + slippage 0,05%) | -1,67% | 6 | 9,90 | -0,62 |
| Sem custos (taxa 0 e slippage 0) | -2,77% | 7 | 0,00 | -0,91 |

Aqui o resultado com custos ficou 1,11% (pontos percentuais) _melhor_ que sem custos. Isso não é efeito dos custos, que só pioram uma mesma carteira: é a escolha de parâmetros diferentes em cada rodada, com poucas operações. O slippage não aparece na coluna de taxas: está embutido no preço de execução. Cada rodada escolhe seus próprios parâmetros, então a diferença mistura custo e escolha diferente.

## Sensibilidade a parâmetros vizinhos

**BTCUSDT 1 hora.** Cada linha roda as mesmas janelas com os parâmetros de fábrica, trocando só um parâmetro por um valor vizinho da grade (sem escolher nada no ajuste).

| Configuração | Retorno fora da amostra | Diferença (pontos %) | Operações | Janelas paradas |
| --- | --- | --- | --- | --- |
| parâmetros de fábrica | -54,87% | 0,00% | 418 | 0 |
| fastPeriod=6 | -55,44% | -0,57% | 443 | 0 |
| fastPeriod=12 | -53,17% | 1,69% | 396 | 0 |
| slowPeriod=18 | -55,96% | -1,10% | 431 | 0 |
| slowPeriod=26 | -50,71% | 4,15% | 394 | 0 |
| buy=1.5 | -54,36% | 0,50% | 420 | 0 |
| buy=2.5 | -34,52% | 20,35% | 230 | 0 |
| stopAtrMultiple=1.5 | -66,61% | -11,74% | 479 | 0 |
| stopAtrMultiple=3 | -40,73% | 14,14% | 375 | 0 |
| targetAtrMultiple=4 | -55,23% | -0,37% | 361 | 0 |

Vizinhos com retorno positivo: **0 de 9** (a configuração de fábrica fez -54,87%). Em **3 de 9** vizinhos o retorno mudou 5 pontos percentuais ou mais em relação à configuração de fábrica. Quando um passo pequeno num parâmetro muda muito o resultado, o resultado depende da sorte do valor escolhido e não de uma regra robusta.

**ETHUSDT 1 dia.** Cada linha roda as mesmas janelas com os parâmetros de fábrica, trocando só um parâmetro por um valor vizinho da grade (sem escolher nada no ajuste).

| Configuração | Retorno fora da amostra | Diferença (pontos %) | Operações | Janelas paradas |
| --- | --- | --- | --- | --- |
| parâmetros de fábrica | -0,05% | 0,00% | 6 | 0 |
| fastPeriod=6 | -0,05% | 0,00% | 6 | 0 |
| fastPeriod=12 | -1,69% | -1,63% | 6 | 0 |
| slowPeriod=18 | -0,05% | -0,00% | 6 | 0 |
| slowPeriod=26 | -1,69% | -1,63% | 6 | 0 |
| buy=1.5 | -0,05% | 0,00% | 6 | 0 |
| buy=2.5 | -2,01% | -1,96% | 5 | 0 |
| stopAtrMultiple=1.5 | -1,13% | -1,07% | 9 | 0 |
| stopAtrMultiple=3 | 0,07% | 0,12% | 6 | 0 |
| targetAtrMultiple=4 | 0,33% | 0,39% | 5 | 0 |

Vizinhos com retorno positivo: **2 de 9** (a configuração de fábrica fez -0,05%). Em **0 de 9** vizinhos o retorno mudou 5 pontos percentuais ou mais em relação à configuração de fábrica. Quando um passo pequeno num parâmetro muda muito o resultado, o resultado depende da sorte do valor escolhido e não de uma regra robusta.

## Limitação: isto é o passado

Todos os números acima vêm de preços que já aconteceram. O walk-forward reduz o risco de enganar a si mesmo (porque testa sempre em meses que o ajuste não viu), mas não elimina: a grade de parâmetros e a própria estratégia foram escolhidas por pessoas que já conheciam, em parte, a história do mercado. Os últimos dois anos são um único cenário; um mercado diferente (outra tendência, outra volatilidade, outro regime de liquidez) pode dar resultado muito diferente. Dados reais da Binance, em preços de fechamento de candle, sem falhas de execução, sem fila de ordens e sem impacto no preço.

## O que isto NÃO prova

- **Não prova que a estratégia dará lucro no futuro**, nem que dará prejuízo: descreve o que teria acontecido no passado, com regras fixas.
- **Não é recomendação de investimento** nem de compra ou venda de nenhum ativo. O simulador usa dinheiro fictício e regras públicas editáveis pelo usuário.
- **Não prova que os parâmetros escolhidos são "os melhores"**: com poucas operações por janela, a escolha é muito influenciada pelo acaso.
- **Não cobre execução real**: ordens reais têm atraso, falham, enfrentam spread e liquidez diferentes dos modelados, e podem ter custos maiores (inclusive tributários).
- **Não cobre eventos raros** (quebra de corretora, congelamento de saques, mudança de regra) nem períodos fora dos últimos dois anos.
- **Poucas janelas e poucas operações** significam pouca confiança estatística: diferenças de alguns pontos percentuais entre duas configurações podem ser ruído.

## Rastreabilidade

| Série | Candles | Período dos dados | SHA-256 dos candles | Mín. de operações no ajuste | Tempo de execução |
| --- | --- | --- | --- | --- | --- |
| BTCUSDT 1 hora | 17520 | 2024-10-12 a 2026-10-12 | `7c4eb19c27c2b1c6b9e252f94fe89e0a5e6103e501672bed3a302483acb982eb` | 10 | 187 s |
| ETHUSDT 1 dia | 729 | 2024-10-13 a 2026-10-11 | `4698707c36bc1087db29a0d57b2984abc96b0b58e108e8877c2669c9e67f2a78` | 3 | 8 s |

- **Commit do código:** `9edadbffcfe89cceb36262768bb0312ebf443f5f`.
- A árvore de código estava limpa ao gerar.
- **Versões do motor:** engine-2 / signal-2 / metrics-1.
- **Dados até:** 2026-10-12T04:00:00.000Z. **Gerado em:** 2026-10-12T04:15:54.726Z.
- O hash cobre, na ordem, símbolo, timeframe, abertura, fechamento, abertura/máxima/mínima/fechamento e volume de cada candle usado. Recalcular o hash sobre os mesmos candles prova que o dado não mudou.
- Reprodução: `scripts/walk-forward-report.ts` (somente leitura na base de origem); o módulo executado é o mesmo walk-forward de produção da API, numa base descartável.
