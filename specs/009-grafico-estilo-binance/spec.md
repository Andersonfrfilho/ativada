# Spec 009 — Gráfico estilo Binance, com tendência e acerto medido

## 1. Problema

Em 2026-10-14 o usuário viu o cartão "Preço e operações" (spec 005) da simulação LINK/USDT 1h e disse, literalmente:

> "esse gráfico ficou muito simples, precisa chegar mais próximo da Binance, e os pontos de eventos nele, e os pontos de
> previsão também, de ações tipo: daqui 15 minutos estou tendendo a vender ou comprar, entendeu? e com linhas que achamos
> que vai e linhas reais chegando"

Hoje o gráfico (`PriceChart`, SVG à mão, `price-chart.ts`) desenha **uma linha de fechamento com faixa mín–máx por coluna**,
setas de compra e venda e, com a spec 008, pontinhos de "esperou" e linhas de alvo/stop. Falta o que qualquer pessoa que
já abriu a Binance espera:

- **Velas** (abertura, máxima, mínima, fechamento) com zoom pela roda/pinça, arrasto para os lados, cruz que segue o
  mouse e a **legenda OHLC** no topo ("A 12,930 M 12,985 m 12,872 F 12,905 −0,20% Vol 23,9 mil").
- **Volume** em barras embaixo do preço.
- **Escolha da vela** (15m, 1h, 4h, 1d).
- **As linhas que a estratégia usa** sobre o preço (canal de Donchian, médias do cruzamento de EMA, Bollinger).
- **Vela em formação** e o **preço ao vivo** na ponta direita.
- E o que a Binance **não** tem e o usuário pediu: **para que lado a estratégia está tendendo** antes de a vela fechar,
  com uma faixa à frente, a linha do preço real chegando por cima dela e, depois, **se acertou**.

Os dados já existem e quase nada precisa ser calculado de novo:

- `candles` (OHLCV fechado, 15m/1h/4h/1d por par habilitado) e `GET /v1/markets/candles` (até 5.000 por pedido).
- `signals` grava, por vela decidida, `score`, `action`, `votes` e `indicators` com o valor de cada indicador naquela vela
  (`rule:<id>.fast/.slow` do cruzamento de EMA, `rule:<id>.lower/.middle/.upper` do Bollinger, `rule:<id>.lower/.upper` do
  Donchian, `risk:atr`, `regime:adx.*`). É **exatamente o que o motor viu**.
- `fills`/`positions` (setas, alvo e stop), `equity_points`, o ticker ao vivo (`miniTicker`, só preço) e o aviso `runs` do
  WebSocket.
- A spec 008 já tem o contrato das leituras gravadas → `computeNextTriggers` (paridade provada em 3.054 velas) e as frases
  "o que falta para comprar".

## 2. Objetivo

No detalhe de qualquer execução (simulação ao vivo, backtest e a parte fora da amostra do walk-forward), o cartão do gráfico
vira um gráfico de velas no padrão de corretora, com três camadas da estratégia e um painel de previsão honesto:

> **Gráfico:** velas de 1 h do LINK/USDT, volume embaixo e, abaixo do volume, o **placar da estratégia** vela a vela
> (barras de −2 a +2, com as linhas de compra em +2 e venda em −2). O canal de Donchian tracejado sobre o preço. Setas
> "Compra"/"Venda" nos preenchimentos; com "Stop e alvo" ligado, as caixas verde (até o alvo) e vermelha (até o stop) de
> cada operação.
>
> **Próxima vela de perto** (painel ao lado; embaixo no celular): as últimas velas, a vela em formação ampliada, a
> **faixa** à frente (±1 ATR a partir do último fechamento, com a metade do lado da tendência colorida), a **linha do
> preço real** chegando minuto a minuto e o rótulo:
>
> **Próximos 15 min (até a decisão das 07:00): ↗ Tende a COMPRAR · fraco**
> Placar +1 de +2 para comprar. Faixa típica: 12,804 a 13,058.
> *Tendência, não promessa: mostra para que lado o placar da estratégia está inclinado. O preço pode ir para o outro lado.*
>
> Quando a vela fecha: **✗ Errou: o preço caiu 0,27% — ficou dentro da faixa.** (ou ✓ Acertou)
>
> **Histórico de acertos:** "Acertou o lado em 49,42% (171 de 346). Moeda ao ar: 50%. 'Sempre sobe': 50,58%. Dentro da
> faixa: 90,83%." e a frase: **"Até aqui, a tendência acertou o lado tanto quanto uma moeda ao ar."**

