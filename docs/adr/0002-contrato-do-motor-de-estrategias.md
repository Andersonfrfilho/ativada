# ADR 0002 — Contrato do motor de estratégias

**Status:** aceito com ajustes (T2.1 proposto; revisão do `architect` aplicada na T2.1b — seção
"Revisão do arquiteto") · **Data:** 2026-10-10

## Contexto

A spec 001 tem um motor só (constituição §5) para três chamadores: o backtest (Fase 3, laço sobre
candles do banco num `worker_thread`), a simulação ao vivo (Fase 4, um candle fechado por vez no
worker, retomando depois de reinício) e, na spec 002, a execução real. As metas (RF13, Fase 4b) e o
walk-forward (RF08) rodam o mesmo motor milhares de vezes. Tudo isso herda o contrato fechado aqui.

As restrições que o contrato precisa tornar verificáveis por teste, não por disciplina:

- constituição §3: taxa e slippage sempre descontados; ambiguidade no candle resolve para o lado pior;
- constituição §4 e plan D6: decisão no fechamento do candle `t`, execução na abertura de `t+1`;
  indicador que repinta é proibido;
- constituição §5: backtest, ao vivo e execução real chamam o mesmo código; divergência é defeito;
- constituição §6 e plan D3: dinheiro e quantidade em decimal (`decimal.js`); float só no indicador;
- constituição §8 e RF12: toda decisão gravada (candle, votos, pontuação, ordem, preenchimento, taxa,
  saldo) com o suficiente para reconstruir a operação;
- RF03 (configuração versionada por schema), RF04 (placar com motivo legível), RF05 (risco por ATR,
  "no máximo 1% do saldo até o stop", uma posição por par), RF06 (corretora simulada), RF07
  (determinismo; saldo, taxa e slippage são entrada do backtest), RF09 (retomar sem duplicar), RF13
  (cada par com valor fictício próprio).

O pacote `packages/strategy-engine` estava vazio (só `WORKSPACE_NAME`). Este ADR fecha o contrato; a
T2.1 entregou os tipos, o schema, o estado, as interfaces, uma implementação de **referência** e o
**harness** que todas as implementações seguintes precisam passar, e a T2.1b aplicou os ajustes da
revisão do arquiteto.

## Decisão

### a) Pureza, estado e o laço único

O motor é uma função pura, composta de duas metades:

```ts
type Engine = {
  engineVersion: string;
  createInitialState({ strategy, run }): EngineState;
  step(input: StepInput): StepResult;                   // ≡ walletStep ∘ signalStep
  signalStep(input: SignalStepInput): SignalStepResult; // indicadores, regime, votos, ação, motivo
  walletStep(input: WalletStepInput): WalletStepResult; // ordens, preenchimentos, posição, patrimônio
};
type StepInput = {
  strategy: StrategyVersion;             // { config, configHash } — só a LÓGICA (§d)
  run: RunSetup;                         // { parameters, runHash } — par, timeframe, saldo, taxa… (§d)
  state: EngineState;                    // estado depois do candle anterior
  candle: EngineCandle;                  // candle FECHADO t (§h)
  sentiment?: SentimentObservation;      // última observação DISPONÍVEL no fechamento de t (§f)
  commands?: readonly EngineCommand[];   // meta, usuário, fim de janela (§h)
  executionReports?: readonly ExecutionReport[]; // fatos da corretora (spec 002, §h)
  confirmedGapCandles?: number;          // lacuna para a frente confirmada pelo chamador (§a)
};
type SignalStepInput = { strategy; market: { symbol; timeframe }; state: SignalState; candle; sentiment?; confirmedGapCandles? };
type WalletStepInput = { strategy; run; state: WalletState; candle; signal: SignalDecision | null; commands?; executionReports? };
```

**Por que duas metades.** O sinal depende só de candles e sentimento; a carteira, dos parâmetros da
execução. O RF13 (cada estratégia × par × janela de prazo, cada uma com valor fictício próprio) e o
walk-forward calculam os sinais UMA vez, em série contínua, e rodam várias carteiras sobre eles — o
custo cai de "passos × carteiras × indicadores" para "passos × indicadores + passos × carteiras". O
corte também permite o teste diferencial do `FillModel` (§h). `step` é a composição e o harness prova
`step ≡ walletStep ∘ signalStep` em todo passo de todo cenário.

**Pureza.** Nenhuma das três funções lê relógio (`Date.now`, `Date()`, `new Date`, `performance.now`),
sorteia (`Math.random`, `crypto.randomUUID`, `getRandomValues`, `randomBytes`), formata por locale
(`toLocale*`, `Intl`, `localeCompare`), carrega código em tempo de execução (`require`, `import()`), faz
rede, disco, log ou console, ou usa matemática com precisão dependente de implementação
(`Math.exp/log/pow/…`, `**`); nenhuma muta a entrada (o harness congela a entrada com `Object.freeze`
profundo). O código-fonte do pacote é varrido por teste (`test/strategy-engine-boundary.contract.test.ts`)
atrás dessas chamadas, com sonda que prova que o padrão pega cada uma — a varredura é rede, não a única
defesa: o harness (§g) prova o comportamento. Os únicos imports permitidos são arquivos relativos,
`zod`, `decimal.js` (versões exatas) e `node:crypto` (só `createHash`, §d). O tempo de tudo vem do
`candle`.

**Estado (`EngineState`, versão 1).** Imutável, só tipos JSON, em duas partes:

| Campo | Significado |
|---|---|
| `version` | `1`. Outra versão ⇒ `EngineStateError(unsupported_version)` ⇒ migração (§b) |
| `engineVersion` | versão da semântica do motor que gravou o estado. Motor diferente ⇒ `engine_mismatch` ⇒ migração |
| `configHash` / `runHash` | hash da versão da estratégia e dos parâmetros da execução (§d). `step` recusa estado de outro (`CONFIG_HASH_MISMATCH`, `RUN_HASH_MISMATCH`) |
| `signal.leadInCandles` | candles de pré-aquecimento (§c), fixados na criação |
| `signal.processedCandles`, `signal.lastCandleOpenTime` | contador e abertura do último candle processado (`null` ⇔ zero) |
| `signal.indicators` | snapshot JSON de cada indicador, por id com espaço de nome (§c) |
| `wallet.keyPrefix` | espaço de nome das chaves (`''`, ou `w3:` numa janela de walk-forward) |
| `wallet.lastCandleOpenTime` | último candle da carteira (igual ao do sinal no `step`) |
| `wallet.firstSignalCandleOpenTime` | candle do primeiro sinal; a régua compra na abertura seguinte |
| `wallet.sequence` | contador das chaves determinísticas (`<prefixo>order-N`, `<prefixo>position-N`) |
| `wallet.isHalted` | `true` depois de `halt` até um `resume` (§h): não abre entrada |
| `wallet.cash` | saldo em USDT (texto decimal, nunca negativo) |
| `wallet.position` | a posição aberta (no máximo uma, §e) com `entryPrice`, `quantity`, `stopPrice`, `targetPrice`, `entryFee` |
| `wallet.pendingOrder` | a ordem pendente (no máximo uma): entrada guarda o VALOR EM RISCO (`riskAmount`), distâncias e, se limitada, `limitPrice`/`eligibleCandles`; saída guarda `exitReason`; `filledQuantity` reserva o preenchimento parcial da execução real (no simulado é `"0"`) |
| `wallet.benchmark` | "comprar e segurar" (quantidade e sobra de caixa) |

