# Plan — Spec 016 (compras e vendas em escada)

Desenho técnico. O contrato fechado (`ladder-1`) vira a seção "Compras e vendas em escada (spec 016)" do ADR 0002 na T0.1,
validada por `architect` (opus). Onde este plan e o ADR divergirem, vale o ADR (e o desvio é registrado em `evidence.md`).
Conferido no código em 2026-10-16: `wallet/*.ts`, `engine-state.types.ts`, `wallet-state.schema.ts` (`strictObject`),
`strategy-config.schema.ts` (`STRATEGY_CONFIG_SCHEMA`, `strictObject`; `entry` com `.prefault`), `risk/position-size.ts`,
`run-result-upsert.ts` (`writePositions` só avança `open → closed`) e `run-result.constant.ts`.

## D1 — Configuração (`StrategyConfig.ladder`, `ladder-1`)

```ts
// strategy-config.schema.ts — chave opcional SEM .default/.prefault: ausente = configHash idêntico
ladder: LADDER_SCHEMA.exactOptional()

LADDER_SCHEMA = z.strictObject({
  entries: z.array(z.strictObject({ dropRate: decimalText(0..0.5, 8 casas), weight: int(1..100) })).min(1).max(5),
  exits: z.array(z.strictObject({ gainRate: decimalText((0..1], 8 casas), weight: int(1..100) })).max(5).exactOptional(),
  runnerWeight: int(0..100).exactOptional(),          // parte sem alvo; ausente = 0
  maxEntryCandles: int(1..672).exactOptional(),       // obrigatório se entries.length > 1
  stopAfterFirstExit: z.enum(['keep', 'break_even']).exactOptional(), // ausente = 'keep'
}).superRefine(...)
```

Validações (todas juntas, `400` com todos os erros, sem eco): `entries[0].dropRate === '0'` (grafia canônica); `dropRate`
estritamente crescente e `gainRate` estritamente crescente (comparação decimal exata, não de texto); `maxEntryCandles`
presente se e só se houver mais de um degrau; `runnerWeight` só com `exits`; `exits` vazio é recusado (use ausente).
`exactOptional` pelo mesmo motivo da MP1 da 013 (o `canonicalJson` lança com `undefined`). `STRATEGY_CONFIG_SCHEMA_VERSION`
NÃO muda (o literal entra no hash). Pesos inteiros: fração = `weight ÷ W` com `W = Σ pesos de entries` (compras) e
`W' = Σ pesos de exits + runnerWeight` (vendas); "1/3" é exato e a tela mostra a fração reduzida. O catálogo ajustável do
walk-forward NÃO ganha caminhos de `ladder` (o editor do painel espelha `STATIC_TUNABLE_KEYS`; nada muda lá).

O editor do painel (`config-leaves.ts`) só edita folhas numéricas e decimais; a escada tem bloco próprio (D10), e as
folhas `ladder.*` ficam fora da lista genérica.

## D2 — Estado (`WalletState.ladder`, opcional)

Presente só enquanto existe plano de escada (do preenchimento do 1º degrau até a posição fechar); ausente em toda carteira
sem escada, então o estado canônico de hoje não muda um byte.

```ts
type LadderState = {
  readonly positionKey: string;
  readonly decisionCandleOpenTime: number;     // t
  readonly riskAmount: string;                  // R (já com a escala da 007)
  readonly stopPrice: string;                   // proteção única; só sobe
  readonly entries: readonly LadderEntryState[]; // [{ index, orderKey, limitPrice, plannedQuantity, filledQuantity, status }]
  readonly exits: readonly LadderExitState[];    // [{ index, plannedWeight, soldQuantity, status }]
  readonly remainingEntryCandles: number | null; // validade dos degraus 2..n
  readonly boughtQuantity: string;              // Σ comprado
  readonly soldQuantity: string;                // Σ vendido
  readonly buyDebit: string;                    // Σ (valor + taxa) das compras, exato
  readonly sellCredit: string;                  // Σ (valor − taxa) das vendas, exato
  readonly entryFees: string; readonly exitFees: string;
  readonly hasExitStarted: boolean;
};
```

