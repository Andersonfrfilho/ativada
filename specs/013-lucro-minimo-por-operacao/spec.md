# Spec 013 — Lucro mínimo por operação (não abrir operação que não paga as taxas com folga)

## 1. Problema

Em 2026-10-16 o usuário (leigo) pediu: "add uma regra de evitar de fazer transações que não dê lucro com porcentagens
baixas". Ou seja: **não abrir uma operação cujo ganho possível, depois das taxas, é pequeno demais.**

O que os números da casa já dizem (e que esta spec não pode esconder):

- **Cada ida e volta custa cerca de 0,30% do valor.** Taxa padrão 0,1% + deslizamento (slippage) 0,05% **por lado**
  (`RunParameters`: `feeRate` 0,001, `slippageRate` 0,0005) = 2 × 0,15% = **0,30%** por compra + venda.
- **Em velas de 15 min o custo come o movimento.** Na medição da spec 007 (T2.4, `specs/007-analista-de-risco-senior/evidence.md`,
  183 dias de 15 min, 2026-04-16 a 2026-10-16, saldo 10.000 USDT) a estratégia **sozinha** perdeu **47% a 87%** do saldo em
  LINK, BNB, BTC e ETH, com **483 a 683 operações** e **3,2 a 6,1 mil USDT de taxas**. O analista da 007 só reduziu isso
  (−1,5% a −14,3%) porque a trava `move_cost` deixou a porta fechada em 94% a 99% das velas.
- **A trava `move_cost` só existe para quem liga o analista** (spec 007, simulação ao vivo com `runs.request.analyst`). Um
  backtest, um walk-forward ou uma simulação ao vivo sem o analista continuam abrindo toda operação que o placar pede,
  por menor que seja o alvo.
- **O alvo da estratégia já é conhecido na entrada.** O motor guarda, na ordem de compra, `targetDistance =
  targetAtrMultiple × ATR(t)` (`wallet/entry-order.ts`; Placar clássico: alvo 3 × ATR 14, stop 2 × ATR). Então dá para
  saber, ANTES de comprar, quanto a operação ganha se der certo, e comparar com o custo.

## 2. Objetivo

Uma **regra geral e visível**, para backtest, walk-forward e simulação ao vivo (com ou sem o analista):

> **Lucro mínimo por operação: 0,6%.** A simulação só compra quando o ganho possível até o alvo, **descontada a ida e
> volta das taxas (0,30%)**, é de pelo menos 0,6%. Se não for, ela **espera** e diz por quê.

Na tela de decisões (spec 008) aparece, numa vela em que o placar pediu compra e a regra barrou:

> **Esperou:** o ganho possível até o alvo (0,66%) não paga o custo de ida e volta (0,30%) mais o lucro mínimo que você
> pediu (0,60%).

E, sempre ao lado do campo, a frase honesta: *"Isso evita operações que quase só pagam taxa. **Não garante lucro**: o
alvo é o melhor caso, e o preço pode bater o stop antes."*

Tudo é **simulado localmente**: dinheiro fictício, nenhuma ordem real, nada é recomendação.

## 3. Requisitos funcionais

- **RF01 — A regra (`minimum-profit-1`).** Na **entrada** (fechamento da vela `t`, quando o placar pede compra e a carteira
  está livre), com números que o motor já tem em `t`:
  - `ganho bruto no alvo` = `targetAtrMultiple × ATR(t) ÷ fechamento(t)`;
  - `custo de ida e volta` = `2 × (feeRate + slippageRate)` (os `RunParameters` da execução);
  - `ganho líquido no alvo` = bruto − custo;
  - **compra só se** `ganho líquido no alvo ≥ minimumNetTargetRate` (igual passa). Conta exata em decimal (`EngineDecimal`),
    nenhum float fora do ATR (que já é float de indicador e entra pela mesma conversão `decimalFromIndicator` da ordem).
- **RF02 — A saída nunca é bloqueada.** A regra só existe para a ENTRADA NOVA: não mexe em ordem pendente, posição aberta,
  stop, alvo, venda por sinal, `exit_position`, `halt`, meta, parada do usuário nem lacuna.