Os números acima são do preview (`docs/preview/grafico-binance/`), calculados sobre velas reais do LINK/USDT 1h (29/09 a
14/10/2026) com um placar **aproximado** feito no próprio preview (Donchian 20 + MACD 12/26/9, limiar ±2). Eles já mostram
por que a tela precisa da comparação com a moeda ao ar: **a tendência do placar, sozinha, não previu o preço da próxima hora
melhor que o acaso** nesse período. A tela diz isso quando for verdade.

Continua sendo simulação e histórico: dinheiro fictício, nenhuma ordem real, nada é recomendação nem previsão de preço.

## 3. Requisitos funcionais

### Gráfico de velas

- **RF01 — Velas.** O cartão "Preço e operações" passa a desenhar velas OHLC (alta na cor `--buy`, queda em `--sell`, com
  pavio), eixo de preço à direita com o **último preço** em etiqueta colorida, eixo de tempo embaixo no fuso do usuário (a
  data aparece na virada do dia). Velas vêm de `GET /v1/markets/candles` (D2).
- **RF02 — Navegação.** Roda do mouse e pinça aproximam ao redor do cursor; arrastar desloca; botões "−", "+", "Tudo" e
  "Agora" (44 px) fazem o mesmo sem gesto. Ao chegar perto da borda esquerda, a página anterior de velas carrega sozinha
  (sem botão). A faixa visível continua na URL (`?de=&ate=`, spec 005 RF04) para o link ser compartilhável.
- **RF03 — Cruz e legenda OHLC.** Passar o mouse (ou mover com as setas do teclado) mostra a cruz e troca a legenda do topo
  para a vela apontada: par, vela, data e hora, A/M/m/F, variação % sobre o fechamento anterior e volume. Sem cursor, a
  legenda mostra a última vela (e diz "em formação" quando for o caso).
- **RF04 — Volume.** Barras de volume num painel embaixo do preço, na cor da vela, mais claras.
- **RF05 — Vela.** Seletor 15m · 1h · 4h · 1d (só os timeframes que o backfill tem para o par; o da execução vem marcado ao
  abrir). Trocar a vela mantém o instante central da faixa. As camadas da estratégia (RF06 a RF08, RF10 a RF14) só aparecem
  no timeframe **da execução**, porque é o único em que ela decide; nos outros aparece o aviso "Previsão, placar, canal e
  'esperou' só aparecem na vela de 1 h, que é a que a estratégia usa". Compras e vendas aparecem em qualquer vela.

### Camadas da estratégia (sem recalcular o motor)

- **RF06 — Linhas sobre o preço.** Os indicadores **de preço** que a versão da estratégia usa, lidos de
  `signals.indicators` (D3): canal de Donchian (topo e fundo), as duas médias do cruzamento de EMA, as três linhas do
  Bollinger. Cada uma com rótulo de texto na legenda ("Canal Donchian (20 velas)"); estratégia sem nenhuma regra de preço
  mostra "Esta estratégia não usa linhas sobre o preço". Nenhum indicador que a estratégia não usa é desenhado (D11).
