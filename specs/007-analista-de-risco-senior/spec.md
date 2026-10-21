# Spec 007 — Analista de risco sênior (ritmo, tamanho e auditoria de acertos da simulação ao vivo)

## 1. Problema

Em 2026-10-14 o usuário (leigo) acompanhou a simulação ao vivo LINK/USDT 1h e pediu que o **ritmo** da simulação deixe de
ser fixo. Hoje a simulação decide **uma vez por vela fechada** (spec 006: 15m, 1h, 4h ou 1d, escolhida na criação) e
**sempre com o mesmo tamanho**: o `riskPerTrade` da estratégia (1% do saldo no Placar clássico). O pedido, nas palavras
dele, resumido:

- Um **"analista de risco sênior" automatizado** decide **quão frequente olhar o mercado e operar** e **quanto arriscar**,
  considerando **todos os algoritmos da casa** e dados como **volume** e **número de transações**.
- Operações **rápidas (10 a 60 minutos)** dentro de uma meta de **7 dias**; a meta pode ser alcançada **somando várias
  operações pequenas**, sem esperar uma única alta de +3%.
- Um **auditor de acertos** que compara cada previsão com a **moeda ao ar** e **rebaixa quem não prova valor**; uma
  **equipe de especialistas** (tendência, reversão, volume, sentimento) com voto pesado pelo histórico de acerto; e a
  opção honesta **"sem previsão"** quando o mercado está confuso.

O que os números da casa já dizem (e que esta spec não pode esconder):

- **A tendência do placar não bateu a moeda ao ar.** No preview da spec 009 (LINK/USDT 1h, 29/09 a 14/10/2026) a
  tendência acertou o lado em **49,42% (171 de 346)**. O intervalo de Wilson de 95% vai de **44,2% a 54,7%**: contém 50%,
  então "tanto quanto uma moeda ao ar".
- **Operar rápido costuma perder para as taxas.** Na spec 003 (evidência T1.4, 01/04 a 01/10/2026, 15 min): LINKUSDT fez
  **371 operações** e terminou com **−28,84%**, pagando **2.310,68 USDT de taxas** sobre 10.000; BNBUSDT −2,88%; os 45
  backtests de 15 min ficaram entre −0,06% e −90,43%. Taxa padrão 0,1% + slippage 0,05% por lado ≈ **0,3% por ida e
  volta**: uma operação de 15 a 60 min precisa andar mais que isso só para empatar.

Por isso o analista desta spec **só tira risco, nunca põe**: ele pode pausar, espaçar e encurtar operações e reduzir o
tamanho, mas nunca arrisca mais que a estratégia escolhida pelo usuário. E ele próprio passa pelo auditor.

## 2. Objetivo

No detalhe de uma simulação ao vivo com o analista ligado, um cartão **"Analista de risco"** responde em linguagem simples:

> **Postura agora: CAUTELA** · olha o mercado **a cada 1 hora** · arrisca **¼** do que a estratégia arriscaria (0,25% do
> saldo por operação) · cada operação dura **no máximo 60 min**.
> **Por quê:** a equipe está **sem previsão** (só a Tendência provou acertar mais que a moeda, e ela está neutra); volume
> 0,8× o normal das últimas 24 h; o movimento típico de 15 min (0,42%) paga as taxas (0,30%) com folga pequena.
> **Travas:** perda de hoje 0,12% de 1% permitida · 1 de 3 perdas seguidas · 3 de 8 operações hoje · ainda cabem 4,1% até
> a perda máxima da meta.
> (T4.0: "arrisca ¼" é o TETO de risco da entrada aberta NESSA vela — ¼ do valor em risco que a estratégia usaria;
> não muda a operação já aberta nem a saída, e a vela seguinte traz o próprio teto.)
> **Meta da semana:** +3% em 7 dias. Somado até aqui: +0,64% em 5 operações. Falta +2,36%.
>
> **Equipe de especialistas** (votos na última vela de 15 min):
> | Especialista | Voto | Acertou o lado (30 dias) | Situação | Peso |
> |---|---|---|---|---|
> | Tendência | neutro | 53,1% (1.204 de 2.267) | provou valor | 0,04 |
> | Reversão | a favor | 49,8% (1.010 de 2.028) | rebaixado: igual à moeda | 0 |
> | Volume | contra | 50,6% (1.143 de 2.259) | rebaixado: igual à moeda | 0 |
> | Sentimento | a favor | — (27 previsões) | em observação: menos de 30 | 0 |
>
> *O analista é uma regra automática sobre dados passados. "Cautela" não é recomendação; dinheiro fictício.*