`position` continua existindo (o resto do sistema lê ela): `quantity` = quantidade em mãos (`boughtQuantity −
soldQuantity`), `entryPrice` = preço médio de exibição (`buyNotional ÷ boughtQuantity` para CIMA a 8 casas — só exibição; a
conta usa os totais exatos), `stopPrice` = proteção, `targetPrice` = alvo da próxima parcela pendente (ou o alvo ATR do preço
médio sem `exits`), `entryFee` = Σ taxas de compra. `pendingOrder` segue sendo a ORDEM ÚNICA das decisões de `t` (1º degrau,
venda por sinal/comando): os degraus 2..n moram em `ladder.entries`, então uma venda a mercado pode conviver com degraus
pendentes (que ela cancela). `WALLET_STATE_SHAPE` ganha `ladder: LADDER_STATE_SCHEMA.exactOptional()`; código velho recusa
estado com a chave (estrito), daí a ordem de deploy (D6).

## D3 — A vela por dentro (ordem dos acontecimentos, pior caso)

Princípio: o caminho do preço dentro da vela é desconhecido; quando a ordem importa, o motor escolhe a sequência **pior para
o usuário** que seja fisicamente possível, e nunca usa um preço que não estava no livro antes do acontecimento.

| Passo | Quando | O que acontece |
|---|---|---|
| E1 | abertura | Ordem a mercado de `t` (1º degrau a mercado, venda por sinal/comando) preenche como hoje. No preenchimento do 1º degrau nasce o plano (D4): `L_k = tickDown(P_1 × (1 − dropRate_k))`, quantidades, proteção; ordens `created` dos degraus 2..n nesta vela |
| E2 | abertura, posição de vela anterior | **Lacuna para baixo** (`abertura ≤ proteção`): degraus com `L_k ≥ abertura` preenchem a `L_k` (no livro, nunca melhor), e então a posição inteira sai a `stopExitPrice(min(proteção, abertura))`. Pior caso: comprou e saiu na mesma abertura |
| E3 | abertura, posição de vela anterior | **Lacuna para cima** (`abertura > alvo_j`): parcelas com alvo abaixo da abertura saem ao preço do ALVO (como o alvo de hoje), em ordem crescente |
| E4 | meio da vela | Degraus pendentes com `mínima < L_k` (cruzar) preenchem a `L_k`, do mais alto ao mais fundo; marca `isIntraCandleEntry` |
| E5 | meio da vela | `mínima ≤ proteção` → todo o restante sai na proteção (`stopExitPrice`), inclusive o que entrou em E4. **Proteção vence alvo** na mesma vela |
| E6 | meio da vela | Só se E5 não disparou E nenhum degrau preencheu em E4 (a máxima pode ter vindo antes): parcelas com `máxima > alvo_j` saem a `alvo_j`, crescente; a parcela que zera a posição a fecha (`exitReason: target`) |
| E7 | fechamento | Com escada viva: recalcula preço médio e alvos (valem de `t+1`); `break_even` sobe a proteção se houve 1ª venda; 1ª venda nesta vela → cancela degraus (`ladder_exit_started`); validade dos degraus −1 (zerou → `expired`); posição fechada → degraus restantes `cancelled`/`position_closed` |
| E8 | fechamento | Comandos e sinal, como hoje: `exit_position` e SELL cancelam degraus (`command`/`opposite_signal`) e vendem o restante a mercado em `t+1`; `halt` cancela degraus (`command`) e mantém a posição; BUY com posição = nada |
| E9 | lacuna confirmada | Como hoje: cancela tudo que está pendente (`gap`) e fecha o restante na abertura pós-lacuna |

Vela da própria entrada: como hoje, E2/E3 não se aplicam à posição aberta nesta vela. Limitada do 1º degrau preenchida no
meio da vela → E4 pode preencher degraus mais fundos na mesma vela (o preço passou por `L_1` e seguiu até a mínima) e E6 não
roda. Alvos e proteção usados em E2–E6 são os vigentes no início da vela (fixados no fechamento anterior ou no plano).

## D4 — Tamanho e risco (`computeLadderSize`, `risk/ladder-size.ts`)

Entradas: `R` (guardado na ordem do 1º degrau, como hoje), `P_1` (preço do 1º preenchimento), ATR de `t` (recuperado das
distâncias da ordem, como `recoverDecisionAtr`), frações, taxas, filtros, caixa, `maxExposureRate`, `decisionVolume`.

1. `L_1 = P_1`; `L_k = tickDown(P_1 × (1 − d_k))` para k ≥ 2.
2. Proteção `S` = `computeProtectivePrices({ entryPrice: L_n, atr, stopAtrMultiple, ... }).stopPrice` (mesma função; a
   proteção fica abaixo do degrau mais fundo por construção). `X` = `stopExitPrice` estimado como em `computePositionSize`.
3. Perda por unidade planejada: `u = Σ (w_k ÷ W) × [L_k × (1 + f) − X × (1 − f)]` (taxa nas duas pontas, deslizamento de
   saída já em `X`; o 1º degrau usa o preço a mercado com deslizamento, que já é `P_1`).