O schema Zod do estado é estrito (`.strict()` em todo nível) e cobra os invariantes (R4): caixa ≥ 0;
quantidade > 0; `stop < entrada < alvo`; entrada compra e saída vende; limitada ⇔ `limitPrice` e
`eligibleCandles`; entrada ⇒ `riskAmount` e distâncias, sem `exitReason`; saída ⇒ mercado com
`exitReason`, sem campos de entrada; entrada pendente só sem posição, saída pendente só com posição; as
metades no mesmo candle; `firstSignalCandleOpenTime` ⇔ aquecimento concluído; régua ⇔ aquecimento
concluído antes do último candle. Decimal no estado só na grafia canônica (`"00.10"`, `"1.0"` e `"-0"`
são recusados). `serializeEngineState` valida e escreve **JSON canônico** (chaves ordenadas, sem
espaço): o mesmo estado dá os mesmos bytes. Número não finito, `undefined`, `Map`, `Set`, instância de
classe (inclusive um `Decimal`) recusam a serialização. `deserializeEngineState` confere a versão, valida
e devolve o estado; falha com código (`invalid_json`, `unsupported_version`, `invalid_state`).

**O que entra em `decisions` (`StepDecisions`).** Tudo tem `candleOpenTime` igual ao do candle
corrente — nenhuma decisão é carimbada no passado:

| Campo | Conteúdo | Tabela (plan §3) |
|---|---|---|
| `signal` | `null` no aquecimento; depois, um por candle: `action`, `score`, `regime`, `votes[]` (`ruleId`, `family`, `vote`, `weight`, `isMissing`), `indicators` (ids com espaço de nome, achatados), `sentiment` (a observação usada, nula se ausente/velha), `reason` | `signals` (único por `run_id, candle_time`) |
| `commands[]` | comandos aplicados: `commandId`, `kind`, `reason`, `issuedAt` | `run_commands` (T3.1) |
| `orders[]` | eventos do ciclo de vida: `created`, `filled`, `cancelled`, `expired`, `rejected` (com `reason`), por `orderKey`; `price`/`quantity` só no `filled`; `triggerPrice` (stop/alvo) só nas saídas protetoras; `riskAmount`, `stopDistance`, `targetDistance`, `limitPrice`, `eligibleCandles` na entrada | `orders` (status monotônico) |
| `fills[]` | `orderKey`, `positionKey`, lado, `price`, `quantity`, `notional`, `fee` | `fills` |
| `openedPositions[]` / `closedPositions[]` | abertura (preço, quantidade, stop, alvo, taxa) e fechamento (preço de saída, taxas, `netProfit`, `exitReason`) | `positions` |
| `equityPoint` | `equity` e `benchmark` a valor de liquidação no fechamento, e `equityAtLow` (liquidação na mínima do candle, lado pior — perda máxima da meta e piso do RF09) | `equity_points` |

**Guarda de entrada (`assertStepInput`, `assertSignalStepInput`, `assertWalletStepInput`).** Recusa em voz
alta com `EngineInputError.code` estável — o chamador distingue "já processado, pule" de "entrada
errada, pare":

| Código | Quando |
|---|---|
| `CONFIG_HASH_MISMATCH` / `RUN_HASH_MISMATCH` | estado de outra versão da estratégia / de outros parâmetros |
| `CANDLE_WRONG_MARKET` | candle de outro par ou timeframe que o da execução |
| `CANDLE_INSANE` | preço não positivo, mínima acima do corpo, corpo acima da máxima, volume negativo, decimal com sinal, expoente ou vírgula, tempo não inteiro ou negativo (nunca um `DecimalError` cru) |
| `CANDLE_OFF_GRID` | `openTime % duração ≠ 0` ou `closeTime ≠ openTime + duração − 1` |
| `CANDLE_ALREADY_PROCESSED` | `openTime = lastCandleOpenTime` (retomada que refaz o último: pular) |
| `CANDLE_OUT_OF_ORDER` | `openTime < lastCandleOpenTime` |
| `CANDLE_GAP_UNCONFIRMED` | lacuna para a frente sem `confirmedGapCandles` igual à contagem exata de candles ausentes (ou declaração de lacuna que não existe) |
| `SENTIMENT_INVALID` / `SENTIMENT_FROM_FUTURE` | valor que não é inteiro finito 0..100 (NaN incluso), fonte vazia / `observedAt > closeTime` |
| `SIGNAL_MISMATCH` | `walletStep` com sinal de outro candle |
| `COMMAND_INVALID` | comando com `commandId` repetido ou vazio, `issuedAt` depois do fechamento, tipo ou motivo desconhecido |
| `EXECUTION_REPORTS_UNSUPPORTED` | relatório da corretora num motor que só simula (a referência recusa) |

**Lacuna.** O ao vivo só avança sobre uma lacuna CONFIRMADA (o worker já tentou o REST e a Binance não
tem o candle — `unfillable`); o backtest declara a mesma lacuna ao ler o banco. Sem a declaração exata,
o motor recusa: um candle que só "ainda não chegou" nunca vira lacuna no ao vivo e lacuna no backtest
(paridade). Validade de limitada e aquecimento contam candles processados, não horas.

**O laço é o mesmo.** O backtest chama `step` para cada candle lido do banco; o ao vivo chama `step`
para cada candle fechado que chega. Não existe `runBacktest` com outra lógica.

### b) Persistência, retomada e migração de versão

**Persistência do ao vivo (RNF03, RF09).** Uma transação por passo: grava as decisões e atualiza
`runs.engine_state` (o JSON canônico) e `runs.last_candle_time`. Chaves naturais:

- `signals` e `equity_points`: `INSERT … ON CONFLICT (run_id, candle_time) DO NOTHING` — a linha de um
  candle nunca muda depois de gravada;
