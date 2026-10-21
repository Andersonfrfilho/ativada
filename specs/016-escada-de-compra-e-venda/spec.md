# Spec 016 — Compras e vendas em escada (entrar em partes quando cai, vender em partes quando sobe)

## 1. Problema

Em 2026-10-16 o usuário (leigo) pediu, nas palavras dele:

> "e acho que poderia também montar algo como vendas em partes, então aqui ganha 3%, 5%, 10% e aqui compra em 2%, 3%, 5%
> em cascata, entendeu? e a quantidade de compra e venda"

São três pedidos:

- **(a) Vendas em partes (saída escalonada).** Vender uma fração da posição a +3%, outra a +5%, outra a +10%, cada uma com a
  sua quantidade.
- **(b) Compras em cascata (entrada escalonada, "escada").** Comprar uma parte agora e outras partes **só se o preço cair**
  −2%, −3%, −5% (ou outros degraus), cada uma com a sua quantidade.
- **(c) A quantidade** de cada compra e de cada venda **mostrada e configurável**: em moeda, em USDT, em % da posição e com o
  preço.

Como o motor funciona hoje (ADR 0002, `packages/strategy-engine/src/wallet/`), conferido no código em 2026-10-16:

- A carteira tem **no máximo UMA posição** (`WalletState.position`) e **no máximo UMA ordem viva** (`pendingOrder`). A compra
  é uma ordem só (`placeEntry`, a mercado ou limitada), e a venda é **inteira**: no stop, no alvo, por sinal, por comando ou
  na lacuna (`closePosition` fecha a quantidade toda).
- O tamanho nasce no preenchimento, pelo **valor em risco** (`riskPerTrade × caixa`, escala `entryRiskScale` da 007) e pelo
  stop de **2 × ATR** (Placar clássico; alvo **3 × ATR**), em `computePositionSize`, o ÚNICO dimensionamento do produto:
  perda no stop sem lacuna < valor em risco.
- **Cada ida e volta custa cerca de 0,30%** (taxa 0,1% + deslizamento 0,05% por lado; `computeRoundTripCostRate` da spec 013).
  Uma venda parcial a **+3% bruto** rende **≈ +2,70%** depois do custo; a +5%, ≈ +4,70%; a +10%, ≈ +9,70%.

Nada disso aceita "várias compras" nem "várias vendas" da mesma posição. Escada exige um modelo novo de posição.

## 2. Objetivo

Uma **escada opcional**, configurada na estratégia, que vale igual em backtest, walk-forward e simulação ao vivo:

> **Compra 1/3 a 12,458 · 2/3 se cair −2% (12,208) · 3/3 se cair −3% (12,084)**
> **Vende 1/3 a +3% (≈ +2,70% depois do custo) · 1/3 a +5% (≈ +4,70%) · 1/3 a +10% (≈ +9,70%)**
> **Proteção (stop) única para a posição inteira: 12,034.** Se todas as compras acontecerem e o preço bater a proteção, a
> perda é no máximo o valor em risco que você escolheu (1% do saldo = 100 USDT), sem contar lacuna de preço.

(Números do exemplo: LINK/USDT, tick 0,001, saldo 10.000 USDT, ATR de 15 min ≈ 0,2% do preço; o preço de cada degrau é
arredondado **para baixo** no tick e o de cada venda **para cima**, por isso 12,208 e não 12,209.)

E sempre, ao lado da configuração, a frase honesta: *"A escada muda **como** você entra e sai: preço médio menor se cair,
lucro realizado aos poucos se subir. **Ela não cria vantagem.** Comprar mais quando cai aumenta o quanto você tem em jogo; a
proteção única e o valor em risco total impedem que a perda máxima cresça."*

Tudo é **simulado localmente**: dinheiro fictício, nenhuma ordem real, nada é recomendação.

## 3. Requisitos funcionais

