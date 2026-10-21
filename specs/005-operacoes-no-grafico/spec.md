# Spec 005 — Operações no gráfico

## 1. Problema

O usuário pergunta: **"quais foram os valores pagos e os valores de vendas, e em quais momentos, nas simulações?"**
Hoje o painel não responde isso numa olhada:

- O detalhe do backtest (`apps/frontend-ativada/src/backtests/` e `src/runs/`) mostra a curva de patrimônio e a tabela
  "Operações" com abertura, preço de entrada, preço de saída, resultado e motivo. Faltam a **hora da venda**, a
  **quantidade** e o **valor em USDT** pago e recebido. A tabela usa UTC, não o fuso do usuário.
- O CSV completo (`GET /v1/runs/:id/log.csv`) tem tudo, mas é planilha, não resposta.
- A simulação ao vivo (`live_paper`) mostra saldo e últimos sinais na "Visão geral"; não há onde ver as compras e
  vendas sobre o preço da moeda.
- Métricas como Sharpe, Sortino e fator de lucro aparecem sem explicação para quem não é do mercado.

Os dados já existem: `fills` (hora do candle, lado, preço, quantidade, valor, taxa) e `positions` (compra e venda
agrupadas, com taxas, resultado e motivo).

## 2. Objetivo

No detalhe de qualquer execução (backtest ou simulação ao vivo), a pessoa vê:

> **Gráfico do preço da moeda** no período, com uma seta verde para cima em cada compra e uma seta vermelha para baixo
> em cada venda. Passando o mouse, tocando ou focando pelo teclado numa seta: "Compra em 03/05/2026 14:15 — 0,0123 BTC a
> 61.250,00 USDT — pagou 753,38 USDT (taxa 0,75)".
>
> **Resumo no topo:** "Você pagou 98.410,22 USDT em compras e recebeu 97.902,10 USDT em vendas. Taxas: 196,31 USDT.
> Saldo líquido das operações: **−508,12 USDT**."
>
> **Tabela** com uma linha por operação fechada, ligada ao gráfico: clicar numa linha destaca as duas setas; clicar numa
> seta destaca a linha.

É histórico (ou simulação), nunca dinheiro real nem promessa. A tela diz isso.

## 3. Requisitos funcionais

### Gráfico de preço

- **RF01** — Cartão "Preço e operações" no detalhe da execução (backtest, walk-forward — só a parte fora da amostra,
  D11 — e simulação ao vivo). Mostra o preço de fechamento da moeda no período da execução como linha, com
  uma faixa clara de mínima e máxima por coluna.
- **RF02** — Cada **compra** é uma seta para cima, verde (`--buy`), abaixo do preço; cada **venda** é uma seta para
  baixo, vermelha, acima do preço. Compra e venda diferem por **forma e posição**, não só por cor.
- **RF03** — Cada seta é focável (Tab / setas do teclado percorrem em ordem de tempo) e mostra ao focar, passar o
  mouse ou tocar: lado, data e hora (fuso do usuário), preço, quantidade, valor pago (compra) ou recebido (venda),
  taxa e, na venda, o resultado da operação em USDT e em %. `Esc` fecha.
- **RF04** — **Zoom por faixa de datas**: atalhos "Tudo", "30 dias", "7 dias", "1 dia" (só os que cabem no período),
  dois campos de data (de/até) e botões "◀ anterior" / "próximo ▶" que deslocam a faixa pelo próprio tamanho. A faixa
  fica na URL (`?de=&ate=`), em UTC ISO, para o link ser compartilhável e o "voltar" do navegador funcionar.
- **RF05** — Quando a faixa visível tem mais operações do que o limite de marcadores (§5 D3), as setas viram
  **agrupamentos** por coluna ("12 compras, 11 vendas") com o texto "Aproxime para ver cada operação". Focar um
  agrupamento e apertar Enter aproxima naquela coluna.
- **RF06** — **Descrição textual** do gráfico para leitor de tela, gerada a partir dos dados visíveis: moeda, faixa,
  preço inicial, final, mínimo e máximo, número de compras e vendas. A tabela de operações é a alternativa acessível
  completa.

### Tabela de operações