- **RF03 — Campo opcional; ausente = comportamento antigo, exato.** O valor mora em `RunParameters.minimumNetTargetRate`
  (D1-A; texto decimal, de `0` a `0,1` — 0% a 10% —, no máximo 8 casas). Sem o campo, o motor faz exatamente o que fazia: o
  dourado `engine-2` fica idêntico byte a byte e o `runHash` de toda execução existente não muda. Simulações em andamento e
  versões de estratégia existentes **não são tocadas**.
- **RF04 — Registro.** Compra barrada vira **ordem recusada** com o motivo novo `below_minimum_profit` (`ORDER_EVENT_REASON`
  do motor, a cópia em `run-result.constant.ts` e o `CHECK` de `orders.reason` — migration aditiva, D3-A). Aparece no
  registro em CSV (`/log.csv`) e no histórico de ordens, como hoje as recusas `zero_atr` e `below_min_notional`.
- **RF05 — Paridade.** A regra mora no motor (`placeEntry`), então backtest, walk-forward (por janela) e simulação ao vivo
  usam o MESMO código (`advanceCandle` e `walletStep`). Prova: paridade backtest × ao vivo nos conjuntos reais com o campo
  ligado e o walk-forward por janela contra o motor completo.
- **RF06 — Analista (spec 007).** A trava `move_cost` do analista **continua como está** (`analyst-1` intacto; D4-A). As duas
  se compõem sem duplicar lógica: o analista decide a escala da entrada (`entryRiskScale`, A21) e, se ela não for `'0'`, a
  regra do lucro mínimo confere o alvo. O cálculo do custo de ida e volta passa a ter UM lugar (`computeRoundTripCostRate`
  no motor); o analista o importa depois que a spec 007 fechar (T4.2), com o dourado `analyst-1` idêntico.
- **RF07 — API.** `POST /v1/runs` aceita `runParameters.minimumNetTargetRate` (backtest, walk-forward e `live_paper`); `GET
  /v1/runs/:id` devolve o valor (ou ausente) e `minimumProfit: { skippedEntries }` (quantas compras a regra barrou, contadas
  em `orders`); a decisão da vela barrada em `GET /v1/runs/:runId/live-status` e `/decisions` sai com o desfecho novo
  `waited_minimum_profit` e a **frase fechada do servidor** (catálogo `decision-messages`), com X = ganho bruto no alvo
  (para BAIXO, 2 casas), Y = custo (para CIMA) e Z = o mínimo pedido. X é recalculado pela MESMA função pura do motor
  (`computeEntryProfitEdge`) a partir do ATR gravado no sinal, do fechamento da vela e da versão da estratégia: nada é
  recalculado pelo motor por pedido.
- **RF08 — Aviso na criação.** `warnRunParameters` ganha dois avisos: `minimum_profit_below_cost` (mínimo menor que o custo
  de ida e volta: "com esse mínimo, uma operação no alvo ainda pode deixar mais da metade do ganho em taxas") e
  `no_minimum_profit_short_candle` (vela de 15 min sem lucro mínimo).
- **RF09 — Painel: o campo.** No formulário de backtest (T5.3 da spec 001) e na criação da simulação ao vivo (spec 006,
  junto do `SimulationTimeframePicker`): campo **"Lucro mínimo por operação"** em %, pré-preenchido com **0,6** (D2-A), com
  caixa "Usar lucro mínimo" (desmarcada = campo ausente) e a explicação leiga:
  > *"Cada compra e venda custa cerca de **0,30%** em taxas e deslizamento (com as taxas desta simulação). A simulação só
  > compra quando o alvo da operação paga esse custo **e** ainda sobra pelo menos este lucro. Evita operações que quase só
  > pagam taxa. **Não garante lucro**: o alvo é o melhor caso, e o preço pode bater o stop antes."*
  O 0,30% é calculado no painel a partir de `feeRate` e `slippageRate` do formulário (`BigInt` escala 8, para CIMA), e a
  porcentagem vira fração movendo a vírgula no TEXTO (`percentToFraction`), nunca `Number`.
- **RF10 — Painel: o resultado.** No detalhe da execução: "Lucro mínimo por operação: 0,6%" (ou "não usado") e "Compras que
  a regra barrou: N". Na tabela de decisões (spec 008) a linha "Esperou" com a frase do servidor (RF07). Termo novo no
  glossário: **lucro mínimo por operação** (uma linha, sem promessa).
- **RF11 — Medição honesta antes de ligar por padrão.** A T0.2 roda a medição de 183 dias dos 4 pares × 2 estratégias
  (o mesmo recorte da 007) sem filtro e com 0,3%, 0,6% e 1,0%, e grava em `evidence.md` operações, taxas, líquido e maior
  queda; o padrão do painel (D2) só vale depois disso.