- **RF01 — A configuração (`ladder-1`).** A estratégia ganha o campo opcional `ladder` (D1-A):
  `ladder: { entries: [{ dropRate, weight }], exits: [{ gainRate, weight }], runnerWeight, maxEntryCandles,
  stopAfterFirstExit }`. `dropRate`/`gainRate` em texto decimal; **`weight` inteiro** (1 a 100): a fração de cada parte é
  `weight ÷ soma dos pesos`, então "1/3" é exato (com frações em texto, três vezes `0,33333333` não somam 1).
  - `entries`: 1 a 5 degraus; o 1º tem `dropRate = '0'` (a compra que o sinal pediu); `dropRate` estritamente crescente,
    `0 ≤ dropRate ≤ 0,5`, no máximo 8 casas; as frações das compras somam exatamente 1 (todo o tamanho planejado).
  - `exits`: 0 a 5 parcelas; `gainRate` estritamente crescente, `0 < gainRate ≤ 1` (até +100%), no máximo 8 casas;
    `runnerWeight` (inteiro 0 a 100, padrão ausente = 0) é a parte que **não** tem alvo e sai por sinal, stop, comando ou
    lacuna. Sem `exits`, a posição inteira sai no alvo da estratégia (`targetAtrMultiple × ATR`) contado do preço médio.
  - `maxEntryCandles` (1 a 672 velas; obrigatório com mais de um degrau): validade dos degraus de compra.
  - `stopAfterFirstExit`: `'keep'` (padrão, D4-A) ou `'break_even'`.
  - Ausente = comportamento antigo, **exato** (RF09). Recusa com `400` e todos os erros, sem eco do valor.
- **RF02 — Entrada em escada.** O sinal de compra em `t` decide a escada inteira (sem lookahead). O 1º degrau sai como a
  compra de hoje (a mercado na abertura de `t+1`, ou limitada se a estratégia usa limitada). No preenchimento do 1º degrau
  o motor fixa o plano: preço de cada degrau `L_k = tickDown(P_1 × (1 − dropRate_k))` (P_1 = preço do 1º preenchimento),
  quantidade de cada degrau (RF04) e a proteção única (RF05). Os degraus 2..n ficam **no livro** como compras limitadas
  e preenchem a `L_k` quando a mínima **cruza** `L_k` (tocar não basta), como a limitada de hoje. Caducam depois de
  `maxEntryCandles` velas ou são cancelados quando a 1ª venda acontece (D5-A), quando a posição fecha, por sinal de venda,
  por `halt`, por `exit_position` ou por lacuna.
- **RF03 — Saída em escada.** Cada parcela `j` é uma venda limitada no livro a
  `alvo_j = tickUp(preço médio × (1 + gainRate_j))`; preenche a `alvo_j` quando a máxima **passa** do alvo (como o alvo de
  hoje). Quantidade: `stepDown(quantidade comprada × fração_j)`; a última parcela com alvo, quando não há `runnerWeight`,
  vende **todo o restante** (sem sobra de arredondamento). Parcela abaixo do mínimo da corretora (`minNotional`) junta-se à
  seguinte. Os alvos só mudam no **fechamento** da vela (preço médio novo vale de `t+1` em diante).
- **RF04 — Quantidade e risco total.** Um único orçamento de risco por posição: `R = moneyDown(caixa × riskPerTrade ×
  escala)` (a escala da 007 entra uma vez, na decisão). A quantidade planejada `Q` é a maior que, **se todos os degraus
  preencherem e a proteção for atingida sem lacuna**, perde menos que `R` com as taxas das duas pontas e o deslizamento de
  saída: `Σ q_k × [L_k × (1 + f) − X × (1 − f)] < R`, com `X` = saída no stop (`stopExitPrice`). Cada `q_k =
  stepDown(Q × fração_k)`, limitado pelo caixa (todos os degraus têm de caber no caixa do momento do plano), por
  `maxExposureRate` e pela participação no volume do candle de DECISÃO `t` (a mesma regra de hoje, por degrau). Mora em
  `packages/strategy-engine/src/risk/` ao lado de `computePositionSize` e reaproveita as mesmas peças; **escada de um
  degrau só e sem parcelas = `computePositionSize` exato** (prova por diferencial). Degrau abaixo de `minNotional` recusa a
  entrada inteira com o motivo já existente `below_min_notional`.
- **RF05 — Proteção única e "nunca aumentar a perda máxima".** O stop vale para a posição inteira e é o de
  `computeProtectivePrices` aplicado ao degrau MAIS FUNDO (`L_n` − `stopAtrMultiple × ATR(t)`, com deslizamento e tick como
  hoje): todo degrau fica acima da proteção por construção. Regras fixas: (1) a quantidade de cada degrau é fixada no plano
  e nunca cresce; (2) nenhum degrau é acrescentado depois do plano (nada de "dobrar a aposta" depois de perder); (3) a
  proteção nunca desce (só sobe, no `break_even`); (4) com posição aberta, sinal de compra novo não faz nada; (5) no máximo
  5 degraus e 5 parcelas. Propriedade provada: perda realizada de qualquer posição sem lacuna < `R`.