Os números acima são **ilustrativos** (o formato, não o resultado): a T0.2 mede os reais e registra em `evidence.md`.

Tudo é **simulado localmente**: dinheiro fictício, nenhuma ordem real, nenhuma chave de corretora, nada é recomendação.

## 3. Requisitos funcionais

### Fase 1 — com os dados que já temos

- **RF01 — Ligar o analista.** Ao criar uma simulação ao vivo (`POST /v1/runs`, `live_paper`), o usuário pode marcar
  "Deixar o analista de risco decidir o ritmo e o tamanho". Com ele ligado, a vela da simulação é **15 min** (D5) e o pedido
  grava `runs.request.analyst = { version: 'analyst-1', mode }`. Sem marcar, nada muda (comportamento das specs 006/008).
- **RF02 — Leituras do mercado (por vela de 15 min fechada, sem lookahead).** Volume relativo (volume da vela ÷ média das
  últimas 96 velas = 24 h), volatilidade (ATR de 14 velas em % do preço e o percentil dele nos últimos 30 dias), momentum
  (retorno das últimas 4 e 16 velas), sentimento (Fear & Greed do dia, como o motor já lê), custo de ida e volta da
  execução (2 × (taxa + slippage) dos `RunParameters`) e a **razão movimento ÷ custo** (ATR% ÷ custo).
- **RF03 — Equipe de especialistas.** Quatro especialistas, um por família de regra que o motor já tem (`RULE_FAMILY`):
  **Tendência** (cruzamento de EMA, MACD, rompimento Donchian), **Reversão** (RSI, Bollinger), **Volume** (OBV) e
  **Sentimento** (Fear & Greed), com os parâmetros do catálogo da casa (D9). Cada um vota **a favor (+1)**, **contra (−1)**
  ou **neutro (0)** na vela, calculado pelo **próprio `signalStep` de produção** (nenhum indicador reimplementado).
- **RF04 — Auditor de acertos.** Para cada especialista **e para a tendência da estratégia da simulação** (regra
  `projection-1` da spec 009), por par: conta as previsões dos últimos 30 dias de velas de 15 min com lado (voto ≠ 0) cujo
  resultado já fechou: **acertou** se o fechamento da vela seguinte andou para o lado do voto, **errou** no contrário,
  **empate** não conta. Veredito pelo **intervalo de Wilson de 95%** (o mesmo da spec 009 D8): `too_few` abaixo de **30**
  contadas ("em observação"); `above` se o limite **inferior** > 50% ("provou valor"); `below` se o **superior** < 50%
  ("errou mais que a moeda"); senão `even` ("igual à moeda"). Mostra também "sempre sobe" (fração das velas que subiram).
- **RF05 — Peso pelo histórico.** Peso do especialista = **limite inferior de Wilson − 0,5** quando `above`, e **0** em
  todos os outros casos (D4-A: quem não provou não vota). A tela diz "rebaixado" com o motivo em palavras.
- **RF06 — Previsão da equipe ou "sem previsão".** Soma ponderada dos votos. **"Sem previsão"** (com a frase do motivo)
  quando: nenhum especialista provou valor; os que provaram se dividem (o lado vencedor tem menos de 2/3 do peso); a
  volatilidade está acima do percentil 95 dos 30 dias ("mercado agitado demais para ler"); faltam velas (lacuna, espera por
  dado, aquecimento). Senão: lado (sobe/desce) e força ("fraca" abaixo de 2/3 do peso a favor, "firme" a partir de 2/3).