- **RF07** — Uma linha por operação: hora da compra, hora da venda, quantidade, valor pago (valor da compra + taxa da
  compra), valor recebido (valor da venda − taxa da venda), taxas (compra + venda), resultado em USDT e em %, e motivo
  da venda em português simples (§7 do plan). Operação ainda aberta aparece no topo como "aberta", sem venda nem
  resultado.
- **RF08** — Datas no fuso do usuário (`users.timezone`, padrão `America/Sao_Paulo`) com o deslocamento visível no
  cabeçalho ("horário de Brasília, GMT−3" ou o nome do fuso). Nunca UTC sem aviso.
- **RF09** — A tabela segue a faixa do gráfico: mostra as operações cuja compra **ou** venda cai na faixa. Fora do zoom
  ("Tudo"), mostra todas, carregando por cursor.
- **RF10** — **Seleção ligada**: clicar (ou Enter) numa linha seleciona a operação, centraliza a faixa do gráfico nela se
  estiver fora e destaca as duas setas; selecionar uma seta destaca e rola a tabela até a linha. A operação
  selecionada fica na URL (`?operacao=<positionKey>`).

### Resumo

- **RF11** — Resumo no topo do cartão, para a execução **inteira** (não muda com o zoom): número de operações fechadas,
  **total pago**, **total recebido**, **taxas**, **saldo líquido** (recebido − pago) e, se houver posição aberta, o valor
  pago nela à parte ("ainda aberta: 412,00 USDT pagos"). Frase pronta em português simples, montada no servidor.
- **RF12** — O saldo líquido do resumo bate, em decimal exato, com a soma de `net_profit` das posições fechadas
  (reconciliação testada).

### Glossário

- **RF13** — Termos técnicos nas telas de backtest ganham uma dica de uma linha (botão "?" ao lado do rótulo, abre por
  foco, toque ou clique; `aria-describedby` no rótulo):
  - **Sharpe** — "Quanto a estratégia ganhou para cada unidade de sobe-e-desce. Acima de 1 é bom."
  - **Sortino** — "Igual ao Sharpe, mas só conta as quedas como risco."
  - **Fator de lucro** — "Tudo o que se ganhou dividido por tudo o que se perdeu. Acima de 1, ganhou mais do que perdeu."
  - **Maior queda** — "A maior perda, do ponto mais alto ao mais baixo, antes de se recuperar."
  - **Taxa de acerto** — "De cada 100 operações, quantas terminaram no lucro."
  - **Slippage** — "A diferença entre o preço esperado e o preço em que a ordem de fato saiu."
  Os textos vivem num só arquivo; a mesma palavra tem a mesma frase em toda tela.

### Simulação ao vivo

- **RF14** — A mesma visão (gráfico, resumo, tabela) existe no detalhe da simulação ao vivo e se atualiza pelo
  WebSocket existente (`/v1/stream`): o aviso de execução invalida as consultas sob a chave `runs`, e o REST continua a
  fonte da verdade. A "Visão geral" ganha o link "Ver compras e vendas no gráfico" no cartão da simulação.
- **RF15** — No ao vivo, o gráfico mostra só **velas fechadas**; a ponta direita diz "última vela fechada às HH:MM".
  Com a faixa no fim ("acompanhando"), cada vela nova estende a faixa; com a faixa em outro ponto, ela não se move e
  aparece "Há operações novas — ir para o fim".

### Aviso

- **RF16** — Aviso fixo no cartão, com o texto do `HistoryNote`: "Isto é o histórico. O passado não promete o futuro, e
  nada aqui é recomendação de investimento." No ao vivo, acrescenta: "Simulação: nenhum dinheiro real foi usado."

## 4. Requisitos não funcionais

- **RNF01 — Escala.** Um backtest de 15 min em 6 meses (~17.500 velas, ~1.000 operações) abre o cartão com
  `GET /chart` respondendo em ≤ 300 ms (p95, Postgres local de teste) e payload ≤ 150 KB. A resposta nunca passa de
  2.000 colunas de preço nem de 500 marcadores individuais, qualquer que seja o tamanho da execução.