## 4. Requisitos não funcionais

- **RNF01 — Só tira operação.** A regra nunca cria compra, nunca aumenta tamanho, nunca bloqueia saída.
- **RNF02 — Sem lookahead.** Tudo vem da vela `t` (ATR e fechamento de `t`); a compra, se liberada, sai na abertura de `t+1`
  como hoje. O teste de corte (`no-lookahead`, `resume`) do harness roda com o campo ligado.
- **RNF03 — Hashes.** `configHash` não muda (o campo não é da estratégia). `runHash` muda **só** para execução que traz o
  campo (é outra execução, como trocar a taxa). Hash-dourado literal prova que o `runHash` de `classic-scoreboard.run.json`
  ficou igual.
- **RNF04 — Motor.** Sem estado novo e, pelo precedente A21, **sem `ENGINE_VERSION` novo** se o dourado `engine-2` ficar
  idêntico (a T0.1 confirma com o arquiteto). Harness de 21 verificações com o campo ligado, diferencial contra oráculo
  independente, propriedades e mutantes. **Mudar o motor exige autorização explícita do usuário** (§9, item 1).
- **RNF05 — Migration** (aditiva, com `.rollback.sql`, **para e pergunta antes**): recriar o `CHECK` `orders_reason_check`
  com `below_minimum_profit` (`NOT VALID` + `VALIDATE`; o rollback ABORTA se houver linha com esse motivo, nunca apaga
  trilha). Número livre na hora (hoje a última é `0025_run_commands_analyst`).
- **RNF06 — Reversão segura.** O esquema de `RunParameters` é `strictObject`: código antigo recusa o campo novo. Ordem de
  deploy: banco → worker → API (aceita o campo) → painel. Reversão: painel → API (recusa o campo) → encerrar as execuções
  com o campo → worker → banco.
- **RNF07 — Dinheiro e porcentagem.** Texto decimal na API; `BigInt` escala 8 no painel; X para baixo, custo e mínimo
  para cima (contra o usuário, spec 008 RNF04).
- **RNF08 — Contrato e isolamento.** Rotas com `access` e `documentation`; `400` com todos os erros e sem eco do valor;
  alheio/inexistente/malformado = o mesmo `404`; contrato negativo entre usuários para o campo novo em `GET /v1/runs/:id`.
- **RNF09 — Linguagem.** Nenhuma frase diz "lucro garantido", "vai subir" ou "recomendamos". Toda menção ao campo traz
  "não garante lucro".
- **RNF10 — Painel.** 375 px sem rolagem horizontal, contraste ≥ 4,5:1, dois temas, foco visível, alvo de 44 px, nunca só
  cor, ≤ 40 linhas por função e ≤ 200 por arquivo.

## 5. Decisões tomadas por padrão (o usuário pode mudar — ver §9)