4. `Q` = maior quantidade com `Q × u < R` descontada a folga de arredondamento (como `computePositionSize` faz hoje);
   `q_k = stepDown(Q × w_k ÷ W)`; limites: `Σ q_k × L_k × (1 + f) ≤ caixa` e `≤ maxExposureRate × patrimônio`; cada `q_k ≤
   maxVolumeShare × volume(t)`; corta proporcionalmente quando um limite morde (constraint `cash_capped`/`exposure_capped`/
   `volume_capped`, como hoje). Qualquer `q_k × L_k < minNotional` → recusa da entrada inteira com `below_min_notional`.
5. **Redução exata:** `entries = [{ '0', w }]` e sem `exits` ⇒ `computeLadderSize ≡ computePositionSize` (mesma quantidade,
   mesmo `constraint`) — diferencial obrigatório; é o que garante que a escada não cria um segundo dimensionamento.

**"Nunca aumentar a perda máxima"** (propriedades do oráculo): `Σ q_k × [L_k(1+f) − X(1−f)] < R`; nenhum `q_k` cresce
depois do plano; nenhum degrau novo; `S` nunca desce; a perda realizada sem lacuna é < `R` mesmo com degraus preenchidos em
E2. Com lacuna (E2 e E9) a perda pode passar de `R` — igual a hoje — e a T0.3 mede quanto.

**Proteção no empate (`break_even`):** depois da 1ª venda, `S' = tickUp(custo restante ÷ (q_rest × (1 − f) × (1 − s)))`
com custo restante = `buyDebit × q_rest ÷ boughtQuantity` (exato); `S ← max(S, S')`.

## D5 — Decisões, registro e banco

- **Ordens:** degraus = `type: limit`, `purpose: entry`, `limitPrice = L_k`, `quantity = q_k`, `eligibleCandles =
  maxEntryCandles`; parcelas = `type: target`, `purpose: exit`, `created` + `filled` com `triggerPrice` (como
  `closeProtective`). Uma chave por ordem (`takeKey`), então a chave única `(run_id, order_key, candle_time)` de `fills` serve
  sem mudança. Motivos novos: `ORDER_EVENT_REASON.LADDER_EXIT_STARTED = 'ladder_exit_started'` e `POSITION_CLOSED =
  'position_closed'` (cabem no `varchar(32)`), cópia em `run-result.constant.ts` e migration aditiva do `orders_reason_check`
  (D3-A; `NOT VALID` + `VALIDATE`; rollback aborta se houver linha).
- **Preenchimentos:** um `FillDecision` por perna (compra ou venda), com a taxa da perna.
- **Posição:** `openedPositions` uma vez (no 1º degrau); a cada perna seguinte, `positionUpdates` (lista OPCIONAL nas
  decisões, presente só quando não vazia — senão o dourado `engine-2` muda) com quantidade comprada, preço médio, taxas,
  proteção e próximo alvo; `closedPositions` uma vez, com `entryPrice` = preço médio, `quantity` = comprada, `exitPrice` =
  preço médio de venda (para BAIXO a 8 casas, exibição), `entryFee`/`exitFee` = somas, `netProfit = sellCredit − buyDebit`
  exato, `exitReason` = o da última perna. Métricas: uma posição = UMA operação (nº de preenchimentos é relatório à parte);
  `reconcileRunMetrics` continua exato porque usa `netProfit`.
- **`run-recording`:** `positionUpdates` vira a linha de `positions` com status `open`; `writePositions` passa a aceitar
  atualização `open → open` MONOTÔNICA: `quantity` só cresce e `stop_price` só sobe (`setWhere` = avança status OU
  `excluded.quantity > quantity` OU `excluded.stop_price > stop_price`; quando a quantidade cresce, preço médio, taxa de
  entrada, alvo e proteção vêm juntos). Idempotente por construção (reaplicar a mesma linha não muda nada). Sem migration.
- **Equidade e vale:** `equityAtLow` valora a quantidade em mãos na mínima, incluindo degraus que entraram na vela (E4) e
  excluindo o que saiu pela proteção, como a regra da T2.6.

## D6 — Hashes, versões, deploy e reversão