- `orders` e `positions`: `INSERT … ON CONFLICT (run_id, engine_key) DO UPDATE SET … WHERE` o status
  novo é **posterior** ao gravado na ordem monotônica (`created < filled|cancelled|expired|rejected`;
  `open < closed`). O mesmo passo refeito regrava o mesmo status (no-op); um evento atrasado nunca
  regride uma ordem já terminal. A contradição entre "DO NOTHING" e "upsert por chave" da versão
  anterior desaparece: sinal e patrimônio são imutáveis, ordem e posição avançam por status;
- `fills`: `ON CONFLICT (run_id, order_key, candle_time) DO NOTHING`.

Se o processo cair antes do `COMMIT`, nada foi gravado e o passo é refeito com a mesma entrada, dando a
mesma saída (o harness prova: `step(input)` duas vezes no mesmo motor dá a mesma saída). Se cair depois,
o estado gravado já inclui o candle e `step` recusa o candle repetido com `CANDLE_ALREADY_PROCESSED`
(o chamador pula). É isso que torna a retomada do RF09 livre de operação duplicada.

**Persistência do backtest (RNF01).** Uma transação por passo custaria 17,5 mil commits. O backtest
grava em LOTE (checkpoint a cada N candles, com o `engine_state` do último candle do lote); se cair, a
execução recomeça do último checkpoint, com as mesmas chaves e o mesmo upsert monotônico. A transação
por passo é do ao vivo.

**Réplica não reemite alerta.** O chamador suprime o alerta de qualquer sinal cujo `candle_time` já
existia em `signals` (ou anterior ao `last_candle_time` de início da réplica). A réplica reconstrói o
estado; quem notifica é o passo novo.

**Migração de versão do motor (ou do estado).** Estado ilegível, `version` ou `engineVersion` diferente
⇒ **nova execução** ligada à anterior (`runs.migrated_from_run_id`), replicada desde o primeiro candle
da anterior com o motor novo. O histórico da execução antiga permanece **imutável** (nada é
sobrescrito nem misturado: as chaves naturais são por `run_id`). Reaquecer com os últimos N candles
NÃO é retomada (média exponencial tem memória infinita, §c).

**Troca de versão da estratégia com posição aberta.** Não existe "mudar a configuração de uma execução
viva": a execução recebe `exit_position` (vende a mercado em `t+1`) e é encerrada; a nova versão inicia
outra execução. Adotar a posição aberta na execução nova é decisão própria da spec 002 (onde a posição
é real e não pode ser simplesmente vendida).

**Walk-forward concatenado (RF08).** Os sinais da série inteira vêm de UMA passada de `signalStep`
(gravados uma vez por `run_id, candle_time`: o sinal do último candle de aquecimento de uma janela é o
mesmo sinal do último candle da janela anterior, sem colisão). Cada janela tem a própria carteira
(`createInitialWalletState({ run, keyPrefix: 'w<index>:' })`), então `engine_key` e `sequence` têm
espaço de nome por janela (`w3:order-0`). A carteira da janela começa no último candle de aquecimento
(decide no fechamento dele, executa na abertura da janela) e recebe `halt` (`window_end`) no último
candle da janela, que impede entrada nova; a posição viva é avaliada pelo `equityPoint` (liquidação).

### c) Indicadores

```ts
type Indicator<TValue extends number | Record<string, number>> = {
  warmupCandles: number;
  convergenceCandles: number;
  update(candle: IndicatorCandle): TValue | undefined;
  snapshot(): JsonValue;
};
type IndicatorCandle = { openTime; open; high; low; close; volume }; // number; open e openTime p/ VWAP
type IndicatorDefinition<TParams, TValue> = {
  name: string;
  create(params: TParams): Indicator<TValue>;
  restore({ params, snapshot }): Indicator<TValue>;
};
```

- **Implementação própria.** Os indicadores são implementados no pacote, só com `+ − × ÷` e
  `Math.sqrt` (exatos pelo IEEE 754) — nada de `exp/log/pow/**`, cuja precisão depende da
  implementação. `trading-signals` entra só como **oráculo de referência nos testes** (devDependency da
  T2.2), nunca em `src`. Janelas são **recalculadas** a cada candle (soma da janela, não somatório
  corrido com subtração, que acumula erro em 17,5 mil candles).
- **Aquecimento explícito.** `update` devolve `undefined` exatamente nas `warmupCandles − 1` primeiras
  chamadas e um valor finito a partir da `warmupCandles`-ésima. Indicador nunca devolve `NaN` nem
  `Infinity` (RSI sem perdas é 100, desvio-padrão zero é zero — a T2.2 documenta cada borda).
- **Convergência.** `convergenceCandles` é o horizonte em que o peso do primeiro candle cai abaixo de
  ε = 1e-3: EMA (α = 2/(n+1)) ≈ `(n+1)/2 · ln(1/ε)`; Wilder (α = 1/n: ATR, ADX, RSI) ≈ `n · ln(1/ε)`;
  janela finita = `warmupCandles`. `ln(1/ε)` é constante (`LN_INVERSE_CONVERGENCE_EPSILON`).
  Indicador encadeado soma as convergências das etapas: MACD = EMA lenta + EMA do sinal (26/9:
  94 + 35 = 129); ADX = suavização de Wilder do DM + a do DX (14: 97 + 97 = 194).
- **Pré-aquecimento (`leadInCandles`).** `computeLeadInCandles(horizontes) = max(warmup, convergência)`
  de **todos** os indicadores usados (regras, ATR do risco e ADX do regime — não só o ATR), gravado no
  estado na criação. O chamador entrega exatamente `leadInCandles` candles anteriores ao início do
  período (por contagem) e o motor não decide nada até processá-los; o primeiro sinal sai no fechamento
  do último deles. O fator antigo (3 × maior warmup) estava errado nos dois sentidos: dava peso residual
  `e^−6 ≈ 0,25%` para EMA, mas `e^−3 ≈ 5%` para Wilder (e pior nos encadeados). No Placar clássico o
  ADX 14 manda e o pré-aquecimento passa a 194 candles. Mudar a fórmula é nova `engineVersion`.
- **Sem repintura.** O valor devolvido no candle `t` é final; nenhum `update` posterior o altera.
- **Lote = incremental.** `computeIndicatorSeries` é um laço sobre `update`. Mesmo histórico ⇒ mesmos
  valores, no backtest e no ao vivo.
- **Precisão.** `number` só dentro do cálculo do indicador e na comparação do voto. Um valor de indicador
  só cruza para dinheiro por `decimalFromIndicator` (15 algarismos significativos via `toPrecision`) — é
  o caso do ATR que vira distância de stop.
- **Ids com espaço de nome.** Snapshot e valor: `rule:<id da regra>`, `risk:atr`, `regime:adx`.
  Indicador de várias saídas é achatado no registro do sinal (`rule:macd-12-26-9.signal`,
  `flattenIndicatorValue`).