| # | Decisão | Por quê | Alternativa |
|---|---|---|---|
| D1 | **Onde mora: `RunParameters.minimumNetTargetRate` + checagem dentro do `placeEntry` do motor** — **muda o motor, exige autorização** | O custo que a regra compara (taxa + slippage) já é `RunParameters`: regra e custo ficam juntos, entram no `runHash`, valem igual em backtest, walk-forward e ao vivo, e a mesma estratégia pode ser simulada com e sem o mínimo sem criar versão nova | **B:** campo na estratégia (`risk.minimumNetTargetRate`, muda `configHash`; editar cria versão nova; o walk-forward poderia ajustá-lo). **C:** entrada por passo como o `entryRiskScale` (sem mudar o motor; ver plan D1) |
| D2 | **Padrão 0,6% pré-preenchido no painel** em toda execução nova (desligável); a API não impõe padrão (ausente = desligado) | 0,6% = o lucro no alvo é pelo menos **2× o custo** (as taxas levam no máximo ⅓ do ganho bruto no alvo; a spec 003 já chama de "não compensa" quando as taxas passam de 50%). Medido (§7): em 15 min corta ~72% das operações e ~70% das taxas; em 1 h e 1 d não barrou nenhuma | **B:** 0,3% (= o custo: taxas até 50% do bruto, a fronteira da spec 003; corta ~36% em 15 min). **C:** desligado por padrão |
| D3 | **Registrar como ordem recusada** com o motivo `below_minimum_profit` — **migration aditiva no `CHECK`, exige autorização** | "Toda decisão fica registrada" (regra do repo); a tela e o CSV leem a recusa sem adivinhar | **B:** em silêncio, como a escala `'0'` do analista (sem migration; a tela teria de deduzir a recusa pelo sinal sem ordem — frágil) |
| D4 | **A trava `move_cost` do analista fica como está** (`analyst-1` intacto); só o cálculo do custo vira um lugar único | O analista mede o movimento típico (ATR% ÷ custo ≥ 2); esta regra mede o alvo DESTA operação. Com alvo ≥ 1,5 × ATR e o custo padrão, a porta aberta do analista já implica ganho líquido ≥ 0,6% (plan D4): não há bloqueio em dobro, e mudar o analista exigiria `analyst-2` | **B:** `analyst-2` troca `move_cost` por esta regra (dourado do analista regravado) |
| D5 | **"Ganho possível" = o alvo** (melhor caso), não uma "esperança matemática" | O alvo é um número do motor, explicável numa frase. Uma esperança pediria a chance de acerto, e o auditor da 007 mostrou o placar **abaixo da moeda ao ar** em 8 de 8 pares/velas: qualquer chance que usássemos seria inventada | **B:** alvo × chance − stop × (1 − chance), com a chance do auditor (D4 da 007) |
| D6 | **Prazos (spec 003), metas e "O que falta para comprar" (spec 008) ficam como estão** nesta spec | São telas de outras specs com regra e dourado próprios; o filtro chega a elas por `RunParameters` quando elas passarem a usá-lo | **B:** incluir nesta spec a linha "com lucro mínimo" nos prazos de 15 min |

## 6. Fora do escopo

- Qualquer ordem real, chave de corretora ou modo `live` (spec 002). Tudo aqui é simulado.
- Mudar alvo, stop ou tamanho da operação (a regra só decide **se** compra).
- Mudar a regra `analyst-1` (D4-A), as metas, os prazos e o "O que falta para comprar" (D6-A).
- Otimizar o mínimo pelo walk-forward (ele é parâmetro da execução, fora do catálogo ajustável).
- Taxa por nível de volume ou com desconto de BNB (a taxa continua a do `RunParameters`).

## 7. Efeito esperado — com os dados que já temos (honesto)

**Medido em memória** pelo motor de produção (Placar clássico, saldo 10.000 USDT, taxa 0,1% + slippage 0,05% por lado),
com a regra simulada pelo `entryRiskScale: '0'` (A21) na vela em que a compra pedida não paga o mínimo
(`scripts/minimum-edge-estimate.ts`, sem banco; os três conjuntos reais de `test/fixtures/`):

| Conjunto | Mínimo | Velas com compra pedida | Barradas | Operações | Taxas pagas (USDT) | Patrimônio final | Resultado |
|---|---|---|---|---|---|---|---|
| BTCUSDT 15 min × 3.300 (~34 dias) | sem regra | 879 | 0 | 123 | 2.079,65 | 6.987,99 | −30,12% |
| | 0,3% | 879 | 372 | 79 (−36%) | 1.403,99 (−32%) | 8.023,35 | −19,77% |
| | **0,6%** | 879 | 693 | **35 (−72%)** | **623,84 (−70%)** | 9.036,72 | **−9,63%** |
| | 1,0% | 879 | 843 | 10 (−92%) | 163,12 (−92%) | 9.641,98 | −3,58% |
| BTCUSDT 1 h × 500 (~21 dias) | sem regra / 0,3% / 0,6% | 113 | 0 | 13 | 153,14 | 9.557,83 | −4,42% |
| | 1,0% | 113 | 10 | 12 | 134,57 | 9.651,64 | −3,48% |
| ETHUSDT 1 d × 400 | sem regra e todos os mínimos | 60 | 0 | 10 | 20,94 | 9.749,42 | −2,51% |

ATR em % do preço nas velas com compra pedida: BTC 15 min 0,087% / 0,216% / 0,362% (10º, 50º e 90º percentis); BTC 1 h
0,468% / 0,776% / 1,435%; ETH 1 d 3,9% / 4,6% / 5,1%. Com alvo de 3 × ATR, 0,6% exige ATR ≥ 0,3% do preço.

**O que isso quer dizer:**