`configHash` muda só com `ladder`; `runHash` não muda; `ENGINE_VERSION` (`engine-2`), `ENGINE_STATE_VERSION`,
`SIGNAL_ENGINE_VERSION`, `METRICS_VERSION`, `RUN_PARAMETERS_SCHEMA_VERSION` e `STRATEGY_CONFIG_SCHEMA_VERSION` NÃO mudam
(precedente A21/MP7; conferido: versão nova falha toda execução em andamento por `ENGINE_VERSION_MISMATCH` e todo checkpoint).
Prova: dourado `engine-2` IDÊNTICO, hash-dourado literal de `classic-scoreboard.run.json` e do `configHash` do exemplo, e
dourado `analyst-1` idêntico. Deploy: banco (motivos) → worker (dormente sem escada) → API (aceita `ladder`) → painel.
Reversão: painel → API (recusa `ladder` de novo) → encerrar execuções de versões com escada (ao vivo, fila, checkpoint) →
worker → banco (rollback aborta com trilha).

## D7 — Com a 013 e a 007

- **013 (`minimum-profit-1`):** em `placeEntry`, depois de `zero_atr`: se a versão tem `exits`, a regra compara
  `gainRate_1 ≥ n + c` (exato, sem ATR nem fechamento); senão, a MP2 como está. `warnRunParameters` não vê a estratégia, então
  os avisos `ladder_exit_below_cost` (`gainRate_j ≤ c`) e `ladder_exit_below_minimum_profit` saem do caso de uso de criação da
  execução (que tem estratégia e parâmetros). Se a 013 ainda não estiver no motor quando a Fase 1 começar, a T1.2 entra sem
  esse trecho e a T1.5 o acrescenta depois que a 013 fechar.
- **007 (A21):** a escala multiplica `R` uma vez, na decisão; degraus planejados não são entrada nova, então pausa posterior
  não os toca (D9-A). Saída por tempo do analista = `exit_position` (E8).

## D8 — Medição (T0.3, `scripts/ladder-measure.ts`)

Só leitura: velas e Fear & Greed por `SELECT` (`readPair`/`readFearGreed` de `scripts/risk-analyst-baseline/market-source.ts`,
como `scripts/minimum-profit-measure.ts`); `--counts` antes e depois; nada em `src`; nenhuma escrita. Como o motor ainda não
tem escada, o sinal vem do `signalStep` de PRODUÇÃO e a carteira vem do **oráculo `bigint` da T0.2**
(`test/fixtures/ladder/ladder-oracle.ts`). Antes de medir, o oráculo em modo "posição única" tem de reproduzir o motor de
produção EXATO (caixa, operações, taxas) nos 16 conjuntos (4 pares × 2 velas × 2 estratégias); se divergir, para.

Desenhos (Placar clássico e Reversão; 4 pares; 15 min e 1 h; 183 dias; saldo 10.000; custo padrão):

| Código | Entradas (peso) | Saídas (peso) | Para quê |
|---|---|---|---|
| S0 | única | alvo ATR | hoje |
| S0w | única, proteção larga igual à de E3 | alvo ATR | **controle de tamanho**: separa "menos dinheiro em jogo" de "escada" |
| E3 | 0 / −2% / −3% (1/1/1) | alvo ATR do preço médio | o exemplo do pedido |
| E4 | 0 / −2% / −3% / −5% (1/1/1/1) | alvo ATR do preço médio | a "cascata 2, 3, 5" literal |
| X3 | única | +3% / +5% / +10% (1/1/1) | vendas em partes do pedido |
| X3s | única | +0,6% / +1% / +2% (1/1/1) | o mesmo formato na escala do movimento de 15 min |
| E3X3 | 0 / −2% / −3% | +3% / +5% / +10% | os dois juntos |
| E3X3be | idem | idem, `break_even` | efeito da proteção no empate |

Colunas por linha: líquido (USDT e %), maior queda pelo vale, operações (posições), preenchimentos, taxas, maior valor em
jogo, % de degraus preenchidos por posição, % de parcelas atingidas, pior perda de uma operação (e se passou de `R`, por
lacuna) e o líquido do mesmo desenho a mínimo 0,6% da 013. Veredito por combinação: escada melhor/pior que S0 **e** que S0w.
**Critério de parada:** se a escada for pior que S0w na maioria das combinações, o relatório diz isso em destaque e o D7
fica A (sem padrão); nenhuma frase do painel sugere a escada como melhoria.

## D9 — API (`GET /v1/runs/:runId/ladder`)