- **RF07 — Placar.** Painel abaixo do volume com uma barra por vela decidida: altura = pontuação gravada, linhas tracejadas
  nos limiares de compra e venda da versão, rótulo "Placar da estratégia — compra em +2, venda em −2". Vela de aquecimento
  não tem barra. A dica da vela diz "Placar +1 de ±2 · esperou" (ou comprou/vendeu).
- **RF08 — Eventos.** Setas de compra (abaixo da vela, para cima, verde) e venda (acima, para baixo, vermelha) no candle do
  preenchimento (spec 005 D6), com a palavra "Compra"/"Venda" quando a vela tem largura para ela; a dica mantém o texto da
  spec 005 RF03. Acima de 500 eventos na faixa, os agrupamentos da spec 005 RF05 continuam. "Esperou" (spec 008 RF08a) é
  uma camada desligada por padrão: o placar (RF07) já mostra cada decisão sem poluir o preço (D12).
- **RF09 — Stop e alvo.** Camada "Stop e alvo", desligada por padrão (spec 008 D6): para cada operação, uma caixa verde
  translúcida da entrada ao alvo e uma vermelha da entrada ao stop, do preenchimento de compra ao de venda, com os rótulos
  "alvo" e "stop"; a posição aberta estende as caixas até a ponta direita.
