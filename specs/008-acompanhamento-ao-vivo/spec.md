# Spec 008 — Acompanhamento da simulação ao vivo

## 1. Problema

Em 2026-10-14 o usuário abriu o detalhe de uma simulação ao vivo **sem nenhuma operação** ("Simulação ao vivo: LINK/USDT ·
1h, desde 13/10 · Rodando; 2 Rompimento Donchian; olha o mercado a cada 1 hora; última decisão às 10:00, próxima às 11:00")
e viu só zeros: "Total pago 0,00 … Compras 0 Vendas 0" e um gráfico de preço sem setas. Nas palavras dele: **"não entendi
para o que olhar; não tem números, não tem datas, não tem valores"**.

Os dados existem, mas a tela não os mostra:

- A cada vela fechada a simulação grava um **sinal** (`signals`: decisão `BUY`/`SELL`/`HOLD`, pontuação do placar, regime,
  `votes` com o voto de cada regra, `indicators` com o valor de cada indicador naquela vela, e `reason`, a frase técnica do
  motor) e um **ponto de patrimônio** (`equity_points`: saldo, vale e `benchmark`, que é o "comprar e segurar").
- O detalhe (`BacktestDetailPage` → `RunHeader`, `RunProgressCard` com `LiveRunStatus`, `TradeChartCard`) mostra o
  andamento e as compras e vendas; quando não há compra, sobra o vazio.
- "Últimos sinais" (`SignalsCard`, só na Visão geral) **esconde as decisões de esperar** (`HOLD`), que são justamente as
  que existem quando nada acontece.
- O progresso da meta (alvo, prazo, perda máxima) só aparece no `ActiveGoalCard`, calculado no navegador com `Number`
  (`goal-progress.ts`), e não aparece no detalhe.
- "O que falta para a regra votar" (`computeNextTriggers`) só existe na avaliação da meta e no resumo de ativos, nunca
  para a simulação que está rodando.

## 2. Objetivo

No topo do detalhe da simulação ao vivo, um cartão **"Acompanhamento"** responde, em linguagem simples:

> **Seu saldo agora:** 1.000,00 USDT (começou com 1.000,00 USDT) · **resultado:** 0,00 USDT (0,00%) desde 13/10 às 15:00.
> **Se tivesse comprado e segurado** LINK no mesmo período: 1.023,40 USDT (+2,34%).
>
> **Meta:** +3% em 7 dias → chegar a 1.030,00 USDT até 20/10 às 15:00. Faltam 30,00 USDT (3,00%) e 5 dias e 19 horas.
> Perda máxima aceita: −5% (950,00 USDT); ainda cabem 50,00 USDT de queda.
>
> **O que a estratégia decidiu** (uma linha por vela):
> | Vela (fechou às) | Preço | Decisão | Pontuação | Por quê |
> |---|---|---|---|---|
> | 10:00 | 11,42 | Esperou | 1 de 2 | Faltou 1 ponto: o MACD ainda está negativo. |
>
> **O que falta para comprar agora:** "Rompimento Donchian: o preço precisa fechar acima de 11,80 (hoje 11,42, faltam
> 3,3%)." Pode nunca acontecer: é uma condição, não uma previsão.

No gráfico de preço, além das setas de compra e venda, um **pontinho discreto** em cada vela em que a estratégia esperou,
e as linhas de **alvo e stop** da posição aberta (e do nível de compra do plano, quando dá para mostrar com honestidade).

Continua sendo simulação: dinheiro fictício, nenhuma ordem real, nada de recomendação.

## 3. Requisitos funcionais

### Cartão "Acompanhamento"

- **RF01** — Cartão "Acompanhamento" no **topo** do detalhe de toda `live_paper` (rodando, na fila, parada ou concluída),
  antes de "Andamento" e de "Preço e operações". Backtest e walk-forward não mudam.
- **RF02 — Saldo e resultado.** Saldo atual (último ponto de `equity_points`), saldo inicial, resultado em USDT e em %
  desde o início, com a data e hora do início no fuso do usuário. Sem nenhum ponto ainda: "Ainda sem vela fechada; o saldo
  é o inicial: 1.000,00 USDT".
- **RF03 — Comparação com "comprar e segurar".** Valor e % do `benchmark` no mesmo ponto, e uma frase: "A estratégia está
  2,34 pontos percentuais **abaixo** de comprar e segurar no mesmo período." (ou "acima", ou "empatada"). Rótulo com `Term`
  ("comprar e segurar").