- **RF07 — Travas de risco** (D7-A), avaliadas antes de tudo e **nunca** bloqueando uma saída: perda do dia ≥ **1%** do
  saldo inicial (janela móvel de 24 h) → pausa até a janela liberar; **3 perdas seguidas** → pausa de 4 velas (1 h);
  **8 operações** em 24 h → pausa; folga até a perda máxima da meta menor que **2 ×** o risco de uma operação → pausa;
  razão movimento ÷ custo abaixo de **2** → pausa ("o movimento típico não paga as taxas"); preço parado ou espera por dado
  → pausa.
- **RF08 — Postura, ritmo e tamanho** (`analyst-1`, regra fechada, D10): a cada vela de 15 min o analista escolhe:
  - **Postura**: `pause` (nenhuma entrada nova), `caution`, `normal`, `confident`.
  - **Ritmo** ("olhar a cada"): 15 min, 1 h ou 4 h. Pelo **volume relativo**: ≥ 1,5 → 15 min; entre 0,7 e 1,5 → 1 h;
    abaixo de 0,7 → 4 h; abaixo de 0,4 → pausa ("mercado parado"). No ritmo de 1 h ou 4 h só as velas que **fecham** na
    hora cheia (ou no múltiplo de 4 h, UTC) permitem entrada; a reavaliação da postura também acontece só nelas.
  - **Tamanho** (fração do `riskPerTrade` da estratégia, **nunca acima de 1**): `confident` 1 (equipe a favor com força
    firme, volume ≥ 1, volatilidade ≤ percentil 90); `normal` ½ (equipe a favor, força fraca); `caution` ¼ (sem
    previsão); equipe **contra** → `pause` (não compra contra quem provou acertar); travas → `pause`.
  - **Duração máxima da operação**: **4 velas de 15 min (60 min)**; passou disso sem alvo nem stop, o analista manda sair
    na abertura seguinte. O stop e o alvo da estratégia (ATR) continuam valendo dentro da vela.
- **RF09 — Meta somada** (D8-A). A meta da simulação (ex.: +3% em 7 dias, perda máxima −5%) continua a da spec 001 (T4b.4) e da spec 008: o
  ganho de cada operação **soma** no saldo e a meta é alcançada pela soma; o cartão mostra "somado até aqui: +0,64% em 5
  operações; falta +2,36%". Ao atingir, a simulação conclui como hoje (`goal_reached`).
- **RF10 — Modo sombra primeiro** (D1-A). Sem a autorização da §9, o analista roda em **sombra**: calcula, grava e mostra
  "o que faria" (postura, ritmo, tamanho, saída por tempo) **sem** mudar a simulação. Em modo **governar** (só depois da
  autorização), as decisões viram comandos da simulação na mesma transação da vela.
- **RF11 — Registro.** Toda decisão do analista fica gravada por vela (D3-A): leituras, votos, auditor, travas, postura,
  ritmo, tamanho, os comandos que deu (ou daria, em sombra) e a frase; nunca com dado pessoal.
- **RF12 — Medição honesta antes de governar.** Um relatório contrafactual em backtest (6 meses de 15 min, LINK, BNB, BTC
  e ETH) compara **estratégia sozinha × estratégia com o analista**: resultado líquido, taxas, operações, maior queda pelo
  vale, tempo pausado. O relatório diz em uma frase se o analista ajudou, atrapalhou ou empatou, pela mesma régua do
  intervalo (D11); vai para `evidence.md` e é o que o usuário lê antes de autorizar o modo governar.
- **RF13 — API.** `GET /v1/runs/:runId/analyst` (estado atual: postura, ritmo, tamanho, travas, meta somada, equipe com
  auditor, frases) e `GET /v1/runs/:runId/analyst/decisions?cursor=&limit=` (histórico, mais recente primeiro, 24 por
  página, teto 100). Só do dono; `live_paper` sem analista = `409 ANALYST_NOT_ENABLED`; outro tipo = `409 RUN_NOT_LIVE`.