- **RF06 — Ordem dos acontecimentos dentro da vela** (pior caso para o usuário quando o caminho dentro da vela é
  desconhecido; o detalhe está no plan D3): ordens a mercado na abertura → lacuna para baixo (degraus com `L_k ≥` abertura
  preenchem a `L_k`, depois a posição inteira sai na proteção) → lacuna para cima (parcelas com alvo abaixo da abertura saem
  ao preço do alvo) → degraus cruzados pela mínima → proteção pela mínima (inclui o que acabou de entrar; **proteção vence
  alvo** na mesma vela, como hoje) → parcelas pela máxima, **só se nenhum degrau preencheu no meio desta vela** (a máxima
  pode ter vindo antes) → no fechamento: preço médio, alvos, proteção, validade dos degraus, comandos e sinal.
- **RF07 — Taxas por parte.** Cada compra e cada venda paga a sua taxa sobre o próprio valor (`tradeFee`, `buyDebit`,
  `sellCredit` como hoje). O lucro da posição = soma do que entrou com as vendas − soma do que saiu com as compras, exato.
  A tela mostra, por parcela, o **% bruto** e o **% depois do custo** (bruto − `computeRoundTripCostRate`, arredondado para
  BAIXO), e avisa quando uma parcela não paga o custo.
- **RF08 — Registro.** Cada degrau é uma ordem `limit`/`entry` (`created` no plano, depois `filled`, `expired` ou
  `cancelled`); cada parcela é uma ordem `target`/`exit` (`created` + `filled` na vela, como o alvo de hoje); cada
  preenchimento é uma linha de `fills`. A posição é UMA linha de `positions` (preço médio, quantidade comprada, taxas
  somadas, preço médio de saída, lucro total, motivo da última saída). Cancelamento de degrau pela 1ª venda ou pelo fim da
  posição ganha motivo próprio (D3-A: `ladder_exit_started`, `position_closed`; migration aditiva do `CHECK`). Tudo aparece
  no `/log.csv`, no histórico de ordens e na exportação LGPD sem código novo.
- **RF09 — Sem escada, nada muda.** Estratégia sem `ladder` = bytes idênticos: `configHash`, estado do motor, decisões,
  dourado `engine-2`, dourado `analyst-1`, `runHash` do exemplo e preenchimentos dos conjuntos reais. Simulações em
  andamento e versões existentes **não são tocadas**.
- **RF10 — Paridade.** A escada mora no motor (`walletStep`): backtest, walk-forward (por janela) e simulação ao vivo usam o
  MESMO código. Prova: paridade backtest × ao vivo nos conjuntos reais com uma estratégia em escada e o walk-forward por
  janela contra o motor completo.
- **RF11 — Lucro mínimo (spec 013) e analista (spec 007).** Com `exits`, o "ganho possível" da regra `minimum-profit-1` é a
  **1ª parcela** (`gainRate_1`, a menor): a compra só sai se `gainRate_1 ≥ mínimo + custo` (comparação exata, sem ATR). Sem
  `exits`, a MP2 da 013 fica como está. A escala do analista (A21) dimensiona o plano inteiro na vela da decisão; pausas
  depois **não** cancelam degraus já planejados (D9-A; a escala só vale para a entrada nova). Avisos na criação:
  `ladder_exit_below_cost` (alguma parcela com `gainRate ≤ custo`) e `ladder_exit_below_minimum_profit`.
- **RF12 — API.** `GET /v1/runs/:runId/ladder` (novo, política `RUN_LIVE_STATUS`): a escada da posição aberta (ou da última
  fechada) com, por degrau e parcela: fração ("1/3"), `dropRate`/`gainRate`, preço, quantidade em moeda, valor em USDT, % da
  posição, estado (`pending`, `filled`, `cancelled`, `expired`) e, por parcela, o % depois do custo; mais preço médio,
  quantidade restante, lucro realizado e a proteção. Frases fechadas do servidor (catálogo `ladder-messages.ts`, sem data
  nem hora). Nada recalcula o motor por pedido: degraus de `orders`, preenchimentos de `fills`, a posição de `positions` e os
  alvos pela MESMA função pura do motor (`computeLadderLevels`) a partir da configuração da versão. `GET /v1/strategies*`
  devolve o `ladder`; `PUT`/`POST` o aceitam e validam.