- **RF04 — Meta** (só quando a simulação tem `goalId`): alvo em % e em USDT, prazo (data e hora do fim no fuso do usuário),
  quanto falta em USDT e em %, tempo restante ("5 dias e 19 horas"; "termina hoje às 15:00"; "prazo encerrado"), perda máxima
  aceita em % e em USDT e quanto ainda cabe de queda. Desfecho gravado (`goalOutcome`) troca o bloco pelo texto do desfecho
  ("Meta alcançada em 16/10 às 09:00"). Sem meta: o bloco não aparece.
- **RF05 — "O que a estratégia decidiu".** Tabela das decisões, **mais recente primeiro**, uma linha por vela, incluindo as
  de esperar. Colunas: vela (hora em que **fechou**, no fuso do usuário, com "hoje"/"ontem"/data), preço de fechamento,
  decisão em português ("Esperou", "Comprou", "Vendeu", e "Sem dado suficiente" quando o motor ainda aquecia), pontuação contra
  o limiar ("1 de 2"; na venda "−1 de −2"), e o motivo em **uma frase**. Ao abrir a linha (botão, teclado), cada regra com
  nome simples, voto (`+`, `−`, `0` e o texto "a favor", "contra", "neutra"; nunca só cor) e o valor do indicador naquela vela.
  Primeira página de 24 decisões; "Ver decisões anteriores" carrega mais 24 (cursor). O motivo técnico do motor (`reason`)
  fica disponível em "Detalhe técnico", recolhido.
- **RF06 — Frase do motivo.** Gerada no servidor a partir dos votos, das leituras e dos limiares da versão da estratégia
  (nunca recalculando o motor): "Faltou 1 ponto: o MACD ainda está negativo."; "Comprou: 2 de 2 regras a favor (Rompimento
  Donchian e MACD)."; "Esperou: já está comprada; nenhuma regra pediu venda."; "Sem dado suficiente: a regra X ainda está
  aquecendo." A pontuação é a do placar gravado, não uma conta nova.