- **RF14 — Painel.** Opção no seletor de vela da simulação (spec 006 `SimulationTimeframePicker`), cartão "Analista de
  risco" no detalhe (acima de "Acompanhamento" da spec 008), tabela da equipe, histórico com "Ver decisões anteriores",
  linha do tempo de postura no gráfico **não** (fora do escopo, D12). Estado = ícone + palavra + cor; termos novos no
  glossário: analista de risco, postura, ritmo, especialista, auditor, moeda ao ar, intervalo de confiança, sem previsão,
  trava, modo sombra.
- **RF15 — Tempo real.** Cada vela nova atualiza o cartão pelo aviso `runs` do WebSocket que já existe; sem polling novo.

### Fase 2 — com dados novos (cada um entra como especialista e passa pelo auditor antes de ter peso)

- **RF16 — Hora do dia e correlação com o BTC** (sem fonte nova): especialista "Horário" (acerto histórico por faixa de
  hora UTC) e leitura "andando junto do BTC" (correlação de 96 velas entre os retornos do par e do BTCUSDT, que já temos).
- **RF17 — Número de transações e lado agressor** (da própria vela da Binance: campos `n` e `V` do kline): hoje o
  `tradeCount` é lido e **descartado**, e o volume comprador agressor nem é lido. Exige **migration aditiva** em `candles`
  e um novo backfill (D6). Especialista "Atividade" (transações relativas) e "Agressor" (fração do volume comprada a
  mercado).
- **RF18 — Livro de ofertas** (profundidade de 20 níveis pelo stream público): desequilíbrio compra × venda perto do
  preço. Não tem histórico na Binance: o auditor só começa a contar depois de gravar ≥ 30 previsões ao vivo. Exige
  **migration** (fotos do livro) e decisão de retenção.
- **RF19 — Funding e open interest, dominância do BTC e notícias**: cada um exige **fonte externa autorizada** (API de
  futuros da Binance; uma fonte de dominância; uma fonte de notícias com chave). **Nada disso é feito sem autorização
  explícita do usuário para a fonte**, e notícia nunca entra como texto livre na decisão (só um placar numérico da fonte).

## 4. Requisitos não funcionais

- **RNF01 — Só tira risco.** Tamanho ≤ 1 × `riskPerTrade` da estratégia; o analista nunca abre operação que a estratégia
  não pediu, nunca impede uma saída (sinal de venda, stop, alvo, meta, parada do usuário) e, em falha própria, cai em
  `pause` (governar) ou grava o código da falha sem afetar a simulação (sombra).
- **RNF02 — Sem lookahead.** Decisão no fechamento da vela `t` só com velas ≤ `t`; comandos entram no passo de `t` e
  agem na abertura de `t+1` (regra do repo). O acerto de uma previsão em `t` só é contado depois que `t+1` fechou. Teste de
  contrato prende isso (corte da série no meio dá a mesma decisão).
- **RNF03 — Mesmo código no backtest e ao vivo.** A regra `analyst-1` mora num pacote **puro** (`packages/risk-analyst`),
  chamado pelo worker (ao vivo) e pelo backtest/contrafactual. Determinística: mesma entrada, mesma decisão, byte a byte
  (dourado literal). Mudar a regra exige `analyst-2` e o dourado regravado.
- **RNF04 — Motor.** Fase 1 em **sombra não muda** `packages/strategy-engine` nem `packages/run-recording`. O modo
  **governar** muda o motor (motivos de comando novos e, com D2-A, o comando de tamanho): versão nova do motor, dourado,
  harness de 21 verificações e mutantes — **só com autorização**. *(T4.0: autorizado e fechado como teto de entrada por
  passo SEM versão nova do motor — o dourado `engine-2` fica idêntico; único motivo novo `analyst_timeout`; ADR 0002 A21.)*
- **RNF05 — Migrations (todas aditivas, com `.rollback.sql`, e a execução PARA E PERGUNTA antes de cada uma):**
  `analyst_decisions` (D3-A, Fase 1); `run_commands` com os motivos novos (governar); colunas novas em `candles` (RF17);
  fotos do livro (RF18).