- **RF13 — Painel: configurar.** No editor de estratégia, bloco **"Compras e vendas em partes"** (desligado por padrão,
  D7-A) com dois modelos prontos para escolher ("3 compras na queda", "3 vendas na subida") e as linhas editáveis
  (degrau: "se cair −2%" + peso; parcela: "a +3%" + peso), a prévia em frases com um preço de exemplo e o aviso de custo
  por parcela. Porcentagem vira fração no TEXTO (`percentToFraction`), nunca `Number`.
- **RF14 — Painel: mostrar.** Na ficha do sinal e nas plaquinhas da spec 014 (régua com os degraus e as parcelas; "Operar à
  mão" com a quantidade de cada ordem, D12-A da 014 para "Meu saldo"), no quadro de avisos do escritório da 011 (E-RF13:
  "▲ Compra 1/3 a 12,458 · escada de 3") e no gráfico da 009 (camada "Níveis": linha tracejada por degrau pendente e por
  parcela, etiqueta "Compra 2/3 · 12,208 · 135,23 LINK"; preenchidos viram marcadores). O texto vem do servidor; o painel só
  formata dinheiro com `BigInt`. Mexe em arquivos da 011, da 014 e da 009 **só com elas fechadas** (tasks.md).
- **RF15 — Plano de operação.** `computePlanLevels`/`computeHoldingLevels` (T4b.5) passam a mostrar os degraus e as parcelas
  da estratégia em escada (D8-A), pela mesma `computeLadderLevels`. Metas e prazos já passam pelo `walletStep` e herdam a
  escada sem código novo.
- **RF16 — Medição honesta antes de qualquer padrão.** A T0.3 mede, em memória e só com `SELECT` no banco de dev, posição
  única × escada (vários desenhos) nos 4 pares × 15 min e 1 h × 183 dias, com taxas, e grava em `evidence.md` o resultado
  líquido, a maior queda (pelo vale), as operações e os preenchimentos, **sem esconder se a escada piorar**.

## 4. Requisitos não funcionais

- **RNF01 — Sem lookahead.** O plano nasce da decisão em `t` (ATR e volume de `t`) e do preço do 1º preenchimento em `t+1`;
  todo preço posterior vem de ordem que já estava no livro. Alvos recalculados só valem na vela seguinte. Os cortes
  `no-lookahead` e `resume` do harness rodam com escada.
- **RNF02 — Hashes e versões.** `configHash` muda **só** para estratégia com `ladder` (`exactOptional`, sem `.default`; o
  `STRATEGY_CONFIG_SCHEMA_VERSION` não muda). `runHash` não muda. O estado ganha a chave opcional `wallet.ladder`, presente
  só com escada; as decisões ganham a lista opcional `positionUpdates`, presente só quando não vazia. **Sem `ENGINE_VERSION`
  novo** se o dourado `engine-2` ficar idêntico (precedente A21 e MP7; D2-A, validado pelo arquiteto na T0.1).
- **RNF03 — Motor.** Mudar o motor **exige autorização explícita do usuário** (§9, itens 1 e 2). Harness de 21 verificações
  com escada, oráculo `bigint` independente (sem importar `src`), diferencial ≥ 3.000 fluxos, propriedades e mutantes.
  Aritmética só em `src/money.ts`/`EngineDecimal`; decimal nunca no estado (só texto). ≤ 40 linhas por função, ≤ 200 por
  arquivo (lint).
- **RNF04 — Migration** (aditiva, com `.rollback.sql`, **para e pergunta antes**): `orders_reason_check` com os dois
  motivos novos (`NOT VALID` + `VALIDATE`; o rollback ABORTA se houver linha com eles). Número livre na hora (hoje a última é
  `0025`; a 013 e a 007 podem criar outras antes).
- **RNF05 — Banco sem tabela nova.** Pernas da posição = `fills`; degraus = `orders`. A linha de `positions` passa a ser
  atualizada enquanto aberta de forma MONOTÔNICA (quantidade comprada só cresce; proteção só sobe), sem migration.