- **RF07 — "O que falta para comprar agora"** (ou "para vender agora", se a carteira está comprada): para cada regra, nome
  simples, valor atual, valor necessário, distância (em valor e em %) e se a conta é **exata** ou **aproximada**
  (`basis`), a partir de `computeNextTriggers` sobre a última vela fechada; a pontuação que falta no placar ("faltam 1 ponto
  de 2"). Texto fixo: "Isto não é previsão: o preço pode nunca chegar lá, e outras regras podem mudar de voto antes."
  Simulação parada, concluída ou sem vela fechada: o bloco diz por que não há gatilho.
- **RF08 — Gráfico.** No `TradeChartCard` da `live_paper`: (a) um pontinho discreto, menor e mais claro que as setas, em
  cada vela em que a decisão foi esperar, com dica ("Esperou às 10:00 — pontuação 1 de 2") e no resumo textual do gráfico;
  só aparece quando a faixa visível tem até 500 velas, senão: "Aproxime o gráfico para ver cada decisão"; (b) com posição
  aberta, linhas tracejadas de **alvo** e **stop** (`positions.target_price`/`stop_price`), com rótulo de texto; (c) linha do
  **nível de compra** do plano só quando a simulação tem meta e o plano é da **mesma versão** da estratégia da simulação;
  senão a linha não aparece e a legenda diz "nível de compra indisponível para esta simulação". As linhas são ligáveis por
  uma caixa "Mostrar níveis", desligada por padrão.
- **RF09 — Estado vazio explicativo.** Sem nenhuma compra: no lugar dos zeros do resumo, "Nenhuma compra ainda: a estratégia
  está esperando. Veja abaixo o que ela analisou em cada vela." com link para a tabela do RF05. Sem nenhuma vela fechada:
  o texto da spec 006 ("Aguardando a primeira vela, que fecha às HH:MM").
- **RF10 — Avisos fixos** no cartão, curtos: o que é uma **vela** ("o resumo do preço em 1 hora: abertura, máxima, mínima e
  fechamento"); "a simulação olha o mercado a cada 1 hora e decide só quando a vela fecha"; "simulação com dinheiro
  fictício; nada aqui é recomendação de compra ou venda". Termos novos no glossário (`Term`): vela, pontuação do placar,
  limiar, comprar e segurar, stop, alvo.
- **RF11 — Visão geral.** O `BalanceCard` ganha uma linha de resumo da simulação ao vivo: "Última decisão: esperou às 10:00
  (faltou 1 ponto)" e o link "Ver o acompanhamento". O `ActiveGoalCard` passa a usar os números de meta do servidor (RF04)
  e o cálculo local em `Number` (`goal-progress.ts`) sai do código.
- **RF12 — Tempo real.** Cada vela nova atualiza o cartão sozinha pelo WebSocket `runs` que já existe (o aviso já invalida a
  raiz `runs`); sem polling novo.

### API

- **RF13** — `GET /v1/runs/:runId/live-status` (só `live_paper`; outro tipo → `409 RUN_NOT_LIVE`): saldo, resultado,
  comprar e segurar, meta, primeira página de decisões (24) com `nextCursor`, gatilhos atuais, posição aberta com alvo e
  stop. Todo valor em texto decimal; frases prontas em português geradas no servidor; tempos em ms UTC.
- **RF14** — `GET /v1/runs/:runId/decisions?cursor=&limit=` (padrão 24, máximo 100, mais recente primeiro): mesmas linhas
  do RF05 para as páginas seguintes.
- **RF15** — `GET /v1/runs/:runId/chart` ganha o campo opcional `decisions` (`[{ candleTime, action, score }]` da faixa,
  ou `null` acima de 500 velas). Campos antigos intactos.
- **RF16** — As três rotas: `access` e `documentation` declarados, Zod na entrada e na saída, recurso alheio, inexistente
  ou id malformado = o mesmo `404`, sem eco de valores no `400`.

## 4. Requisitos não funcionais

- **RNF01 — Sem recalcular o motor por pedido.** Decisões, votos e leituras vêm de `signals`; saldo e comprar e segurar de
  `equity_points`; alvo e stop de `positions`. Os gatilhos usam `computeNextTriggers` (puro) sobre as leituras **gravadas**
  das duas últimas velas, sem reler a série de velas. Leituras pelos índices que já existem (`signals_run_id_candle_time_unique`,
  PK de `equity_points`); `live-status` faz no máximo 6 consultas, cada uma por chave e com `LIMIT`.
- **RNF02 — Sem migration.** Nenhuma tabela ou índice novo (se a T0.1 provar que falta índice, ele é aditivo, com
  `.rollback.sql`, e a execução para e pergunta).
- **RNF03 — Motor intocado.** `packages/strategy-engine` e `packages/run-recording` não mudam; o que a API precisa
  (`ruleLabel`, `computeNextTriggers`, `ScoreboardReadings`, `STRATEGY_CONFIG_SCHEMA`) já é exportado.
- **RNF04 — Dinheiro e %.** Texto decimal na API (`decimal.js`) e `BigInt` de escala 8 no painel (`src/format/decimal.ts`).
  Arredondamento **contra o usuário**: ganho e saldo para baixo, perda e "quanto falta" para cima, "quanto ainda cabe de
  queda" para baixo; % com 2 casas na mesma direção.
- **RNF05 — Fuso.** Toda hora no fuso do usuário (`useUserTimeZone`, `formatInZone`) com o deslocamento ("GMT−3") no
  cabeçalho da tabela. A hora mostrada da decisão é o **fechamento** da vela (`candle_time` + duração), não a abertura.
- **RNF06 — Painel.** 375 px sem rolagem horizontal (a tabela vira lista empilhada), contraste ≥ 4,5:1 em texto e ≥ 3:1 nos
  pontinhos e linhas, nos dois temas; foco visível; nunca só cor; ≤ 40 linhas por função e ≤ 200 por arquivo; Zod espelhado.
- **RNF07 — Testes no padrão do repo.** Contrato negativo entre usuários (404) nas três rotas, OpenAPI (`api-openapi`),
  mutantes do filtro de dono (API e Postgres), frases conferidas à mão, paridade dos gatilhos contra o cálculo completo.
- **RNF08 — Sem PII em log.** Nenhum valor de saldo, preço ou meta em log; só ids opacos e códigos.

## 5. Decisões tomadas por padrão (o usuário pode mudar)

| # | Decisão | Por quê | Alternativa |
|---|---|---|---|
| D1 | **Rota agregada nova** `GET /v1/runs/:runId/live-status` + `GET /v1/runs/:runId/decisions` para as páginas seguintes | Uma ida ao servidor por vela; as frases e o arredondamento num lugar só (servidor) | Reusar `/signals` + `/equity` + `/runs/:id` e montar as frases no painel |
| D2 | **24 decisões** por página (um dia em velas de 1 h), máximo 100 | Cabe na tela e cobre "o que aconteceu hoje" | 50 por página |
| D3 | Gatilhos (RF07) pelas **leituras gravadas** das duas últimas velas (`indicators` da última e da anterior, que o Donchian lê como `previous`), provado por paridade na T0.1 | Barato e sem mexer no motor | Recalcular com `computeLatestTriggers` sobre a série no pool de threads, com cache por vela |
| D4 | Frases do motivo **geradas na API** (`decision-messages.ts`), o `reason` do motor fica em "Detalhe técnico" | O `reason` é técnico ("pontuação +1 · lateral · compra: …") | Mostrar só o `reason` |
| D5 | Pontinhos de "esperou" só com **até 500 velas** visíveis (mesmo teto dos marcadores da spec 005) | Acima disso viram borrão e pesam no `/chart` | Agrupar por balde |
| D6 | Linhas de alvo/stop da posição aberta e nível de compra do plano **desligadas por padrão** ("Mostrar níveis") | Leigo pode ler linha como promessa | Ligadas por padrão |
| D7 | Nível de compra do plano **só** com meta e mesma versão da estratégia | O plano usa a versão mais nova; mostrar outra versão seria mentir | Mostrar sempre com aviso |
| D8 | `ActiveGoalCard` passa a usar a meta calculada no servidor e `goal-progress.ts` sai | Um cálculo só, em decimal | Manter os dois |
| D9 | Rota só para `live_paper`; outro tipo responde `409 RUN_NOT_LIVE` | Backtest já tem o resumo da spec 005 | Abrir para backtest também |
| D10 | Política de taxa: `RUN_LIVE_STATUS` 60/min por usuário (`live-status` e `decisions`); `/chart` mantém `RUN_CHART` | Três avisos por vela invalidam a raiz `runs`; 60/min sobra | Só o padrão de 120/min |
| D11 | Hora da decisão = **fechamento** da vela | É quando a estratégia decide; bate com "última decisão às 10:00" da spec 006 | Hora de abertura |
| D12 | "Comprar e segurar" é o `benchmark` já gravado (compra tudo na abertura depois do primeiro sinal) | Mesmo número do `BalanceCard` e das métricas | Recalcular desde o início da simulação |

## 6. Fora do escopo

- Recalcular decisões passadas, simular "e se" ou mudar a estratégia pela tela.
- Notificação nova no Telegram (os alertas de compra/venda e de meta continuam como estão).
- Backtest e walk-forward (já têm "Preço e operações").
- Conversão para R$ (continua digitada pelo usuário, só em "Seus ativos").
- Qualquer ordem real (spec 002).

## 7. Critérios de aceite

1. Simulação ao vivo sem compra: o cartão mostra saldo, resultado 0,00 USDT (0,00%), comprar e segurar com valor e %, meta
   com quanto falta e dias restantes, a tabela com uma linha por vela (com "Esperou" e a frase do motivo) e o bloco "O que
   falta para comprar" com valor atual, necessário e distância. Nenhum zero sem explicação.
2. Uma vela nova (aviso do stream) acrescenta a linha no topo da tabela e atualiza saldo e gatilhos sem recarregar a página.
3. `live-status`, `decisions` e `/chart` de outro usuário → `404`; backtest em `live-status` → `409 RUN_NOT_LIVE`.
4. Os gatilhos das leituras gravadas são iguais aos de `computeLatestTriggers` sobre a série em todas as velas dos dois
   conjuntos reais (paridade).
5. Mutantes do filtro de dono (API e Postgres) e das regras de arredondamento e frase: todos mortos.
6. 375 px sem rolagem horizontal nos dois temas, foco visível, contraste conferido; uma captura final em `evidence.md`.

## 8. Riscos

| Risco | Efeito | Mitigação |
|---|---|---|
| Leitura multi-saída achatada em `indicators` (`rule:macd-12-26-9.signal`) não volta ao formato que o placar lê | Gatilho errado | T0.1 fecha o mapeamento e prova por paridade nos conjuntos reais; se falhar, D3 cai para a alternativa (pool + cache) e a execução para e pergunta |
| Frase do motivo simplifica demais e engana | Leigo entende errado | Catálogo fechado de frases por tipo de regra, conferido à mão; "Detalhe técnico" com o `reason` |
| Muitas linhas de "esperou" em 15m | Tabela longa | Paginação por cursor de 24 e lista virtual não é necessária (≤ 100 por página) |
| Plano de outra versão da estratégia | Linha de compra falsa | D7: só mesma versão; teste de contrato do caso diferente |
| `ActiveGoalCard` muda de número ao trocar o cálculo | Usuário estranha | Arredondamento contra o usuário documentado; diferença ≤ 0,01 conferida no contrato |