- **RNF06 — Desempenho.** O passo do analista ≤ **50 ms p95** por simulação por vela (uma leitura indexada de ≤ 3.100
  velas de 15 min do par, compartilhada entre as simulações do mesmo par na ronda); as rotas ≤ 300 ms p95.
- **RNF07 — Dinheiro e taxas.** Texto decimal na API (`decimal.js`), `BigInt` de escala 8 no painel; % com 2 casas para
  baixo nos acertos (spec 009 D3) e contra o usuário no dinheiro (spec 008 RNF04). Float só dentro de indicador.
- **RNF08 — Contrato e isolamento.** Rotas com `access` e `documentation`, Zod na entrada e saída, alheio/inexistente/
  malformado = o mesmo `404`, `400` com todos os erros e sem eco, contrato negativo entre usuários, mutantes do filtro de
  dono (API e Postgres). `analyst_decisions` entra no registro LGPD (exportação e purga).
- **RNF09 — Sem PII em log.** Nenhum saldo, preço ou meta em log; só ids opacos e códigos.
- **RNF10 — Painel.** 375 px sem rolagem horizontal, contraste ≥ 4,5:1 (texto) e ≥ 3:1 (marcas), dois temas, foco
  visível, nunca só cor, `prefers-reduced-motion`, ≤ 40 linhas por função e ≤ 200 por arquivo.
- **RNF11 — Linguagem.** Nenhuma frase diz "vai subir", "garantido" ou "recomendamos". Toda postura tem a frase fixa: "O
  analista é uma regra automática sobre dados passados; não é recomendação."

## 5. Decisões tomadas por padrão (o usuário pode mudar — ver §9)