- **RF10 — Camadas ligáveis.** Botões de alternância com caixa marcada e texto ("Previsão", "Compras e vendas", "Canal
  Donchian", "Stop e alvo", "Esperou"), `aria-pressed`, 44 px; no celular ficam recolhidos em "Camadas do gráfico". A escolha
  fica no `localStorage` (preferência de tela, sem dado sensível).

### Ao vivo

- **RF11 — Vela em formação.** Na `live_paper`, a vela corrente aparece à direita com contorno tracejado e a palavra "em
  formação" na legenda; ela se atualiza sozinha (D9). Nunca entra no placar, nas linhas da estratégia, nem no histórico:
  quem decide é a vela fechada (regra sem lookahead).
- **RF12 — Preço real chegando.** Uma linha contínua do último fechamento até o preço de agora, ponto a ponto, por cima da
  faixa da previsão, com o marcador "agora". Ao fechar a vela, a linha completa fica até a próxima vela começar.

### Previsão (tendência)

- **RF13 — Tendência.** Para a última vela fechada, a API devolve a **tendência** (D4–D7): o lado para onde o placar
  gravado aponta (compra se > 0, venda se < 0, nenhum se 0), a **força** (fraco / forte / decidiu, pela fração do limiar) e o
  **horizonte** = até o fechamento da próxima vela da execução. O painel monta o rótulo com o tempo que falta: "Próximos 15
  min (até a decisão das 07:00): ↗ Tende a COMPRAR · fraco". Estando comprada, compra vira "Tende a SEGURAR" e venda "Tende a
  VENDER"; estando fora, venda vira "Tende a FICAR DE FORA" (não existe venda a descoberto). Estado é ícone + palavra + cor.
- **RF14 — Faixa à frente.** Do último fechamento até o fim da próxima vela, um cone de ±1 ATR (o `risk:atr` gravado na
  vela), com a metade do lado da tendência colorida e a outra neutra; uma linha tracejada **plana** no preço de partida (D10).
  Não há "preço alvo previsto": o motor não produz um, e a tela não inventa.
- **RF15 — "De onde vem".** Cartão ao lado do histórico com: o placar numa régua de venda a compra, o voto de cada regra em
  palavras ("MACD: a favor"; nunca só cor), o "o que falta para comprar" da spec 008 RF07 (mesmas frases, mesmo cálculo) e a
  faixa em palavras ("numa vela de 1 h o LINK costuma andar até 0,127 USDT (ATR de 14 velas)"). Texto fixo: "Tendência, não
  promessa. 'Fraco' quer dizer que só metade do caminho até a compra foi andado."
- **RF16 — Sem previsão.** A tendência some e o painel diz o porquê, numa frase: placar em 0 ("nenhuma regra puxa para um
  lado"), aquecendo, sem vela fechada ainda, simulação parada/concluída, preço ao vivo parado há mais que o limite do selo
  (spec 001 T5.8), ou timeframe da tela diferente do da execução. Nunca uma faixa sem tendência por trás.

### Acerto

- **RF17 — Resultado da vela.** Quando a vela do horizonte fecha, o painel mostra o resultado daquela previsão: "✓ Acertou"
  ou "✗ Errou", quanto o preço andou em %, e se ficou dentro ou fora da faixa. Empate (fechou igual) e "sem lado" não
  contam.
- **RF18 — Histórico.** Cartão "Histórico de acertos" da execução inteira: acerto do lado (% e "N de M"), a comparação com
  **moeda ao ar (50%)** e com **"sempre sobe"** (a fração de velas que subiram na mesma amostra), quanto fechou dentro da
  faixa, acerto por força (barra com a marca de 50%) e as últimas previsões numa tabela (vela, tendência, partida, preço
  depois, resultado), com "Ver mais" por cursor.
- **RF19 — Veredito honesto.** Uma frase do servidor, escolhida por regra fechada (D8): "acertou o lado mais que uma moeda ao
  ar", "tanto quanto uma moeda ao ar" ou "menos que uma moeda ao ar", e, abaixo de 30 previsões contadas, "Ainda há poucas
  previsões para dizer se acerta mais que o acaso." Nunca "a previsão funciona".

### Acessibilidade e texto

- **RF20 — Teclado e leitor de tela.** O gráfico é **uma** parada de Tab (spec 005): setas andam uma vela, Shift+seta pula para
  a próxima compra/venda, `+`/`−` aproximam, Home/End vão às pontas, Esc limpa a cruz. A vela apontada é anunciada numa região
  `aria-live` educada ("14/10 às 06:00: abertura 12,930, …; compra"). A descrição textual (spec 005 RF06) ganha a previsão
  ("Previsão: tende a comprar (fraco) até 07:00, faixa de 12,804 a 13,058"). A tabela de operações continua a alternativa
  completa.
- **RF21 — Glossário.** Termos novos no `Term`: vela em formação, volume, placar, tendência, faixa (ATR), acerto do lado,
  moeda ao ar.
- **RF22 — Crédito.** Se a biblioteca da D1-A for adotada, o rodapé do cartão traz o aviso de atribuição do `NOTICE` dela e o
  link para o site do autor, como a licença exige.

## 4. Requisitos não funcionais

- **RNF01 — Sem recalcular o motor por pedido.** Linhas, placar, ATR e votos vêm de `signals`; velas de `candles`; eventos
  de `fills`/`positions`. A tendência é função **pura** da linha gravada da última vela + os limiares da versão. O resumo do
  acerto é **uma** consulta SQL (`LEAD` do fechamento sobre `signals` ⋈ `candles`) — nunca um laço no Node por vela.
- **RNF02 — Desempenho.** `strategy-layers` e `projections` ≤ 300 ms p95 com 17.520 sinais (backtest 15 min de 6 meses,
  Postgres local de teste) e payload ≤ 250 KB por página; velas por páginas de 1.000. O gráfico mantém 60 quadros/s ao
  arrastar 5.000 velas num notebook comum (medido no spike, T0.2).
- **RNF03 — Dinheiro.** Preço, ATR, faixa e % saem da API como **texto decimal**; o painel compara e formata com `BigInt` de
  escala 8 (`src/format/decimal.ts`). `Number` só para coordenada de desenho (a biblioteca recebe `number` — conversão num
  adaptador único, testado). % do acerto é texto do servidor, arredondado a 2 casas para baixo.
- **RNF04 — Sem migration por padrão.** A D4-A deriva tudo do que já está gravado. Se o usuário escolher a D4-B (tabela de
  previsões), a migration é aditiva, com `.rollback.sql`, e a execução **para e pergunta** antes.
- **RNF05 — Contrato.** Rota nova declara `access` e `documentation`, é só do dono (alheio/inexistente/malformado = o mesmo
  `404`), Zod na entrada e na saída, `400` com todos os erros e sem eco, esquema espelhado no painel, contrato negativo entre
  usuários, mutantes do filtro de dono (API e Postgres). Mudanças em `/chart` e `/live-status` são **aditivas**.
- **RNF06 — Acessibilidade.** 375 px sem rolagem horizontal da página; contraste ≥ 4,5:1 em texto e ≥ 3:1 em velas, linhas,
  cone e setas, nos dois temas (`test/contrast.contract.ts` ganha as cores novas); alvos de 44 px; estado = ícone + palavra
  + cor; `prefers-reduced-motion` respeitado (nenhuma animação em laço).
- **RNF07 — Código.** Função ≤ 40 linhas, arquivo ≤ 200, sem `as`/`any`/`default export`, sem estilo inline (cores da
  biblioteca vêm dos tokens lidos por `getComputedStyle` num só lugar), escalas e transformações como funções puras
  testáveis. Biblioteca nova só com a D1-A autorizada (revoga a spec 005 D7 e RNF07 só para o gráfico de preço).
- **RNF08 — Motor intocado.** `packages/strategy-engine` e `packages/run-recording` não mudam.
- **RNF09 — Segurança.** A biblioteca roda sob a CSP do painel (`script-src 'self'`, `style-src 'self'`, sem
  `unsafe-inline`/`unsafe-eval`): o spike prova que nenhuma violação aparece no console do build. Nenhum dado de usuário no
  `localStorage` além das preferências de camadas e vela.

## 5. Decisões tomadas por padrão (o usuário pode mudar — ver §9)

| # | Decisão | Por quê | Alternativa |
|---|---|---|---|
| D1 | **Biblioteca `lightweight-charts@5.2.1`** (TradingView, Apache-2.0, uma dependência: `fancy-canvas@2.1.0`; publicada em 2026-08-12) **— exige autorização** | É o desenho da própria TradingView/Binance: velas, zoom/arrasto com inércia, cruz, escala de preço, painéis múltiplos nativos (v5), marcadores, desempenho em canvas com dezenas de milhares de velas; sem React próprio (casa com React 19 por `useEffect` num adaptador), TypeScript nativo, ESM | **B:** estender o SVG à mão (o preview prova que dá): zero dependência, mas zoom/arrasto/cruz/eixos/paginação viram código nosso (~1.000 linhas a manter) e SVG pesa acima de ~3.000 velas |
| D2 | Velas de `GET /v1/markets/candles` (já existe, ≤ 5.000), páginas de 1.000 para a esquerda | Velas são públicas e já validadas; nada novo na API | Rota nova sob `runs` |
| D3 | **Rota nova** `GET /v1/runs/:runId/strategy-layers?from=&to=` com as séries de preço da estratégia e o placar, lidas de `signals.indicators` | É o que o motor viu, vela a vela; sem recalcular | Calcular EMA/Bollinger no navegador (daria números diferentes do motor) |
| D4 | **Previsão derivada, sem tabela** (`projection-1`): a tendência de cada vela é função pura da linha de `signals` gravada; o acerto compara com o fechamento seguinte em `candles`. Versão da regra presa por teste dourado | `signals` e `candles` fechadas são imutáveis: a mesma regra devolve sempre o mesmo histórico; vale também para backtest (amostra grande) | **B (migration, exige autorização):** tabela `projections` gravada pelo worker na transação do passo; congela o que foi mostrado mesmo se a regra mudar |
| D5 | **Horizonte = a próxima vela da execução** (15 min, 1 h, 4 h ou 1 dia); o rótulo conta o que falta até o fechamento ("Próximos 15 min") | A estratégia só decide no fechamento; prever "15 min" numa vela de 1 h seria inventar um horizonte que o motor não tem | Horizonte fixo de 15 min (exigiria velas de 15 min e uma regra que o motor não roda) |
| D6 | **Faixa = fechamento ± 1 ATR** (`risk:atr` da vela; o mesmo ATR que dimensiona stop e alvo) | Número que o motor já produz; "quanto uma vela costuma andar" | ± desvio-padrão dos retornos (número novo) |
| D7 | **Força** pela fração `|placar| ÷ |limiar do lado|`: ≤ 0,5 "fraco", entre 0,5 e 1 "forte", ≥ 1 "decidiu" | Três palavras que um leigo entende; sem percentual de "certeza" | Mostrar o placar cru ("+1 de +2") sem adjetivo |
| D8 | **Acerto do lado**: lado compra e fechamento seguinte > partida = acertou, < = errou; venda o contrário; igual e "sem lado" não contam. Veredito: "mais que moeda ao ar" só se o acerto for maior que 50% **e** o intervalo de Wilson de 95% ficar todo acima de 50%; "menos" se todo abaixo; senão "tanto quanto". Abaixo de 30 contadas: "poucas previsões" | Regra fechada, testável, que não deixa a tela elogiar o acaso | Só mostrar o %, sem veredito |
| D9 | **Vela em formação pela API**: o ticker da API passa a assinar também `<par>@kline_<tf>` dos pares e timeframes habilitados e entrega ao painel `{ type: 'candle', closed: false, … }` no WebSocket que já existe, no máximo 1 por segundo por par | Abertura, máxima, mínima e volume certos desde o início da vela, como na Binance | **B:** montar a vela no navegador só com os ticks vistos desde que a tela abriu (máxima/mínima e volume incompletos; rotulado "parcial") |
| D10 | **Meio-cone colorido + linha plana** no preço de partida | Mostra o lado sem inventar inclinação nem preço futuro | **B:** linha tracejada inclinada para o lado da tendência (sem número no eixo); mais parecida com "a linha que achamos que vai", mas a inclinação seria inventada |
| D11 | Camadas só dos indicadores **da estratégia**; nada de "EMA 20/50" genérica | Linha que a estratégia não usa confunde o leigo sobre o porquê da decisão | Indicadores livres como na Binance (fora do escopo) |
| D12 | "Esperou" vira o painel do placar; os pontinhos no preço ficam como camada desligada | O placar mostra toda decisão com a força; pontinho em toda vela polui | Pontinhos ligados por padrão (spec 008 RF08a) |
| D13 | Painel **"Próxima vela de perto"** ao lado do gráfico (embaixo no celular) | Uma vela à frente num gráfico de 100 velas tem 10 px: ilegível | Só o cone pequeno no gráfico principal |
| D14 | A spec 008 T3.4 (pontinhos e `ChartLevels` no SVG) **não é feita no SVG**: entra aqui | Seria código jogado fora com a D1-A | Fazer a 008 inteira antes (mais trabalho, mesmo resultado) |
| D15 | Histórico de acertos também no **backtest** e no walk-forward (só fora da amostra) | Mesma derivação, amostra de meses: é onde o usuário vê se a tendência vale algo | Só na `live_paper` |

## 6. Fora do escopo

- Desenhar à mão no gráfico (linhas de tendência, régua, Fibonacci), indicadores livres, comparar dois pares.
- Livro de ofertas, negócios recentes, profundidade.
- Qualquer previsão de **preço** (alvo, número no eixo, probabilidade de alta). A tela mostra tendência do placar e faixa
  típica, e mede o acerto.
- Previsão em horizonte diferente da vela da execução; previsão no ranking de metas e em "Seus ativos".
- Alerta no Telegram da tendência (só os alertas atuais de compra/venda).
- Ordens reais (spec 002).

## 7. Critérios de aceite

1. Backtest real de BTCUSDT 15 min em 6 meses: o cartão abre com velas, volume, placar e canal; arrastar até o início
   carrega as páginas sozinho; `strategy-layers` e `projections` ≤ 300 ms p95 e ≤ 250 KB.
2. Legenda OHLC da vela apontada igual a `candles` (texto decimal) em `America/Sao_Paulo` e `America/New_York`.
3. As linhas do canal/EMA/Bollinger desenhadas são as de `signals.indicators` da execução (contrato compara ponto a ponto).
4. Tendência, força e faixa de uma vela conhecida batem com a conta à mão; "sem previsão" aparece em cada motivo do RF16 com
   a frase certa.
5. O resumo do acerto bate com um oráculo independente (contagem em TypeScript sobre o fixture) nos dois conjuntos reais;
   o veredito segue a D8 nos casos de borda (29/30 contadas, intervalo encostando em 50%).
6. `live_paper`: a vela em formação muda a cada aviso (D9-A) e nunca entra no placar; ao fechar a vela, o resultado da
   previsão aparece sem recarregar.
7. Execução de outro usuário → `404` nas rotas novas; `400` com todos os erros, sem eco.
8. Teclado: Tab chega ao gráfico, setas movem a cruz e o anúncio muda; Shift+seta pula para a operação seguinte.
9. 375 px sem rolagem horizontal da página nos dois temas; contraste conferido; build sem violação de CSP no console;
   captura final em `evidence.md`.

## 8. Riscos

| Risco | Efeito | Mitigação |
|---|---|---|
| Leigo lê a tendência como promessa | Decide com dinheiro real por causa dela | Texto fixo "tendência, não promessa", veredito contra a moeda ao ar (D8), sem preço-alvo, faixa larga |
| A tendência acerta como o acaso (o preview já mostrou ~49%) | Usuário se decepciona | É informação, não defeito: o veredito diz isso; a faixa (≈ 90% dentro) é o que a tela tem de útil |
| Biblioteca em canvas tira o foco e o leitor de tela das setas | Regressão da spec 005 RF03 | Uma parada de Tab com anúncio `aria-live` (RF20), tabela continua completa, contrato de teclado no E2E |
| CSP bloqueia algo da biblioteca (estilo em atributo, logotipo) | Gráfico quebra só no build | Spike T0.2 roda `vite build` + `vite preview` com a CSP real e lê o console |
| happy-dom não tem canvas | Contrato do painel não testa o gráfico | Biblioteca atrás de uma porta (`ChartSurface`); contratos usam uma superfície falsa; o desenho real só no E2E |
| Regra `projection-1` muda depois | Histórico muda junto (D4-A) | Versão no payload e teste dourado; mudar a regra = `projection-2` |
| Assinar kline no ticker multiplica mensagens | Carga na API | Teto de 1/s por par por socket, só pares assinados pelo painel; desligável por env |
| `/markets/candles` exige par habilitado | Execução de par desabilitado depois sem velas | Mensagem "par fora da lista atual" e o gráfico antigo como reserva |

## 9. Decisões que o usuário precisa tomar (A = recomendado)

1. **Biblioteca de gráfico (D1):** A) adotar `lightweight-charts@5.2.1` (Apache-2.0, crédito obrigatório no rodapé) ·
   B) seguir com SVG à mão. *Instalar só depois da sua resposta.*
2. **Onde ficam as previsões (D4):** A) derivar do que já está gravado, sem migration · B) tabela nova `projections`
   (migration aditiva, exige sua autorização).
3. **Vela em formação (D9):** A) a API repassa a vela da Binance pelo WebSocket · B) montar no navegador com os ticks vistos
   (aproximado, rotulado "parcial").
4. **Desenho da previsão (D10):** A) meio-cone colorido + linha plana · B) linha inclinada para o lado da tendência, sem
   número.
5. **Spec 008 T3.4 (D14):** A) pular e fazer aqui · B) terminar a 008 inteira antes.
6. **Força (D7):** A) três palavras (fraco/forte/decidiu) · B) só "+1 de +2".