- **RNF02 — DOM limitado.** A tabela mantém no máximo ~60 linhas no DOM, com qualquer número de operações (janela
  virtual com `aria-rowcount`/`aria-rowindex`). O SVG tem no máximo 2.000 pontos de linha e 500 setas.
- **RNF03 — Dinheiro.** Todo valor monetário sai da API como texto decimal; o painel valida com `decimalText` e soma ou
  compara com `BigInt` de escala 8 (`src/format/decimal.ts`). `Number` só para **coordenada de pixel** do desenho,
  nunca para texto exibido nem para conta de dinheiro.
- **RNF04 — Fuso.** Horários são guardados e trafegam em UTC (milissegundos ou ISO); a conversão é só na exibição, com
  `Intl.DateTimeFormat` e o fuso IANA do usuário. Horário de verão é do `Intl`, não de conta própria. Teste com
  `America/Sao_Paulo` e `America/New_York` (troca de horário dentro do período).
- **RNF05 — Segurança e contrato.** Toda rota nova ou alterada declara `access` e `documentation` (OpenAPI), é só do
  dono (recurso alheio, inexistente ou id malformado → mesmo `404`), valida a query com Zod devolvendo todos os erros
  sem eco, e tem esquema Zod espelhado no painel. Mudança no `/trades` é **aditiva** (nenhum campo some nem muda de
  tipo).
- **RNF06 — Acessibilidade.** 375 px sem rolagem horizontal da página (a tabela rola dentro do próprio cartão);
  contraste ≥ 4,5:1 para texto e ≥ 3:1 para setas e linha nos dois temas; foco visível em seta, agrupamento e linha;
  nunca só cor; área de toque ≥ 44 px nos controles de zoom.
- **RNF07 — Código.** Função ≤ 40 linhas, arquivo ≤ 200, sem estilo inline (CSS Modules e tokens de
  `global.css`), sem biblioteca de gráfico nova, escalas como funções puras testáveis (como `plan-chart.ts`).
- **RNF08 — Nada muda no motor.** Esta spec só lê `candles`, `fills` e `positions`. `packages/strategy-engine` e
  `packages/run-recording` não mudam.

## 5. Decisões já tomadas

| # | Decisão | Por quê |
|---|---|---|
| D1 | **Reusar e ampliar** `GET /v1/runs/:runId/trades` (campos novos, filtro `from`/`to`), em vez de rota nova de operações | Já é paginado por cursor, já é do dono e já alimenta a tabela; mudança aditiva não quebra o painel |
| D2 | **Rota nova** `GET /v1/runs/:runId/chart?from=&to=&columns=` com o preço já reduzido e os marcadores da faixa | 17.500 velas não vão para o navegador; a redução é feita no SQL |
| D3 | Redução **mínimo-máximo por coluna**: `columns` (padrão 800, entre 100 e 2.000; o painel manda a largura do SVG em pixels) baldes de tempo iguais; cada balde traz início, fim, primeiro, último, mínima e máxima. Marcadores individuais até **500** na faixa; acima disso, agrupados por balde | Mínimo-máximo preserva os picos (média esconderia o preço da compra); 500 setas é o que ainda se distingue numa tela |
| D4 | **Rota nova** `GET /v1/runs/:runId/trade-summary` para o resumo da execução inteira | O resumo não depende do zoom; uma soma em SQL é barata e fica fora do cache do gráfico |
| D5 | Valor pago = `notional` do preenchimento de compra + taxa da compra; recebido = `notional` da venda − taxa da venda; resultado % = resultado ÷ pago, **arredondado para baixo** a 8 casas no servidor | Mesma regra "contra o usuário" do resto do produto; o painel só exibe |
| D6 | Seta no **candle do preenchimento** (abertura de `t+1`), não no do sinal | É o momento em que se pagou; casa com o `log.csv` e com a regra sem lookahead |
| D7 | Gráfico em **SVG à mão** com escala pura (`price-chart.ts`), sem biblioteca | O painel já faz assim no plano; evita dependência e mantém o lint de tamanho |
| D8 | Tabela com **janela virtual própria** (linhas de altura fixa, função pura `computeVisibleRows`), sem biblioteca | 1.000 linhas no DOM pesam no celular; a regra é pequena e testável |
| D9 | Dica do glossário como componente próprio (`Term`), seguindo os controles atuais do painel | O painel não usa shadcn; a regra "a tela existente manda" (web.md §14) prevalece |
| D10 | Fuso vem de `GET /v1/me` (`account.validation.ts` já tem `timezone`); enquanto carrega, mostra UTC com o rótulo "UTC" | Nunca mostrar hora sem dizer o fuso |
| D11 | Walk-forward: o cartão mostra só a parte fora da amostra (as operações que estão em `positions` da execução) | É o que o relatório principal já usa |