- **Retomada = snapshot.** `restore(snapshot)` seguido de N updates é idêntico a N updates no original;
  dentro de `signalStep` o indicador é restaurado, atualizado e fotografado.

### d) Configuração: versão da estratégia × parâmetros da execução (RF03, RF07, RF13)

**A versão da estratégia é só a lógica.** `STRATEGY_CONFIG_SCHEMA` (Zod, `.strict()`; todos os problemas
de uma vez em `StrategyConfigError.issues`):

| Bloco | Campos | Defaults e limites |
|---|---|---|
| `schemaVersion` | `1` literal | outra versão é recusada |
| `rules[]` | 1 a 12 regras com `id` único e `kind` (§f) | obrigatório |
| `regime` | `{ kind: 'none' }` ou `{ kind: 'adx', period, trendThreshold, weights }` | `none`; ADX 14, limiar 25, pesos do plan §4 |
| `thresholds` | `buy` em `(0, 100]`, `sell` em `[−100, 0)` | obrigatórios |
| `entry` | `{ orderType: 'market' }` ou `{ orderType: 'limit', offsetRate (0, 0.2], expiryCandles 1..100 }` | mercado |
| `risk` | `atrPeriod`, `stopAtrMultiple` (0, 20], `targetAtrMultiple` (0, 50], `riskPerTrade` (0, 0.1], `maxExposureRate` (0, 1] | 14, 2, 3, 1%, 100% |

O pré-aquecimento é derivado da lógica (§c), não um campo.

**Os parâmetros da execução são entrada.** `RUN_PARAMETERS_SCHEMA` (`RunParametersError.issues`):

| Campo | Limites | Default |
|---|---|---|
| `schemaVersion` | `1` | — |
| `symbol` | `^[A-Z0-9]{2,16}USDT$` (saldo em USDT — D7) | obrigatório |
| `timeframe` | `15m`/`1h`/`4h`/`1d` | obrigatório |
| `initialBalance` | [10, 10⁹] — `numeric(24,8)` guarda 16 dígitos inteiros; 10⁹ deixa folga para quantidade × preço e taxa sem estourar a coluna | 10 000 |
| `feeRate` / `slippageRate` | [0, 1%] / [0, 5%] | 0,1% / 0,05% |
| `tickSize`, `quantityStep`, `minNotional` | filtros da corretora | 0,01 / 0,00001 / 5 (BTCUSDT) |
| `maxVolumeShare` | (0, 1] | 1% |

Saldo, taxa e slippage são entrada do backtest (RF07); cada par de uma meta tem valor fictício próprio
(RF13); os filtros mudam na corretora (spec 002) — nada disso muda a versão da estratégia.

- **Tipos.** Todo valor não inteiro que entra em conta de dinheiro ou de pontuação é **texto decimal**
  (`"0.001"`, sem expoente nem vírgula; até 18 dígitos inteiros e 12 decimais), devolvido canônico.
  Parâmetros de indicador são `number`, exceto os desvios do Bollinger: **texto decimal com uma casa**
  (`"2.3"`), porque `multipleOf(0.1)` em float recusaria `0.3`.
- **Hashes.** `hashStrategyConfig` e `hashRunParameters` = SHA-256 hexadecimal do JSON canônico do valor
  **reparseado** (defaults preenchidos, decimais canônicos, chaves ordenadas). Grafias equivalentes,
  ordem de chaves e defaults omitidos dão o mesmo hash; qualquer mudança de significado dá outro. O
  estado guarda os dois (`configHash`, `runHash`). `strategy_versions` ganha linha nova só quando o
  `configHash` difere; `runs` guarda `run_parameters jsonb` e `run_hash`.
- **Zod fixo.** O hash depende da semântica do Zod (defaults, transformações): `zod` é dependência direta
  em versão **exata** (4.6.5, a mesma resolvida no repositório), e um teste de **hash-dourado literal**
  (Placar clássico, configuração mínima com o JSON canônico literal, parâmetros de exemplo e mínimos)
  avisa se uma atualização mudar o hash.
- **Evolução do schema.** `schemaVersion: 2` nascerá como outro membro aceito, com `upgrade(v1) → v2`;
  versões antigas continuam parseáveis para sempre.
- **Teto do walk-forward.** `MAX_WALK_FORWARD_COMBINATIONS = 200` (RNF02), parâmetro da execução de
  walk-forward (T3.3).
- **Exemplo.** O "Placar clássico" (só a lógica) está em
  `test/fixtures/strategy-engine/classic-scoreboard.strategy.json` e um `RunParameters` de exemplo em
  `classic-scoreboard.run.json`.

### e) Modelo de preenchimento (D6)

Ordem dos acontecimentos dentro de um passo sobre o candle `k`:

1. **Abertura de `k`**: a ordem pendente decidida no fechamento de `k−1` executa (mercado na abertura;
   limitada se o candle cruzar). Entrada nunca preenche no candle em que foi decidida.
2. **Durante `k`**: stop e alvo da posição aberta (inclusive a que acabou de abrir) contra máxima e mínima.
3. **Abertura de `k`**, uma vez: "comprar e segurar" compra se o primeiro sinal foi no candle anterior.
4. **Fechamento de `k`**: `signalStep` atualiza os indicadores; se o aquecimento terminou, o placar
   decide; `walletStep` aplica os **comandos**, depois o **sinal** (no máximo uma ordem para `k+1`), e
   calcula o ponto de patrimônio.

**Arredondamento — sempre contra o usuário.** Preço de compra para cima no tick; preço de venda para
baixo; preço limite de compra para baixo; stop para baixo; alvo para cima; quantidade para baixo no
passo; dinheiro com 8 casas: débito para cima, crédito para baixo; taxa para cima.