- **RNF06 — Reversão segura.** Estratégia e estado são `strictObject`: código antigo recusa `ladder`. Deploy: banco → worker
  (dormente sem escada) → API (aceita `ladder`) → painel. Reversão: painel → API (recusa) → encerrar as execuções com escada
  (ao vivo, fila e checkpoint) → worker → banco.
- **RNF07 — Dinheiro.** Texto decimal na API; `BigInt` escala 8 no painel; preço de compra para baixo, de venda para cima,
  quantidade para baixo, lucro e % depois do custo para baixo, custo para cima (contra o usuário).
- **RNF08 — Contrato e isolamento.** Rota com `access` e `documentation`; `400` com todos os erros sem eco; alheio,
  inexistente e malformado = o MESMO `404`; `409 RUN_NOT_LIVE` não se aplica (a rota vale para qualquer tipo); contrato
  negativo entre usuários; filtro de dono em `make api-runs-mutants`.
- **RNF09 — Linguagem.** Nenhuma frase diz "lucro garantido", "vai subir", "recupera a perda" ou "recomendamos". Toda tela
  da escada traz "não cria vantagem" e "comprar mais na queda aumenta o quanto você tem em jogo".
- **RNF10 — Painel.** 375 px sem rolagem horizontal, contraste ≥ 4,5:1 (texto) e 3:1 (linhas do gráfico) nos dois temas,
  foco visível, alvo de 44 px, nunca só cor, `prefers-reduced-motion`.

## 5. Decisões tomadas por padrão (o usuário pode mudar — ver §9)

| # | Decisão | Por quê | Alternativa |
|---|---|---|---|
| D1 | **A escada mora na estratégia** (`StrategyConfig.ladder`, opcional) — **muda o motor, exige autorização** | A forma de entrar e sair já é da estratégia (`entry.orderType`, `offsetRate`, `stopAtrMultiple`, `targetAtrMultiple`): a escada é da mesma família. Todo leitor da estratégia (plano, metas, prazos, "O que falta", ficha da 014) a vê sem caminho paralelo; comparar com e sem escada = "Duplicar" a estratégia (já existe). Fora do catálogo do walk-forward (nada de otimizar degrau no histórico) | **B:** `RunParameters.ladder` (como o lucro mínimo da 013): a mesma estratégia com e sem escada sem versão nova, mas plano, metas e prazos (que montam o próprio `RunParameters`) ficariam sem ela — duas verdades. **C:** entrada por passo, como `entryRiskScale`: **inviável**, a escada precisa lembrar degraus e parcelas entre velas (estado), e a A21 proíbe a escala de passar ao passo seguinte |
| D2 | **Sem versão nova do motor**: chave opcional no estado (`wallet.ladder`) e nas decisões (`positionUpdates`), presentes só com escada | Precedente A21/MP7: `ENGINE_VERSION` novo falharia TODA simulação em andamento (`ENGINE_VERSION_MISMATCH`) e todo checkpoint; sem escada o comportamento é o antigo exato, provado pelo dourado `engine-2` idêntico | **B:** `engine-3` (dourado regravado; simulações em andamento e checkpoints falham e precisam ser recriados) |
| D3 | **Motivos próprios** para o cancelamento de degrau (`ladder_exit_started`, `position_closed`) — **migration aditiva, exige autorização** | "Toda decisão fica registrada"; o CSV e a tela dizem por que o degrau não comprou | **B:** cancelamento com motivo nulo (sem migration; a tela deduz pela posição) |
| D4 | **Proteção fixa** depois da 1ª venda (`stopAfterFirstExit: 'keep'`); `'break_even'` disponível e medido | Proteção no empate em 15 min fica a ~0,3% do preço e sai no ruído; o efeito é medido na T0.3 antes de qualquer recomendação | **B:** `break_even` como padrão |
| D5 | **Começou a vender, para de comprar**: a 1ª parcela vendida cancela os degraus de compra pendentes | Comprar de novo depois de realizar lucro mistura duas operações numa e torna o preço médio e o risco difíceis de explicar | **B:** degraus continuam valendo até a validade |
| D6 | **% da venda é bruto sobre o preço médio**, com o "≈ % depois do custo" ao lado | É o número que a pessoa digita e confere no gráfico; o custo aparece sempre ao lado | **B:** a pessoa digita o % líquido e o motor soma o custo |
| D7 | **Nenhuma escada pré-preenchida**: o bloco nasce desligado, com dois modelos para escolher | A escada não cria vantagem (§7); ligar por padrão seria recomendar | **B:** modelos pré-preenchidos em estratégia nova |
| D8 | **Plano de operação mostra a escada** nesta spec (mesma função pura) | Plano com alvo único para uma estratégia em escada seria uma tela mentindo | **B:** o plano mostra só "esta estratégia usa escada; veja a ficha" |
| D9 | **Pausa do analista não cancela degraus** já planejados (A21: a escala é só da entrada nova) | Mudar isso exige comando novo no motor; a proteção única limita o risco | **B:** pausa do analista cancela degraus (comando novo, outra mudança de motor) |