| # | Decisão | Por quê | Alternativa |
|---|---|---|---|
| D1 | **Sombra primeiro**: o analista calcula, grava e mostra; só governa a simulação depois da sua autorização **e** do relatório contrafactual (RF12) | O que a casa mediu até hoje (49,4%; 15 min perdendo para as taxas) não autoriza confiar no analista antes de medir | **B:** governar desde o início (exige já a mudança no motor e a migration de `run_commands`) |
| D2 | **D2 = teto de entrada por passo (¼, ½, 1×)** do risco da estratégia, e `0` = nenhuma entrada naquela vela (a pausa). Autorizada (2026-10-15) e fechada na T4.0 pela revisão do arquiteto (ADR 0002 A21, variante "1c"): campo opcional `entryRiskScale` na entrada do passo do motor, SEM estado novo nem versão nova do motor; vale só para a entrada nova daquela vela e nunca para a saída | É o pedido ("quanto arriscar") sem quebrar simulações em andamento: o dourado `engine-2` fica idêntico e nada vaza de uma vela para a outra | **B:** só "opera ou não opera" (pausa/libera) e saída por tempo; o motor ganha só os motivos novos |
| D3 | **Tabela `analyst_decisions`** (uma linha por simulação e vela) — **exige autorização: migration** | Toda decisão fica registrada (regra do repo); histórico congelado mesmo se a regra mudar; tela barata | **B:** recalcular sob demanda a partir de velas públicas + estado da simulação (sem migration; tela lenta; nada congelado) |
| D4 | **Auditor estrito**: só vota quem provou (Wilson inferior > 50% com ≥ 30 contadas) | Não deixa o acaso decidir tamanho de operação | **B:** "em observação" vota com meio peso |
| D5 | **Vela base de 15 min**; operações de 1 a 4 velas (15 a 60 min). "10 min" não existe com velas de 15 min | É a menor vela que o motor, o backfill e o stream já têm | **B:** velas de 5 min (muda o motor: `ENGINE_TIMEFRAME`, backfill, stream; e as taxas pesam ainda mais) |
| D6 | **Fase 2 na ordem do custo**: (1) hora do dia e correlação com BTC (sem fonte nova); (2) número de transações e lado agressor (da própria vela, migration em `candles`); (3) livro de ofertas (migration, sem histórico); (4) funding/OI, dominância e notícias só com fonte autorizada | Cada passo traz dado sem abrir dependência externa antes da hora | **B:** todas as fontes juntas |
| D7 | **Travas conservadoras**: 1% de perda em 24 h, 3 perdas seguidas → pausa de 1 h, 8 operações em 24 h, folga de 2 operações até a perda máxima, movimento ≥ 2 × custo | Operar rápido perdeu 28,8% em LINK 15 min (spec 003); travas cortam a sangria | **B:** soltas: 2% em 24 h, 5 perdas seguidas, sem teto de operações |
| D8 | **Meta somada**: as operações somam no saldo até a meta do período (ex.: +3% em 7 dias); ao atingir, conclui como hoje | É o "várias transações até a meta" do pedido, sem regra nova de dinheiro | **B:** ao atingir, segue com a meta dobrada e metade do tamanho ("travar e continuar") |
| D9 | **Catálogo dos especialistas** = as 7 regras da casa por família, com os parâmetros do Placar clássico quando ele tem a regra (EMA 9×21, MACD 12/26/9, RSI 14 30/70, OBV EMA 20) e os padrões do editor nas outras (Donchian 20, Bollinger 20/2, Fear & Greed 25/75), limiar ±1 por especialista; fechado na T0.1 | "Todos os algoritmos da casa" sem inventar parâmetro; um especialista é uma estratégia de uma família só rodada pelo `signalStep` | Parâmetros otimizados por walk-forward (mais caro; risco de sobreajuste) |
| D10 | **Regra `analyst-1` fechada** (tabela do plan D4), números em `ANALYST_RULES` | Testável, dourada, explicável numa frase | Pesos aprendidos (caixa-preta; o leigo não audita) |
| D11 | **Veredito do contrafactual** pela diferença de resultado líquido por janela de 7 dias (com analista − sem), com Wilson sobre "janelas em que ajudou": `helped` / `hurt` / `even`; abaixo de 20 janelas `too_few` | Mesma régua do auditor; impede chamar sorte de acerto | Só mostrar os dois números |
| D12 | **Sem camada nova no gráfico** nesta spec; a postura aparece no cartão e no histórico | O gráfico está sendo refeito na spec 009 (outro executor); camada nova depois dela | Faixa de postura sob o gráfico |
| D13 | **Horizonte do auditor = 1 vela** (a seguinte) | Previsões de 4 velas se sobrepõem e inflam a confiança do Wilson | Horizonte de 4 velas sem sobreposição |

## 6. Fora do escopo

- Qualquer ordem real, chave de corretora ou modo `live` (spec 002). Tudo aqui é simulado.
- Venda a descoberto, alavancagem, futuros (funding/OI entram só como leitura, se autorizados).
- Aprendizado de máquina, pesos treinados, LLM lendo notícia em texto livre.
- O analista em backtest e walk-forward pela tela (só no relatório contrafactual da RF12); o analista no ranking das metas.
- Alerta novo no Telegram por mudança de postura (os alertas atuais continuam).
- Camada no gráfico (D12) e velas de 5 min (D5-B).

## 7. Critérios de aceite

1. Simulação ao vivo de LINK/USDT com o analista em sombra: a cada vela de 15 min aparece uma decisão com postura, ritmo,
   tamanho, travas, equipe (voto, acerto "N de M", situação, peso) e a frase; a simulação faz exatamente as mesmas
   operações que faria sem o analista (sombra não muda nada: comparação byte a byte de `fills`).
2. O auditor bate com um oráculo independente (contagem em TypeScript sem importar `src`) nos dois conjuntos reais; o
   veredito segue o Wilson nas bordas (29/30 contadas, limite encostando em 50%); a tendência LINK 1h do preview sai `even`.