| Item | Regra |
|---|---|
| Compra a mercado | `P = tickUp(abertura(k) × (1 + s))` |
| Venda a mercado (sinal, comando) | `tickDown(abertura(k) × (1 − s))` |
| Limitada de compra | `L = tickDown(fechamento(t) × (1 − offsetRate))`, válida por `expiryCandles = N` candles. **No primeiro candle elegível**, `abertura ≤ L` preenche a `min(L, tickUp(abertura × (1 + s)))` (a ordem chega ao livro com o preço já abaixo). **Do 2º candle em diante**, `abertura ≤ L` preenche a `L` (a ordem está no livro: nunca melhor). Senão, `mínima < L` (cruzar; tocar não basta) preenche a `L`, no meio do candle. Senão consome um candle; ao zerar, `expired` naquele candle |
| Taxa | `ceil8(preço × quantidade × feeRate)`, nas duas pontas, em USDT |
| Caixa | compra debita `ceil8(valor) + taxa`; venda credita `floor8(valor) − taxa` |
| Decisão da entrada (fechamento de `t`) | `riskAmount = floor8(saldo × riskPerTrade)`; `stopDistance = ATR(t) × stopAtrMultiple`; `targetDistance = ATR(t) × targetAtrMultiple`. A ordem guarda o **valor em risco**, não um orçamento em USDT |
| Tamanho (preenchimento em `t+1`, preço `P`) | `stop = tickDown(P − stopDistance)`; saída estimada `X = tickDown(stop × (1 − s))`; `quantidade = stepDown(riskAmount ÷ (P − X + P·feeRate + X·feeRate))`, depois limitada por `stepDown(min(saldo × maxExposureRate, saldo ÷ (1 + feeRate)) ÷ P)` e pela participação no volume; por fim desce passo a passo enquanto o débito passar do caixa ou a perda realizada no stop (com os arredondamentos do preenchimento) passar de `riskAmount` |
| "Até o stop" | A perda realizada numa saída pelo stop **sem gap** nunca passa de `riskPerTrade × saldo` (taxas e slippage de saída inclusos) — check `realized-risk`. O risco de **gap além do stop** fica fora de "até o stop": abertura abaixo do stop sai na abertura, pior |
| Participação no volume (R3) | `quantidade ≤ stepDown(volume(k) × maxVolumeShare)`. O excesso não preenche: a ordem é **reduzida**, preenche como `filled` com `reason: volume_capped` |
| Recusas | ATR ausente ou ≤ 0 ⇒ `rejected` (`zero_atr`) na decisão, sem pendente; `riskAmount` zero ⇒ `rejected` (`below_min_notional`); no preenchimento, `stop ≤ 0` ou `stop ≥ P × (1 − s)` ⇒ `rejected` (`invalid_stop`); `quantidade × P < minNotional` ⇒ `rejected` (`below_min_notional`) |
| Stop e alvo | Calculados **no preenchimento**, do preço `P` com as distâncias do ATR de `t`: `stop = tickDown(P − stopDistance)`, `alvo = tickUp(P + targetDistance)`. Nenhum dado do futuro; o check `protective-prices` confere |
| Saída no stop | Em qualquer candle: `tickDown(min(stop, abertura) × (1 − s))`. `mínima ≤ stop` (no toque) dispara; abertura ≤ stop (gap) sai na abertura, pior que o stop |
| Saída no alvo | `máxima > alvo` (precisa passar) sai ao preço do alvo, sem slippage. **Gap acima do alvo** (`abertura > alvo`, posição vinda de antes) também sai ao preço do alvo: é o comportamento de uma ordem de alvo que está no livro (preenche no preço dela), não pessimismo |
| Stop e alvo no mesmo candle | **Vale o stop** (constituição §3) |
| Candle de entrada | A posição aberta na abertura é avaliada contra stop e alvo no próprio candle. A limitada preenchida **no meio** do candle é avaliada só contra o stop: a máxima pode ter acontecido antes do preenchimento |
| Patrimônio | `caixa + floor8(q × tickDown(preço × (1 − s))) − taxa` no fechamento (`equity`) e na mínima (`equityAtLow`); a régua "comprar e segurar" usa a mesma fórmula no fechamento, comprada com todo o saldo na abertura seguinte ao primeiro sinal |

**Eventos de ordem.** `created` traz a decisão (risco, distâncias, limite, validade) sem preço;
`filled` traz `price` e `quantity`. Saída por stop ou alvo emite `created` + `filled` no mesmo candle,
com `type: stop | target` e `triggerPrice` (o preço de saída vai em `price`, nunca em `limitPrice`) — na
spec 002 ela corresponde à OCO enviada à corretora no preenchimento da entrada.

**Posição e sinais.** Só posição comprada (à vista, sem venda a descoberto, sem alavancagem). No máximo
uma posição e uma ordem pendente por execução — e cada execução é de um par só, então "uma posição por
par por estratégia" (RF05) é invariante do estado.

| No fechamento de `t` | Sem posição, sem pendente | Entrada limitada viva | Posição aberta |
|---|---|---|---|
| `BUY` | cria entrada (mercado ou limitada), salvo `isHalted` | mantém a pendente | ignora (sinal gravado) |
| `SELL` | nada | **cancela** a pendente (`cancelled`, `opposite_signal`) | cria venda a mercado para `t+1` (`exitReason: signal`) |
| `HOLD` | nada | segue até preencher ou expirar | nada; stop e alvo seguem valendo |

Uma ordem a mercado nunca fica pendente além de um candle. Se a posição saiu por stop no candle `k`, um
`BUY` no fechamento de `k` pode criar nova entrada para `k+1`.

### f) Regime e placar

**Voto por regra** (`+1`/`0`/`−1`; comparações estritas em `number`, empate é `0`):

| `kind` | Família | `+1` | `−1` |
|---|---|---|---|
| `ema_cross` (`fastPeriod < slowPeriod`) | tendência | EMA rápida > lenta | EMA rápida < lenta |
| `macd` (`fast < slow`, `signal`) | tendência | MACD > linha de sinal | MACD < linha de sinal |
| `donchian_breakout` (`period`) | tendência | fechamento > máxima dos `period` candles **anteriores** | fechamento < mínima dos anteriores |
| `rsi` (`oversold < overbought`) | reversão | RSI < `oversold` | RSI > `overbought` |
| `bollinger` (`period`, `deviations`) | reversão | fechamento < banda inferior | fechamento > banda superior |
| `obv_trend` (`emaPeriod`) | volume | OBV > EMA do OBV | OBV < EMA do OBV |
| `fear_greed` (`fearAtOrBelow < greedAtOrAbove`) | sentimento | índice ≤ `fearAtOrBelow` (contrário) | índice ≥ `greedAtOrAbove` |

A família é da regra (`RULE_FAMILY`). RF02 lista ainda SMA, z-score e VWAP: entram como indicadores na
T2.2 e como regra numa versão futura do schema.

**Regime.** `adx`: ADX(`period`) ≥ `trendThreshold` ⇒ `trending`; senão `ranging`. `none` ⇒ peso `1`.

**Pontuação.** `score = Σ voto × peso(família, regime)`, em decimal. `score ≥ buy` ⇒ `BUY`;
`score ≤ sell` ⇒ `SELL`; senão `HOLD`.

**Sentimento sem lookahead.** `SentimentObservation = { value, observedAt, source }`, onde `observedAt` é
o instante em que o valor ficou **disponível**: ao vivo, o momento da coleta; no histórico, o timestamp
do dado + um atraso de publicação conservador configurável no cron (padrão 24 h). A fonte usada pelo
motor é **imutável e versionada**: `sentiment_observations` (append-only: data, valor, `observed_at`,
fonte) é distinta de `sentiment_daily` (que continua mutável, só para exibição) — a migration nasce na
T3.1. O chamador entrega a última observação com `observedAt ≤ closeTime`
(`selectAvailableSentiment`, empate pela ordem de inserção); a guarda recusa a do futuro e valor que não
seja inteiro finito 0..100. Idade exata: `closeTime − observedAt > 48 h` ⇒ ausente (48 h em ponto ainda
vale; `resolveFreshSentiment`). Observação ausente ou velha ⇒ voto `0` com `isMissing: true`. O sinal
grava a observação usada (`signal.sentiment`).