1. **A regra só pega onde o custo come o movimento.** Em 15 min ela barra ~79% das compras pedidas e corta ~70% das taxas;
   em 1 h e 1 d, com 0,6%, **não barrou nenhuma** (lá o alvo típico, 3 × ATR, passa de 2%).
2. **Reduz o prejuízo, não cria lucro.** Em todos os casos medidos o resultado **continuou negativo**; não operar (0%)
   ainda foi melhor que todos. O filtro tira operações que quase só pagam taxa; não acerta o mercado.
3. **Estimativa para os 183 dias da 007 (extrapolação, NÃO medição):** se a proporção do BTC 15 min se repetir, as 483 a
   683 operações cairiam para ~135 a ~190 e as taxas de 3,2 a 6,1 mil USDT cairiam ~70% (~2,2 a ~4,3 mil USDT poupados por
   caso). LINK tem movimento maior (a porta do analista ficou aberta em ~5,7% das velas contra ~0,7% no BTC), então ali o
   corte deve ser menor. **A T0.2 mede isso de verdade** antes de o padrão D2 valer.
4. **Comparado ao analista:** a trava `move_cost` (ATR ≥ 0,6%) é mais dura que esta regra a 0,6% (ATR ≥ 0,3%); quem quiser
   cortar mais liga o analista ou sobe o mínimo para 1%.

## 8. Critérios de aceite

1. Sem o campo, tudo idêntico: dourado `engine-2`, dourado `analyst-1`, `runHash` do conjunto de exemplo e os
   preenchimentos dos conjuntos reais, byte a byte.
2. Com o campo, toda entrada criada tem `ganho líquido no alvo ≥ mínimo` (propriedade, 2.000 sorteios) e toda compra
   barrada vira ordem `rejected` / `below_minimum_profit`; nenhuma saída muda de vela por causa da regra.
3. Diferencial contra o oráculo independente (sem importar `src`) em ≥ 3.000 fluxos; harness de 21 verificações com o campo.
4. Paridade backtest × ao vivo e walk-forward por janela com o campo ligado, nos conjuntos reais.
5. Na simulação ao vivo, a vela barrada aparece em "decisões" com a frase exata do servidor e os números certos (X para
   baixo, custo e mínimo para cima); `/log.csv` traz a ordem recusada.
6. O campo no painel: pré-preenchido 0,6, desligável, explicação e custo de 0,30% visíveis, `400` sem eco para valor
   inválido, 375 px sem rolagem horizontal, contraste conferido.
7. A T0.2 em `evidence.md` (183 dias, 4 pares × 2 estratégias, 0 / 0,3 / 0,6 / 1,0%).
8. Mutantes da regra todos mortos (≥ 12).

## 9. Decisões que o usuário precisa tomar (A = recomendado)

1. **Onde a regra mora (D1):** A) parâmetro da execução, checado dentro do motor — **muda o motor, exige autorização** ·
   B) campo da estratégia (editar cria versão nova) — **também muda o motor** · C) fora do motor, pela "escala de entrada"
   que o analista já usa (sem mudar o motor; a regra fica no `advanceCandle` e no walk-forward, a recusa fica silenciosa e
   o painel precisa deduzir o motivo). *Sem resposta: a execução faz só a Fase 0 (contrato e medição) e para antes de
   tocar no motor.*
2. **Padrão do campo (D2):** A) 0,6% pré-preenchido em toda execução nova, desligável · B) 0,3% · C) desligado por padrão.
   *Sem resposta: A, mas só depois da medição da T0.2.*
3. **Registro da recusa (D3):** A) ordem recusada com motivo próprio — **migration aditiva, exige autorização** · B) em
   silêncio, sem migration. *Sem resposta: a execução para na T2.1 e pergunta.*
4. **Analista da 007 (D4):** A) a trava `move_cost` fica como está; só o custo vira um lugar único · B) `analyst-2` troca a
   trava por esta regra. *Sem resposta: A.*
5. **O que é "ganho possível" (D5):** A) o alvo (melhor caso), com o aviso "não garante lucro" · B) alvo ponderado pela
   chance de acerto do auditor. *Sem resposta: A.*
6. **Outras telas (D6):** A) prazos, metas e "O que falta para comprar" ficam como estão · B) a linha de 15 min dos prazos
   ganha "com lucro mínimo" nesta spec. *Sem resposta: A.*