3. "Sem previsão" aparece em cada motivo da RF06 com a frase certa; equipe contra → `pause`; nenhuma postura passa de 1×.
4. Corte da série no meio dá a mesma decisão (sem lookahead); reinício do worker não duplica decisão (único por vela).
5. Relatório contrafactual (RF12) em `evidence.md` com o veredito D11 para os quatro pares.
6. Modo governar (só se autorizado): pausa impede entrada e nunca saída; saída por tempo na 5ª vela; tamanho ¼ dá risco
   ≤ ¼ × `riskPerTrade × saldo`; paridade backtest × ao vivo com o analista nos conjuntos reais.
7. Rotas: outro usuário → `404`; sem analista → `409 ANALYST_NOT_ENABLED`; backtest → `409 RUN_NOT_LIVE`; `400` sem eco.
8. Passo do analista ≤ 50 ms p95 com 5 simulações do mesmo par; rotas ≤ 300 ms p95.
9. 375 px sem rolagem horizontal nos dois temas, contraste conferido, uma captura final em `evidence.md`.

## 8. Riscos

| Risco | Efeito | Mitigação |
|---|---|---|
| Nenhum especialista prova valor (provável, pelo 49,4%) | Analista vive em "sem previsão" e quase não opera | É a resposta honesta; a T0.2 mede antes e para e pergunta se for o caso em todos os pares |
| Leigo lê "confiante" como promessa | Decide com dinheiro real | Frase fixa (RNF11), "só tira risco", nunca "vai subir", tudo simulado |
| Operações rápidas perdem para as taxas | Simulação sangra | Trava movimento ÷ custo, teto de operações, relatório contrafactual antes de governar |
| Auditor superestima por amostras dependentes | Especialista promovido por sorte | Horizonte de 1 vela (D13), janela de 30 dias, mínimo de 30, limite inferior do Wilson como peso |
| Mudar o motor quebra a paridade backtest × ao vivo | Resultado diverge | Só com autorização; versão nova, dourado, harness, `make live-test` com paridade |
| Spec 009 e esta duplicam o Wilson | Duas regras de acerto | Um só módulo puro; quem chegar primeiro cria, o outro importa (T0.1) |
| Leitura de 3.000 velas por simulação por vela | Worker lento | Leitura por par por ronda, compartilhada; teto de 50 ms p95 medido |
| Fontes externas (Fase 2) caem ou mudam | Especialista sem dado | Dado ausente = voto neutro e "sem leitura" na tela; nunca bloqueia a simulação |

## 9. Decisões que o usuário precisa tomar (A = recomendado)

1. **Como o analista age (D1):** A) sombra primeiro; governa só depois da sua autorização e do relatório contrafactual ·
   B) governa desde o início. *Sem resposta: A.*
2. **Tamanho da operação (D2):** A) quatro degraus (0, ¼, ½, 1×) — **muda o motor, exige autorização** · B) só pausa/libera
   e saída por tempo. *Sem resposta: nada no motor até você decidir; a sombra grava o tamanho que usaria.* **Respondida
   (2026-10-15, A) e fechada na T4.0 como teto de entrada por passo (ADR 0002 A21).**
3. **Registro das decisões (D3):** A) tabela nova `analyst_decisions` — **migration aditiva, exige autorização** · B) sem
   tabela, recalcular ao abrir a tela. *Sem resposta: a execução para na T2.1 e pergunta.*
4. **Auditor (D4):** A) estrito, só vota quem provou · B) "em observação" vota com meio peso. *Sem resposta: A.*
5. **Vela base (D5):** A) 15 min (operações de 15 a 60 min) · B) velas de 5 min (muda o motor). *Sem resposta: A.*
6. **Travas (D7):** A) conservadoras (1%/24 h, 3 perdas, 8 operações) · B) soltas (2%/24 h, 5 perdas, sem teto).
   *Sem resposta: A.*
7. **Meta (D8):** A) somada até a meta do período e para · B) ao atingir, segue com meta maior e metade do tamanho.
   *Sem resposta: A.*
8. **Dados novos (D6):** A) na ordem do custo, fonte externa só com sua autorização por fonte · B) todas juntas.
   *Sem resposta: A, e funding/OI, dominância e notícias ficam de fora.*