**Aquecimento e dado ausente.** Nenhum sinal antes de `leadInCandles` candles. Depois do aquecimento,
valor ausente ou não finito de indicador de candle é **erro**; só o sentimento pode faltar.

**Motivo (formato fixo, determinístico).** Segmentos separados por ` · `, regras na ordem da configuração:

```
<Ação> · pontuação <score> · <regime> · compra: <regras +1> · venda: <regras −1> · neutras: <regras 0>[ · sem dado: <regras ausentes>]
```

- Ação: `Compra`, `Venda` ou `Neutro`. Regime: `tendência (ADX 31.2)`, `lateral (ADX 18.4)` ou `sem filtro
  de regime`. O ADX exibido é **truncado** em uma casa (31,29 ⇒ `31.2`): arredondar para cima poderia
  mostrar `25.0` para um ADX 24,96 que ficou abaixo do limiar 25 e confundir o leitor.
- Rótulos: `EMA 9×21`, `MACD 12/26/9`, `Donchian 20`, `RSI 14`, `Bollinger 20/2`, `OBV×EMA 20`,
  `Fear & Greed`.

A T2.3 implementa o formato e o prende por tabela de cenários.

### g) Não-lookahead e determinismo como contrato

"Provado por teste" quer dizer passar `runEngineContract` em cada cenário. As verificações, na ordem em
que rodam (a primeira que falha nomeia o defeito):

| Verificação | O que prova |
|---|---|
| `determinism` | Duas execuções do zero dão os mesmos bytes — inclusive com `Date.now`, `Math.random` e `performance.now` trocados |
| `immutability` | Com toda entrada congelada o motor roda e dá o mesmo resultado |
| `restep-idempotent` | `step(input)` chamado duas vezes no MESMO motor dá a mesma saída (refazer o passo depois de queda é seguro) |
| `cash-non-negative` | Nenhum estado tem caixa negativo |
| `serialization` | Todo estado volta igual de `deserialize(serialize(estado))` |
| `timing` | Toda decisão tem o `candleOpenTime` do candle corrente; entrada nunca preenche no candle da decisão; nada é decidido no aquecimento |
| `no-lookahead` | Para **cada** corte `i`: futuro ×1,37, ×0,63, **constante** e **permutado**, e o **sentimento futuro** espelhado (20 ↔ 80) com uma observação nova logo depois do corte — nenhuma decisão carimbada até `i` nem o estado em `i` muda |
| `step-composition` | `step ≡ walletStep ∘ signalStep` em todo passo |
| `resume` | Serializar, desserializar, criar um motor novo e continuar dá a execução contínua, em todo corte |
| `batches` | Lotes de 2, 3, 5 e 7 candles com motor novo a cada lote dão a execução contínua |
| `input-guards` | Cada entrada inválida é recusada com o código certo; lacuna declarada com a contagem exata é aceita |
| `single-position` | Nunca abre posição com outra aberta, nem cria entrada com posição aberta |
| `protective-prices` | Stop e alvo derivados do preço de preenchimento e das distâncias gravadas na ordem |
| `realized-risk` | Perda realizada no stop sem gap ≤ `riskPerTrade × saldo` da decisão |
| `fees-and-slippage` | Valor, taxa e preço a mercado pelas fórmulas; `equity` e `equityAtLow` reconciliam com o caixa reconstruído |
| `stop-before-target` | Stop tocado sai pelo stop; alvo só com o stop intacto e o preço acima do alvo (nunca no candle de uma limitada preenchida no meio) |
| `gap-beyond-stop` | Stop sai a `tickDown(min(stop, abertura) × (1 − s))`; alvo sempre ao preço do alvo |
| `limit-orders` | Limitada preenche só dentro da validade, pelo preço da regra do candle (1º elegível ou depois), cruzando, e expira exatamente no N-ésimo candle |
| `signal-policy` | A tabela de sinais e comandos de §e/§h no fechamento de cada candle |
| `required-events` | O cenário de fato exercitou o que promete (cenário que não dispara o evento reprova) |

### h) Fronteira de domínio, comandos e execução real

- `strategy-engine` **não depende** de `@cryptoada/market-data`, `@cryptoada/database` nem
  `@cryptoada/environment`. `EngineCandle` é estruturalmente compatível com o `Candle` do market-data
  (provado em teste) e a tabela de timeframes é igual (contrato).
- **Decimal.** `decimal.js` 10.6.0, num clone isolado (`EngineDecimal`: precisão 40, sem notação
  exponencial). **Nunca aparece no estado nem nas decisões**: tudo cruza a borda como texto canônico.
- **Comandos (`EngineCommand = { commandId, issuedAt, kind, reason }`).** Agem no fechamento do candle,
  antes do placar, e executam em `t+1` (mesma regra, sem saída "mágica" no preço do alvo):
  - `halt` — cancela a entrada viva (`cancelled`, `command`), liga `isHalted`; sinais continuam
    gravados, nenhuma entrada nova; a posição aberta mantém stop e alvo;
  - `resume` — desliga `isHalted` (o retorno depois de `halt`);
  - `exit_position` — cancela a entrada viva e cria venda a mercado para `t+1` (`exitReason: command`);
    sem posição, só cancela.

  Motivos: `goal_reached`, `goal_max_loss`, `goal_expired`, `user_stop`, `user_resume`, `kill_switch`,
  `window_end`. Cada comando aplicado vira `decisions.commands[]`; `commandId` repetido no mesmo passo é
  recusado. **O kill switch da spec 002 age FORA do motor** (cancela as ordens na corretora e desarma);
  o motor fica sabendo pelo relatório "posição fechada externamente" (abaixo), nunca por atalho.
- **Execução real (spec 002) — decisão.** O executor real roda a SUA instância do MESMO `step`, por
  usuário, alimentada por candles + sentimento + comandos + **relatórios da corretora**
  (`executionReports`: preenchimento, rejeição, posição fechada externamente), persistidos como fatos de
  entrada do passo. Isso mantém o passo puro, resolve a réplica (os relatórios gravados reproduzem o
  passo) e o sentimento mutável (a observação usada é imutável). Hoje só os tipos existem: o simulado
  não ignora relatório — recusa em voz alta (`EXECUTION_REPORTS_UNSUPPORTED`); o estado reserva `filledQuantity`
  para preenchimento parcial. A ordem real é chaveada por `run_id + engine_key`, com `clientOrderId`
  derivado dela (spec 002 plan §3).