## 6. Fora do escopo

- Qualquer ordem real, chave de corretora ou modo `live` (spec 002). Tudo aqui é simulado.
- Proteção móvel que acompanha o preço (trailing stop), venda a descoberto, mais de uma posição por carteira, pirâmide de
  compra na alta.
- Otimizar degraus e parcelas pelo walk-forward (fora do catálogo ajustável).
- Mudar o texto do alerta do Telegram (o alerta da compra continua um por sinal; degrau preenchido não gera alerta novo).
- Mudar `analyst-1`, `minimum-profit-1`, as metas e os prazos além de herdarem a escada pelo motor.

## 7. Efeito esperado — honesto (estimativa; a medição de verdade é a T0.3)

**O que os dados reais já dizem.** Na T0.2 da spec 013 (183 dias, 2026-04-16 a 2026-10-16, saldo 10.000 USDT, custo 0,30%),
a estratégia sozinha **perdeu em todas as combinações**: em 15 min, −46,97% a −86,79% (LINK, BNB, BTC, ETH; Placar clássico e
Reversão; 483 a 682 operações; 3,2 a 6,1 mil USDT de taxas); em 1 h, −13,81% a −28,25%.

**Por que a escada não muda isso** (em palavras simples): se ninguém sabe para onde o preço vai, **nenhuma regra de quando
comprar ou vender em partes** muda o resultado esperado **antes** das taxas (é o "teorema da parada opcional" da
probabilidade); depois das taxas ele continua negativo. A escada só troca o **formato** do resultado:

- **Compras em cascata:** se cair, o preço médio fica menor e uma alta menor já devolve o dinheiro; mas você só compra mais
  justamente quando o preço vai contra você, e a posição maior é a que mais perde se a queda continuar até a proteção.
- **Vendas em partes:** você garante parte do ganho cedo e deixa o resto correr; troca "às vezes ganha tudo" por "ganha um
  pouco mais vezes e menos de cada vez".

**Estimativas de conta (NÃO medidas; refeitas exatas na T0.2/T0.3):**

| Situação | Hoje (posição única) | Com a escada "0 / −2% / −3%" (1/3 cada) |
|---|---|---|
| Valor em jogo por operação, LINK 15 min, risco 1% = 100 USDT | ≈ 10.000 USDT (o stop de 2 × ATR fica a ~0,4% e o tamanho bate no teto do caixa) | 1º degrau ≈ 1.685 USDT; tudo preenchido ≈ 4.970 USDT (proteção a ~3,4% do 1º preço) |
| Perda máxima sem lacuna | < 100 USDT | < 100 USDT (o mesmo orçamento, somando os 3 degraus) |
| Só vendas em partes (+3/+5/+10%, entrada única): chance de cada venda antes da proteção, 15 min, sem tendência | — | proteção de hoje a ~0,4%: +3% ≈ 12% · +10% ≈ 4% — **quase nunca** |
| A mesma chance em 1 h (ATR ≈ 0,8%, proteção a ~1,6%) | — | +3% ≈ 35% · +5% ≈ 24% · +10% ≈ 14% |
| Compras e vendas juntas, 15 min (proteção a ~3,4% do 1º preço) | — | +3% ≈ 53% antes da proteção — mas, quando a proteção vem, ela leva o orçamento inteiro de 100 USDT |