`apps/api-ativada/src/runs/ladder/`: rota com `access: USER` e `documentation`, política `RUN_LIVE_STATUS`, sem query
(parâmetro = `400`). Consultas (≤ 4, `Promise.all` só depois da execução): execução (PK + dono) com a versão, a posição aberta
ou a última fechada, as ordens de entrada dela (`purpose = entry`, mesma `position`), os preenchimentos dela. Resposta
`{ data: null }` para versão sem escada ou sem posição; senão `{ entries[], exits[], averagePrice, boughtQuantity,
remainingQuantity, realizedProfit, stopPrice, messages }` em texto, com as frases do catálogo `ladder-messages.ts` ("Compra
2/3 se cair −2% (12,208): 135,23 LINK ≈ 1.650,89 USDT · 33% da posição"). Os alvos saem de `computeLadderLevels` (pura,
exportada pelo motor, a MESMA da carteira). Alheia/inexistente/malformada = o mesmo `404`. Leitura em
`packages/database/src/run-results/run-ladder.ts` com `OwnerScope` no tipo; o filtro de dono entra em `make api-runs-mutants`.

## D10 — Painel

- `src/strategies/ladder/`: `LadderEditor` (bloco desligado por padrão, modelos "3 compras na queda" e "3 vendas na subida",
  linhas com % e peso, prévia em frases com preço de exemplo, aviso de custo por parcela calculado em `BigInt` a partir das
  taxas padrão) e `ladder.validation.ts` (Zod espelhando `LADDER_SCHEMA`).
- `src/runs/ladder/`: `LadderCard` (lista com fração, preço, quantidade em moeda e USDT, % da posição, estado com ícone +
  palavra + cor) e `useLadderQuery` (chave `['runs', runId, 'ladder']`, refeita pelo aviso do stream).
- Ficha e plaquinhas da 014 (régua com os degraus e parcelas; "Operar à mão" com uma linha por ordem), quadro de avisos da
  011 (E-RF13) e camada "Níveis" da 009 (linhas tracejadas por degrau e parcela; contraste 3:1): **só depois que a 014, a 011
  e a 009 fecharem**, porque mexem em arquivos delas. Termos novos no glossário: "compra em partes", "venda em partes",
  "preço médio" (uma linha cada, sem promessa).

## D11 — Provas

- **Oráculo `bigint`** (`test/fixtures/ladder/ladder-oracle.ts`, sem importar `src` nem `decimal.js`): plano, tamanho, E1–E9,
  caixa, preço médio, lucro, patrimônio e vale. Contas à mão: degrau e alvo no tick, as três lacunas, degrau + proteção na
  mesma vela, degrau + alvo na mesma vela (alvo bloqueado), parcela abaixo de `minNotional` juntada, última parcela vende o
  resto, `break_even`, validade, cancelamento por cada causa.
- **Diferencial:** motor × oráculo em ≥ 3.000 fluxos sorteados com escada; escada de um degrau × motor sem escada em ≥ 3.000.
- **Propriedades** (2.000 séries): as de RF05 e do critério 4 do spec.
- **Harness** `runEngineContract` (21 verificações, 10 cenários) com uma estratégia em escada; `make contract-full` verde.
- **Mutantes** (`test/ladder-mutants.contract.test.ts`, ≥ 20, todos mortos e a cópia de controle viva): proteção do degrau
  1 em vez do mais fundo; tocar em vez de cruzar; alvo liberado com degrau na mesma vela; alvo antes da proteção; preço do
  degrau para cima; alvo para baixo; quantidade para cima; peso ignorado; degrau sem custo na conta de `u`; validade +1;
  degrau não cancelado na 1ª venda; proteção descendo; `break_even` sem a taxa; última parcela sem vender o resto; perna sem
  taxa; `netProfit` pelo preço médio arredondado; escala aplicada por degrau; `positionUpdates` sempre presente (mata pelo
  dourado); `.optional()` em vez de `.exactOptional()`; `setWhere` aceitando quantidade menor.
- **Paridade:** `make backtest-test`, `make live-test` e `make walkforward-test` com uma versão em escada nos conjuntos reais.

## D12 — Riscos

| Risco | Efeito | Mitigação |
|---|---|---|
| Escada vendida como "recupera a perda" | Pessoa aumenta a exposição na queda | RF05 (orçamento total), frases do RNF09, D7-A sem padrão |
| Dourado `engine-2` muda sem querer | Toda simulação em andamento quebraria | Chaves opcionais, mutante dedicado, hash literal |
| Linha de `positions` aberta desatualizada | Tela mostra preço médio velho | `writePositions` monotônico (D5) + contrato no `make database-test` |
| 013 ou 007 mexem em `entry-order.ts` ao mesmo tempo | Conflito no motor | Conferir `git log` do motor antes de cada fase; T1.5 depois da 013 |
| Teto de consultas da `live-status` | Escada não cabe nas 5 | Rota própria (D9) |