- **`FillModel` e teste diferencial (T2.5).** `(strategy, run, walletState, candle, executionReports) →
  walletState' + ordens, preenchimentos, posições`. O simulado preenche pelo OHLC (§e); o real aplica os
  relatórios. O teste diferencial da T2.5 roda o `FillModel` de produção e o da referência com o mesmo
  fluxo de entradas e exige saída idêntica, byte a byte. "Sombra" (spec 002) é rodar os dois sobre as
  mesmas decisões e comparar.
- **Golden preso à `engineVersion`.** A T2.5 grava a saída do Placar clássico num período fixo como
  arquivo-dourado nomeado pela `engineVersion`; mudar a saída sem mudar a versão reprova, e mudar a
  versão exige gravar o novo dourado (é o gatilho da migração de §b).
- **Metas (`evaluateGoal`, RF13).** Sinais calculados uma vez por (versão, par) e uma carteira por janela
  (`walletStep`); a política da meta é função pura sobre o `equityPoint` (`equity` e `equityAtLow`) e
  injeta `exit_position`/`halt` no passo seguinte.
- **Voto de ML (fase posterior).** Novo `kind` com o hash do artefato do modelo na configuração; a
  previsão entra como o sentimento: dado externo com `observedAt ≤ closeTime`.

### Harness, referência e motores defeituosos

- `engine-contract.fixture.ts` — `runEngineContract({ createEngine, scenarios })` roda as 20 verificações
  de §g em cada cenário; `runEngineCheck` roda uma só. Cenários carregam `strategy`, `run`, `candles`,
  `sentiment` (observações, selecionadas por candle como o chamador real faz) e `commands` (por candle).
- `reference-engine.fixture.ts` (+ `reference-signal`, `reference-wallet`, `reference-fills`,
  `reference-sizing`, `reference-policy`) — motor de referência: compra em todo fechamento, vende quando o
  candle cai 3% ou mais da abertura, "ganância" (Fear & Greed fresco ≥ 80) segura a compra; implementa
  comandos e todo o modelo de §e. Passa o harness em sete cenários (`reference-scenarios.fixture.ts`):
  mercado com stop/gap/alvo; limitada com expiração e gap; caminhos de SELL, comandos e sentimento;
  recusas e participação no volume; preenchimentos de borda (toque no limite, 2º candle, alvo só tocado,
  gap acima do alvo, limitada no meio com a máxima além do alvo); entrada limitada pelo caixa; gap de alta
  na entrada seguido de stop.
- 26 motores defeituosos (`REFERENCE_ENGINE_DEFECT`), cada um reprovado pela verificação certa (tabela no
  teste, que também exige cobertura de todo o catálogo).
- `indicator-contract.fixture.ts` — `expectIndicatorContract` (aquecimento exato, convergência ≥
  aquecimento, lote = incremental, determinismo, retomada pelo snapshot), provado com uma média simples e
  três indicadores defeituosos.

## Revisão do arquiteto (T2.1b)

Veredito da revisão da T2.1 (commits `8b7d78b`, `c5c4961`, `6690202`): **aprovado com ajustes**. Cada
ajuste, a decisão e a prova:

| # | Ajuste | Decisão | Prova (mutante reprovado) |
|---|---|---|---|
| A1 | Tamanho pelo RF05 (a T2.1 dava ≈1,06% no stop) | Pendente guarda `riskAmount`; quantidade no preenchimento pelo risco por unidade com saída estimada no stop e as duas taxas, limitada por exposição, caixa e volume; desce até a perda realizada caber. Gap além do stop fica fora de "até o stop" | `realized-risk`: `SIZE_AT_DECISION`, `IGNORES_FEES_IN_SIZE` |
| A2 | Migração e persistência contraditórias | Migração = execução nova ligada (`migrated_from_run_id`), histórico imutável; ordem/posição por `DO UPDATE … WHERE` status monotônico; walk-forward com espaço de nome por janela e sinal único; backtest em lote; troca de versão com posição = `exit_position` + execução nova; réplica não reemite alerta (§b) | documental (plan §3); `restep-idempotent`: `RESTEP_NOT_IDEMPOTENT` |
| A3 | Sentimento com lookahead | `observedAt` = disponibilidade; `sentiment_observations` append-only (T3.1); sinal grava a observação; guarda de inteiro 0..100 finito; idade exata `> 48 h` | `no-lookahead` (sentimento futuro): `SENTIMENT_LOOKAHEAD`; mutações de `src` (NaN aceito, 48 h com `>=`, seleção do futuro) reprovadas |
| A4 | `execution`/`market` no hash da versão | `RunParameters` separado com `runHash` no estado; versão só com a lógica; `zod` exato e direto; hash-dourado literal; desvios do Bollinger em texto decimal | hash-dourado (mutação de default do Zod reprovada); teto 1e9 (mutação para 1e12 reprovada) |
| A5 | `IndicatorCandle` sem `open`/`openTime` | Acrescentados (VWAP) | teste do `toIndicatorCandle` |
| A6 | Recusa sem código | `EngineInputError.code` estável por recusa (tabela de §a) | `input-guards`: `ZERO_PRICE_ACCEPTED`; teste da guarda por código |
| R1 | Sanidade do candle e lacuna | Guarda de preço, corpo, volume e tempo com `CANDLE_INSANE`; lacuna só com `confirmedGapCandles` exato | `input-guards`; mutações de `src` (sanidade e lacuna desligadas) reprovadas |
| R2 | Preenchimento | Melhora de preço da limitada só no 1º candle elegível; stop a `min(stop, abertura) × (1 − s)`; `invalid_stop` quando `stop ≥ P × (1 − s)`; gap acima do alvo ao preço do alvo (texto corrigido); eventos com `quantity`, `price`, `triggerPrice`, saída protetora `created` + `filled` | `LIMIT_FILLS_ON_TOUCH`, `LIMIT_EXPIRES_OFF_BY_ONE` (`limit-orders`); `TARGET_ON_TOUCH`, `INTRA_CANDLE_LIMIT_TARGET` (`stop-before-target`); `GAP_TARGET_AT_OPEN` (`gap-beyond-stop`) |
| R3 | Teto de saldo e volume | `initialBalance ≤ 1e9` (`numeric(24,8)`); `maxVolumeShare` (1%): ordem reduzida, `filled` com `volume_capped` | cenário de recusas; mutação do teto reprovada |
| R4 | Invariantes no schema | Caixa ≥ 0, quantidade > 0, stop < entrada < alvo, campos por tipo de ordem, régua ⇔ aquecimento, decimal canônico | teste de estados quebrados; mutações de `src` (ordem stop/alvo, regex canônica, régua) reprovadas; `cash-non-negative`: `OVERSPENDS_CASH` |
| R5 | Comandos e execução real | `commandId`/`issuedAt`; `halt` cancela a viva, `resume` volta, `exit_position` cancela e vende; kill switch fora do motor; executor real roda o mesmo `step` com `executionReports` (tipos; referência recusa); spec 002 atualizada | `signal-policy`; teste de recusa de relatório |
| R6 | `signalStep` e `walletStep` | Estado em duas partes; `step` é a composição; `equityAtLow`; plan §5b corrigido | `step-composition`: `SPLIT_DIVERGES` |
| R7 | Indicadores | `convergenceCandles`; pré-aquecimento = máx(aquecimento, convergência) de todos; texto do fator 3× corrigido; implementação própria, `trading-signals` só oráculo; janelas recalculadas; ids com espaço de nome e achatados; ADX truncado no motivo | teste de convergência (mutações da fórmula e do pré-aquecimento reprovadas); `SHORT_CONVERGENCE` no harness de indicador |
| R8 | Harness | Perturbações múltiplas; sentimento e comandos no `runSteps`; checks novos; cenários de SELL, recusas e `halt`; paredes de pureza estendidas com sonda; teste diferencial e golden por versão descritos (§h) | `STOP_FROM_DECISION_CLOSE` (`protective-prices`), `IGNORES_OPPOSITE_SIGNAL` (`signal-policy`), os demais acima |