**Leitura honesta:** (1) em 15 min, alvos de +3%, +5% e +10% são muitas vezes maiores que o movimento típico, então as vendas
em partes quase nunca acontecem e a operação termina pelo sinal ou pela proteção; o pedido faz mais sentido em 1 h ou mais.
(2) A escada reduz muito o **tamanho** de cada operação (a proteção fica longe), e menos tamanho = menos taxa = menos perda;
isso **não é mérito da escada**: a T0.3 mede um controle "posição única com a mesma proteção larga" para separar os dois
efeitos. (3) Se a T0.3 mostrar a escada pior que a posição única, isso vai para a tela e para `evidence.md`, e nenhum padrão
é ligado.

## 8. Critérios de aceite

1. Sem `ladder`, tudo idêntico byte a byte: dourado `engine-2`, dourado `analyst-1`, `configHash`/`runHash` do exemplo,
   estado e preenchimentos dos conjuntos reais.
2. Escada de um degrau sem parcelas ≡ comportamento de hoje (diferencial ≥ 3.000 fluxos contra o motor sem escada).
3. Diferencial contra o oráculo `bigint` independente em ≥ 3.000 fluxos com escada (caixa, preço médio, quantidade por
   degrau e parcela, lucro, patrimônio, ordem dos acontecimentos na vela); harness de 21 verificações com escada.
4. Propriedades (2.000 séries): perda sem lacuna < `R`; Σ quantidades compradas ≤ planejado; proteção nunca desce; nenhum
   degrau depois da 1ª venda; quantidade vendida = comprada ao fechar; nenhum preenchimento com preço fora da vela.
5. Paridade backtest × ao vivo e walk-forward por janela com escada, nos conjuntos reais.
6. `GET /v1/runs/:runId/ladder` com os números certos (frações, preços no tick, quantidades para baixo, % depois do custo
   para baixo), `404` entre usuários, `400` sem eco, ≤ 4 consultas por pedido.
7. Painel: configurar, prévia em frases, ficha, quadro e gráfico com os degraus; 375 px; contraste; "não cria vantagem".
8. T0.3 em `evidence.md` (4 pares × 15 min e 1 h × 183 dias × os desenhos do plan D8), com o controle de tamanho.
9. Mutantes da escada todos mortos (≥ 20).

## 9. Decisões que o usuário precisa tomar (A = recomendado)

1. **Onde a escada mora (D1):** A) na estratégia — editar cria versão nova; para comparar, duplique a estratégia — **muda o
   motor, exige autorização** · B) na execução (`RunParameters`), como o lucro mínimo — **também muda o motor**; plano,
   metas e prazos não a veriam. *(C, por passo, é inviável: a escada precisa de memória entre velas.)* *Sem resposta: a
   execução faz só a Fase 0 (contrato, oráculo e medição) e para antes de tocar no motor.*
2. **Versão do motor (D2):** A) sem versão nova, campo opcional no estado (simulações em andamento seguem) · B) versão nova
   `engine-3` (simulações em andamento e checkpoints precisam ser recriados). *Sem resposta: A, se o arquiteto confirmar na
   T0.1 que o dourado fica idêntico; senão, para e pergunta.*
3. **Registro do degrau cancelado (D3):** A) motivos próprios (`ladder_exit_started`, `position_closed`) — **migration
   aditiva, exige autorização** · B) motivo vazio, sem migration. *Sem resposta: a execução para na T2.1 e pergunta.*
4. **Proteção depois da 1ª venda (D4):** A) fica onde está (empate disponível como opção) · B) sobe para o empate. *Sem
   resposta: A; a T0.3 mede as duas.*
5. **Degraus de compra depois da 1ª venda (D5):** A) cancelados · B) continuam até a validade. *Sem resposta: A.*
6. **O % da venda (D6):** A) bruto sobre o preço médio, com o líquido ao lado · B) você digita o líquido. *Sem resposta: A.*
7. **Padrão no painel (D7):** A) desligado, com dois modelos para escolher · B) modelos já preenchidos. *Sem resposta: A —
   e B só se a T0.3 mostrar a escada melhor que a posição única E que o controle de tamanho em pelo menos 6 de 8
   combinações.*
8. **Plano de operação (D8):** A) mostra degraus e parcelas nesta spec · B) só um aviso. *Sem resposta: A.*
9. **Analista (D9):** A) pausa do analista não cancela degraus já planejados · B) cancela (outra mudança no motor). *Sem
   resposta: A.*