## 6. Fora do escopo

- Ordens reais e o modo `live` (spec 002).
- Gráfico de candlestick completo, indicadores sobre o preço (médias, RSI), volume.
- Editar, apagar ou anotar operações.
- Motivo da **compra** (o sinal que levou a ela); a tabela mostra o motivo da venda. Fica para depois.
- Conversão para R$ no gráfico e na tabela (o painel não tem fonte de câmbio; o resumo é em USDT).
- Comparar operações de duas execuções no mesmo gráfico.

## 7. Critérios de aceite

1. Backtest real de BTCUSDT 15 min em 6 meses: o cartão abre com o gráfico, o resumo e a tabela; `GET /chart` ≤ 300 ms
   p95 e ≤ 150 KB; a tabela nunca passa de ~60 linhas no DOM (contrato conta os `<tr>`).
2. O resumo bate em decimal exato com a soma das posições fechadas e com o `log.csv` da mesma execução.
3. Para uma operação conhecida do conjunto de teste, a dica da seta de compra mostra a hora no fuso do usuário, o preço,
   a quantidade, o valor pago e a taxa iguais aos de `fills`; a de venda mostra também o resultado em USDT e %.
4. Clicar na linha destaca as duas setas e põe `?operacao=` na URL; focar a seta e apertar Enter destaca a linha.
5. Com 1.000 operações em "Tudo", aparecem agrupamentos e o texto "Aproxime…"; em "1 dia" aparecem setas individuais.
6. Usuário em `America/New_York` vê a hora local certa dos dois lados da troca de horário de verão; em
   `America/Sao_Paulo`, GMT−3.
7. Execução de outro usuário → `404` em `/chart`, `/trade-summary` e `/trades`; `columns` fora da faixa ou `from > to` →
   `400` com todos os erros, sem eco.
8. Simulação ao vivo: um candle novo com preenchimento, entregue pelo WebSocket, aparece no gráfico e na tabela sem
   recarregar; a vela em andamento nunca aparece.
9. Cada termo do glossário tem a dica com o texto do RF13, alcançável por teclado e lida pelo leitor de tela.
10. 375 px sem rolagem horizontal da página, nos dois temas; uma captura final em `evidence.md` (web.md §15).

## 8. Riscos

| Risco | Efeito | Mitigação |
|---|---|---|
| Desempenho da redução no SQL em execuções longas (1h em 5 anos ≈ 44.000 velas) | Gráfico lento | Agrupar no Postgres com índice `(symbol, timeframe, open_time)`; teste de carga com 44.000 velas; teto de colunas |
| Muitos marcadores sobrepostos | Setas ilegíveis, foco por teclado interminável | Limite de 500 e agrupamento (D3); teclado percorre agrupamentos |
| Fuso e horário de verão | Hora errada em uma hora numa noite por ano | Só `Intl` com fuso IANA; sempre mostrar o deslocamento; teste com Nova York |
| Vela em andamento no ao vivo | Preço que ainda vai mudar desenhado como fato | Só velas fechadas (RF15); a API não tem a vela aberta |
| Refetch a cada aviso do WebSocket com o usuário em zoom | Gráfico "pulando" | Faixa fixa quando não está no fim; aviso "ir para o fim" |
| Seleção de uma operação ainda não carregada na tabela virtual | Linha não encontrada | Buscar a página por `from`/`to` em torno da operação (centralizar a faixa nela, RF10) |
| Cálculo de % com float no painel | Texto com erro de arredondamento | % vem pronto do servidor (D5) |