## Alternativas rejeitadas

| Alternativa | Por que não |
|---|---|
| Motor orientado a objeto com estado interno mutável | Retomada depende de serializar o objeto inteiro; estado escondido é o defeito `HIDDEN_STATE` |
| Um `step` monolítico, sem as metades | RF13 e walk-forward recalculariam os indicadores por carteira; o teste diferencial do `FillModel` ficaria sem costura |
| Calcular os indicadores em lote no backtest e incremental no ao vivo | Duas implementações divergem; constituição §5 |
| `trading-signals` (ou outra biblioteca) como indicador de produção | Usa `Math.pow`/`exp` e somatórios corridos; reprodução byte a byte entre runtimes deixa de ser garantida. Fica como oráculo nos testes |
| Retomar reaquecendo os indicadores com os últimos N candles | EMA tem memória infinita: quebra a paridade. Snapshot no estado; migração replica do início numa execução nova |
| Migrar reescrevendo as linhas da execução antiga | Mistura versões no histórico; a execução nova ligada preserva o que foi decidido |
| `ON CONFLICT DO NOTHING` para ordens e posições | Status nunca avançaria; `DO UPDATE` sem `WHERE` deixaria um evento atrasado regredir uma ordem terminal |
| Preencher a mercado no fechamento de `t` | Lookahead clássico (constituição §4) |
| Alvo antes do stop, ou "o que veio primeiro" pelo formato do candle | Sem dado intra-candle não se sabe a ordem; constituição §3 manda o lado pior |
| Gap abaixo do stop preenchendo no preço do stop | Otimista: a corretora executa o stop a mercado depois do gap |
| Limitada preenchendo no toque, ou com melhora de preço depois do 1º candle | Otimista: a fila é desconhecida e a ordem já estava no livro |
| Orçamento em USDT fixado em `t` com o fechamento de `t` | Taxas e slippage de saída ficavam fora e o gap distorcia: 1,06% de perda no stop contra 1% do RF05 |
| Lacuna para a frente aceita sem declaração | Ao vivo e backtest divergiriam sobre o que é lacuna (paridade) |
| `execution` e `market` dentro da versão | Contradiz RF07, RF13 e a spec 002 (filtros mudam) e multiplica versões |
| `multipleOf(0.1)` em float para os desvios do Bollinger | `0.3` não é múltiplo de `0.1` em binário |
| `number` para dinheiro; `Decimal` dentro do estado; hash sobre o JSON como enviado | Constituição §6; não é JSON; grafias equivalentes virariam versões diferentes |
| Venda a descoberto e várias posições por par | Fora do escopo (spot, RF05) |
| Teste de contrato vermelho como entrega | A T2.1 entrega o harness verde com uma referência que passa e mutantes que reprovam |

## Consequências

- T2.2 implementa cada indicador (implementação própria, `trading-signals` como oráculo) com
  `convergenceCandles` e o roda em `expectIndicatorContract`; T2.3 o voto, o regime e o motivo; T2.4 o
  tamanho e os tetos de §e; T2.5 o `FillModel` e o motor completo, que **precisa passar
  `runEngineContract`** nos cenários da referência e em cenários próprios com o Placar clássico, mais o
  teste diferencial e o golden por versão. A referência de teste não vira código de produção.
- T3.1 cria as colunas e tabelas de §a/§b/§d (`runs.engine_state`, `engine_version`, `run_parameters`,
  `run_hash`, `migrated_from_run_id`, `engine_key` em `orders` e `positions`, `signals.regime`,
  `signals.sentiment`, `equity_points.equity_at_low`, `run_commands`, `sentiment_observations`).
- T3.2 (backtest) e T4.1 (ao vivo) são laços sobre `step` com a persistência de §b; T4.2 (paridade)
  compara as duas execuções com os mesmos `leadInCandles` e as mesmas lacunas declaradas.
- Mudar a semântica do motor exige nova `engineVersion` e novo golden; execuções em curso migram (§b).
- `@cryptoada/strategy-engine` depende só de `decimal.js@10.6.0` e `zod@4.6.5`.

## Riscos e o que ficou para depois

| Risco / pendência | Tratamento |
|---|---|
| Restaurar indicadores do snapshot a cada passo custa | Snapshots pequenos; medir no RNF01 (T3.2); cache de instâncias por identidade de estado, com o harness verde. As metades já evitam recalcular sinais por carteira |
| Pré-aquecimento de 194 candles (ADX 14 encadeado) encurta o histórico útil do backtest | Esperado e correto; o chamador carrega os candles anteriores a `S` |
| Filtros da corretora mudam com o tempo | São `RunParameters`; a spec 002 confere contra o `exchangeInfo` antes de operar |
| Taxa em BNB ou cobrada no ativo comprado | Modelada em USDT nas duas pontas; a spec 002 reconcilia com a taxa reportada |
| Gap acima do alvo ao preço do alvo e participação no volume calibrados sem dado real | Reavaliar com a sombra da spec 002 |
| Atraso de publicação do Fear & Greed histórico (24 h) pode ser conservador demais | Configurável no cron; mudar gera observações novas (append-only, fonte distinta), nunca reescreve |
| Semântica de `executionReports` sem implementação | Tipos fixados; a spec 002 implementa e acrescenta cenários ao harness |
| Formato exato do texto de motivo | Fixado em §f; a T2.3 implementa e prende por tabela |
