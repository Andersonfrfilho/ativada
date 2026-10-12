# Spec 003 — Comparador de prazos

## 1. Problema

Quem usa o painel não sabe **em que prazo** uma estratégia faz sentido. Hoje cada meta responde só ao prazo que
a pessoa digitou, e o backtest responde só ao timeframe escolhido. Em 2026-10-12, 45 backtests em velas de
15 minutos (5 estratégias × 9 moedas) mostraram que operar de 10 a 60 minutos perde dinheiro em quase todos os
casos, porque cada ida e volta custa ~0,3% em taxa e slippage. Enquanto isso, prazos de 7 a 30 dias tiveram
resultado melhor. Essa conclusão precisou de uma pessoa juntando números de quatro telas.

## 2. Objetivo

Uma tela que, para uma moeda, responde em linguagem simples:

> "Operar de 15 em 15 minutos: **não compensa** (as taxas comem o ganho).
> Segurar a estratégia por 7 dias: em geral **+0,4%**, positivo em 52% das vezes.
> Por 15 dias: **+1,1%**, positivo em 58%.
> Por 1 mês: **+2,3%**, positivo em 61% — **o prazo mais recomendável no histórico**."

É histórico, não promessa. A tela diz isso.

## 3. Requisitos funcionais

- **RF01** — Tela `/prazos` no menu ("Prazos"), com seletor de moeda (pares habilitados) e de estratégia (as 5
  mais novas do usuário, igual à avaliação de metas). Padrão: a primeira moeda e "melhor estratégia por prazo".
- **RF02** — Linhas fixas, nesta ordem: **15 minutos** (operação rápida), **7 dias**, **15 dias**, **30 dias**.
  Os prazos são uma constante; 60 e 90 dias ficam fora para não poluir a tela (podem entrar depois).
- **RF03** — Linha de **15 minutos**: resultado líquido da estratégia em velas de 15 min nos últimos 90 dias,
  número de operações, total de taxas pagas e quanto as taxas representam do ganho bruto. Veredito
  `NAO_COMPENSA` quando o líquido é ≤ 0 **ou** as taxas passam de 50% do ganho bruto.
- **RF04** — Linhas de **N dias**: para cada janela de N dias do histórico diário (passo de 1 dia), a carteira
  nasce livre no início da janela e segue a estratégia até o fim **sem alvo nem perda máxima de meta**. De cada
  janela sai o retorno líquido. A linha mostra: retorno **mediano**, **% de janelas positivas**, **pior 10%**
  (percentil 10) e o mesmo trio para **comprar e segurar** nas mesmas janelas.
- **RF05** — **Recomendação**: no máximo uma linha recebe o selo "Recomendável", pela regra do §5. Se nenhuma
  passa, a tela diz "Nenhum prazo compensou no histórico desta moeda" e não destaca nada.
- **RF06** — Toda linha tem uma frase pronta em português simples (a frase do §2), gerada pelo servidor a partir
  dos números, nunca montada no componente.
- **RF07** — Aviso fixo: "Isto é o histórico. O passado não promete o futuro, e nada aqui é recomendação de
  investimento." (mesmo texto do `HistoryNote` existente).
- **RF08** — Na tela de meta, um link "Comparar prazos desta moeda" leva à `/prazos?symbol=<par>`.

## 4. Requisitos não funcionais

- **RNF01** — O cálculo roda fora da thread da API, no mesmo pool de `worker_threads` da avaliação de metas, sob
  o mesmo portão (uma avaliação a frio por usuário, teto global, orçamento por minuto). Cache em memória por
  `(versão da estratégia, par, último candle)`.
- **RNF02** — Mesmo motor do backtest e do ao vivo (`signalStep` + `walletStep`): nenhuma lógica de carteira nova.
  A constituição proíbe duplicar a lógica entre caminhos.
- **RNF03** — Sem lookahead: a janela só usa candles até o seu fim; o sinal vem da série contínua (como em
  `computeGoalSignals`).
- **RNF04** — Dinheiro e taxas em decimal (`EngineDecimal`), percentis calculados sobre texto decimal ordenado,
  arredondamento contra o usuário (retorno para baixo, perda para cima) a 8 casas.
- **RNF05** — Rota nova com `access` + `documentation` (OpenAPI), contrato negativo entre usuários (estratégia de
  outro usuário → 404) e esquema Zod espelhado no painel.

## 5. Regra de recomendação

Entre as linhas de N dias (a de 15 minutos nunca é recomendada; ela só pode ser "não compensa"):

1. Elegível se **mediana > 0**, **% positivas ≥ 55%** e **pior 10% ≥ −10%**.
2. Entre as elegíveis, vence a de maior **mediana por dia** (`mediana / N`), arredondada a 8 casas.
3. Empate: vence o prazo **mais longo** (menos operações, menos taxa).
4. Mínimo de 60 janelas na linha; abaixo disso a linha mostra "histórico curto" e não é elegível.

Os limiares (55%, −10%, 60 janelas) são constantes nomeadas no pacote do motor, para a regra ser testada e
ajustada num lugar só.

## 6. Fora do escopo

- Notícias positivas e negativas como sinal (vai para a spec 004, que precisa decidir fonte, classificação e
  hora de publicação sem lookahead).
- Prazos de 60 e 90 dias, e alvo/perda por linha.
- Simulação ao vivo a partir da tela (o "Simular esta meta" continua nas metas).

## 7. Critérios de aceite

1. BNBUSDT com a estratégia "4 Momentum rápido": a linha de 15 min mostra "não compensa" e as de 7/15/30 dias
   mostram mediana, % positivas e pior 10%, batendo com o cálculo de referência do teste.
2. Uma série sintética em que só 30 dias passa na regra do §5 destaca só 30 dias; uma em que nenhuma passa
   mostra a frase de "nenhum prazo".
3. Estratégia de outro usuário → 404; par desabilitado → 400.
4. O painel mostra a tabela no celular (375 px) sem rolagem horizontal; selo e frases legíveis nos dois temas.
