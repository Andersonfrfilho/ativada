# ADR 0002 — Contrato do motor de estratégias

**Status:** aceito com ajustes (T2.1 proposto; revisão do `architect` aplicada na T2.1b — seção
"Revisão do arquiteto"; revisão da Fase 2 aplicada na T2.6 — seção "Revisão da Fase 2") · **Data:** 2026-10-10

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
| `wallet.processedCommandIds` | os últimos 64 `commandId` processados, do mais antigo ao mais novo, sem repetição: o `commandId` repetido num passo posterior é ignorado (§h) |
| `wallet.cash` | saldo em USDT (texto decimal, nunca negativo) |
| `wallet.position` | a posição aberta (no máximo uma, §e) com `entryPrice`, `quantity`, `stopPrice`, `targetPrice`, `entryFee` |
| `wallet.pendingOrder` | a ordem pendente (no máximo uma): entrada guarda o VALOR EM RISCO (`riskAmount`), distâncias, o volume do candle de decisão (`decisionVolume`, T2.4) e, se limitada, `limitPrice`/`eligibleCandles`; saída guarda `exitReason`; `filledQuantity` reserva o preenchimento parcial da execução real (no simulado é `"0"`) |
| `wallet.benchmark` | "comprar e segurar" (quantidade e sobra de caixa) |

O schema Zod do estado é estrito (`.strict()` em todo nível) e cobra os invariantes (R4): caixa ≥ 0;
quantidade > 0; `stop < entrada < alvo`; entrada compra e saída vende; limitada ⇔ `limitPrice` e
`eligibleCandles`; entrada ⇒ `riskAmount`, distâncias e `decisionVolume`, sem `exitReason`; saída ⇒ mercado com
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
| `signal` | `null` no aquecimento; depois, um por candle: `action`, `score`, `regime`, `votes[]` (`ruleId`, `family`, `vote`, `weight`, `isMissing`), `indicators` (ids com espaço de nome, achatados), `sentiment` (a observação usada, nula se ausente/velha), `reason` | `signals` (único por `run_id, candle_time`; a observação vai em `sentiment_observation jsonb`) |
| `commands[]` | comandos do passo: `commandId`, `kind`, `reason`, `issuedAt` e `status` (`applied`, ou `ignored_duplicate` quando o `commandId` já foi processado) | `run_commands` (único por `run_id, command_id`: o primeiro registro vale) |
| `orders[]` | eventos do ciclo de vida: `created`, `filled`, `cancelled`, `expired`, `rejected` (com `reason`), por `orderKey`; `price`/`quantity` só no `filled`; `triggerPrice` (stop/alvo) só nas saídas protetoras; `riskAmount`, `stopDistance`, `targetDistance`, `limitPrice`, `eligibleCandles` na entrada | `orders` (status monotônico) |
| `fills[]` | `orderKey`, `positionKey`, lado, `price`, `quantity`, `notional`, `fee` | `fills` (único por `run_id, order_key, candle_time`) |
| `openedPositions[]` / `closedPositions[]` | abertura (preço, quantidade, stop, alvo, taxa) e fechamento (preço de saída, taxas, `netProfit`, `exitReason`, inclusive `gap`) | `positions` (uma linha por `engine_key`, `open` → `closed`; o chamador junta abertura e fechamento) |
| `equityPoint` | `equity` e `benchmark` a valor de liquidação no fechamento, e `equityAtLow` (o vale do candle: o menor entre a posição que EXISTIU durante o candle valorada na mínima e o valor ao fim do passo, §e — perda máxima da meta e piso do RF09) | `equity_points` |

**Guarda de entrada (`assertStepInput`, `assertSignalStepInput`, `assertWalletStepInput`).** Recusa em voz
alta com `EngineInputError.code` estável — o chamador distingue "já processado, pule" de "entrada
errada, pare":

| Código | Quando |
|---|---|
| `CONFIG_HASH_MISMATCH` / `RUN_HASH_MISMATCH` | estado de outra versão da estratégia / de outros parâmetros, ou conteúdo que não bate com o hash declarado: o motor RECALCULA o SHA-256 canônico de `config` e de `parameters` (um por objeto: cache em `WeakMap`, não um por passo) no `step` e no `walletStep` avulso |
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

O `step` também recusa, com `EngineStateError(invalid_state)`, o estado em que `signal.lastCandleOpenTime` difere de
`wallet.lastCandleOpenTime` (as metades andam juntas; antes só o `validateEngineState` conferia).

**Lacuna.** O ao vivo só avança sobre uma lacuna CONFIRMADA (o worker já tentou o REST e a Binance não
tem o candle — `unfillable`); o backtest declara a mesma lacuna ao ler o banco. Sem a declaração exata,
o motor recusa: um candle que só "ainda não chegou" nunca vira lacuna no ao vivo e lacuna no backtest
(paridade). Validade de limitada e aquecimento contam candles processados, não horas.

**O que a carteira faz numa lacuna confirmada** (T2.6, §e). Não sabemos o que aconteceu nos candles ausentes, então a
lacuna nunca é boa notícia: com posição aberta o stop é assumido TOCADO e a posição sai na abertura do candle
seguinte à lacuna; as ordens pendentes caducam; nenhuma entrada nasce nesse candle.

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
| `sentimentSource` | texto de 1 a 64 caracteres: a fonte das observações de sentimento que a execução lê (§f); entra no `runHash` | obrigatório |
| `initialBalance` | [10, 10⁹], no máximo 8 casas — `numeric(24,8)` guarda 16 dígitos inteiros; 10⁹ deixa folga para quantidade × preço e taxa sem estourar a coluna | 10 000 |
| `feeRate` / `slippageRate` | [0, 1%] / [0, 5%], no máximo 8 casas | 0,1% / 0,05% |
| `tickSize`, `quantityStep`, `minNotional` | filtros da corretora, no máximo 8 casas (o dinheiro é `numeric(24,8)` e a carteira mede 8) | 0,01 / 0,00001 / 5 (BTCUSDT) |
| `maxVolumeShare` | (0, 1] | 1% |

Saldo, taxa e slippage são entrada do backtest (RF07); cada par de uma meta tem valor fictício próprio
(RF13); os filtros mudam na corretora (spec 002) — nada disso muda a versão da estratégia.

- **Tipos.** Todo valor não inteiro que entra em conta de dinheiro ou de pontuação é **texto decimal**
  (`"0.001"`, sem expoente nem vírgula; até 18 dígitos inteiros e 12 decimais, exceto dinheiro, taxas e filtros da
  corretora, que têm no máximo 8), devolvido canônico.
  Parâmetros de indicador são `number`, exceto os desvios do Bollinger: **texto decimal com uma casa**
  (`"2.3"`), porque `multipleOf(0.1)` em float recusaria `0.3`.
- **Hashes.** `hashStrategyConfig` e `hashRunParameters` = SHA-256 hexadecimal do JSON canônico do valor
  **reparseado** (defaults preenchidos, decimais canônicos, chaves ordenadas). Grafias equivalentes,
  ordem de chaves e defaults omitidos dão o mesmo hash; qualquer mudança de significado dá outro. O
  estado guarda os dois (`configHash`, `runHash`). `strategy_versions` ganha linha nova só quando o
  `configHash` difere; `runs` guarda `run_parameters jsonb` e `run_hash`. O hash declarado em `StrategyVersion` e
  `RunSetup` não é confiado: o motor o recalcula (T2.6) e recusa o rótulo que não bate com o conteúdo.
- **Zod fixo.** O hash depende da semântica do Zod (defaults, transformações): `zod` é dependência direta
  em versão **exata** (4.6.5, a mesma resolvida no repositório), e um teste de **hash-dourado literal**
  (Placar clássico, configuração mínima com o JSON canônico literal, parâmetros de exemplo e mínimos)
  avisa se uma atualização mudar o hash.
- **Evolução do schema.** `schemaVersion: 2` nascerá como outro membro aceito, com `upgrade(v1) → v2`;
  versões antigas continuam parseáveis para sempre.
- **Sentimento no backtest (T2.6, desenho da T3.1).** O corte de inserção `createdAt <= insertionCutoff` compara com o
  instante em que a observação ficaria conhecida. Numa carga histórica `sentiment_observations.created_at` é o
  instante ESTIMADO de publicação (data do dado + atraso de publicação conservador), NUNCA o horário da carga: com o
  horário da carga, `createdAt <= início da execução` não selecionaria nada num histórico recarregado hoje. O
  `insertionCutoff` do backtest é o fechamento do candle (o ao vivo grava `created_at` = `observed_at`).
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
| Tamanho (preenchimento em `t+1`, preço `P`) | `stop = tickDown(P − stopDistance)`; saída estimada `X = tickDown(stop × (1 − s))`; `quantidade = stepDown(riskAmount ÷ (P − X + P·feeRate + X·feeRate))`, depois limitada por exposição `stepDown(patrimônio × maxExposureRate ÷ P)`, caixa `stepDown((caixa − 2u) ÷ (1 + feeRate) ÷ P)` e participação no volume de `t`; a quantidade é o menor dos tetos. Não há laço de ajuste: a **folga de arredondamento** (`u = 1e-8`; débito soma 2 arredondamentos, perda soma 4) é descontada ANTES de dividir (`(riskAmount − 4u) ÷ …`), o que prova perda < `riskAmount` e débito < caixa com as regras do preenchimento. Implementado em `risk/` (T2.4, abaixo) |
| "Até o stop" | A perda realizada numa saída pelo stop **sem gap** nunca passa de `riskPerTrade × saldo` (taxas e slippage de saída inclusos) — check `realized-risk`. O risco de **gap além do stop** fica fora de "até o stop": abertura abaixo do stop sai na abertura, pior |
| Participação no volume (R3) | `quantidade ≤ stepDown(volume(t) × maxVolumeShare)`, com `t` o candle de **decisão**: o volume de `k` é desconhecido na abertura e o executor real não o tem (por isso a ordem guarda `decisionVolume`). O excesso não preenche: a ordem é **reduzida**, preenche como `filled` com `reason: volume_capped` |
| Recusas | ATR ausente ou ≤ 0 ⇒ `rejected` (`zero_atr`) na decisão, sem pendente; `riskAmount` zero ⇒ `rejected` (`below_min_notional`); no preenchimento, `stop ≤ 0` ou `stop ≥ P × (1 − s)` ⇒ `rejected` (`invalid_stop`); `quantidade × P < minNotional` ⇒ `rejected` (`below_min_notional`) |
| Stop e alvo | Calculados **no preenchimento**, do preço `P` com as distâncias do ATR de `t`: `stop = tickDown(P − stopDistance)`, `alvo = tickUp(P + targetDistance)`. Nenhum dado do futuro; o check `protective-prices` confere |
| Saída no stop | Em qualquer candle: `tickDown(min(stop, abertura) × (1 − s))`. `mínima ≤ stop` (no toque) dispara; abertura ≤ stop (gap) sai na abertura, pior que o stop |
| Saída no alvo | `máxima > alvo` (precisa passar) sai ao preço do alvo, sem slippage. **Gap acima do alvo** (`abertura > alvo`, posição vinda de antes) também sai ao preço do alvo: é o comportamento de uma ordem de alvo que está no livro (preenche no preço dela), não pessimismo |
| Stop e alvo no mesmo candle | **Vale o stop** (constituição §3) |
| Candle de entrada | A posição aberta na abertura é avaliada contra stop e alvo no próprio candle. A limitada preenchida **no meio** do candle é avaliada só contra o stop: a máxima pode ter acontecido antes do preenchimento |
| Patrimônio | `caixa + floor8(q × tickDown(preço × (1 − s))) − taxa` no fechamento (`equity`); a régua "comprar e segurar" usa a mesma fórmula no fechamento, comprada com todo o saldo na abertura seguinte ao primeiro sinal |
| Vale do candle (`equityAtLow`, T2.6) | `min( valoração na mínima do candle com a posição que EXISTIU durante o candle, equity ao fim do passo )`. A ordem dos extremos dentro do candle é desconhecida, então vale o lado pior. **Contam**: a posição aberta antes do candle e ainda aberta ao fim; a que sai pelo ALVO no candle (valorada na mínima, com o caixa de ANTES da venda); a entrada a mercado preenchida na abertura e a limitada preenchida no meio do candle. **Não contam**: a posição que sai por ordem PENDENTE na abertura (sai antes da mínima), por STOP (o patrimônio mínimo observável é o da saída no preço do stop, que já é o valor de fechamento do passo) ou pela lacuna (sai na abertura). Sem posição que conte, `equityAtLow = equity` |
| Lacuna confirmada (T2.6) | `confirmedGapCandles > 0`: as ordens pendentes (entrada, saída, limitadas) são CANCELADAS (`cancelled`, `reason: gap`); com posição aberta o stop é assumido tocado e ela fecha na ABERTURA do candle pós-lacuna a `tickDown(min(stop, abertura) × (1 − s))` (`exitReason: gap`, taxa normal; ordem de mercado `created` + `filled`, `reason: gap`); nenhuma entrada nova nesse candle (o `BUY` fica gravado no sinal). O alvo NÃO é honrado através da lacuna: o pior caso vale |

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
`BUY` no fechamento de `k` pode criar nova entrada para `k+1`. Exceções que suprimem a entrada nova: o candle
pós-lacuna (acima) e o candle de um `halt` ou `exit_position` aplicado (§h).

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

**Fonte, corte de inserção e paridade (T2.3).** A fonte é parâmetro da execução
(`RunParameters.sentimentSource`, dentro do `runHash`): trocá-la é outra execução, nunca a mesma com
resultado diferente. O chamador seleciona com `selectAvailableSentiment({ observations, closeTime, source,
insertionCutoff })`, que só considera linhas da `source` da execução, com `createdAt ≤ insertionCutoff`
(o início da execução no backtest: uma linha gravada depois — histórico reescrito, atraso novo — nunca muda
um resultado já calculado) e `observedAt ≤ closeTime`; o `createdAt` fica fora do que o motor recebe. O
`signalStep` repete a defesa: observação de outra fonte nunca vota (dado ausente). **Regra de paridade: o
backtest usa a fonte coletada AO VIVO quando ela existir para o período, e a fonte histórica (data + atraso
de publicação) só onde faltar**, para que o backtest veja o que o ao vivo viu; cada uma é uma `source`
distinta, então a escolha fica registrada no `runHash`.

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

### f2) Votos, placar e motivo — como a T2.3 fixou (T2.3)

- **Votos estritos.** Só `−1`, `0` ou `+1`; comparações `>`/`<` em `number`, empate vota `0`. Donchian: o
  valor corrente do indicador inclui o candle atual, então o rompimento compara o fechamento com o canal do
  candle ANTERIOR, guardado no estado ao lado do snapshot (`previous:rule:<id>`); por isso o aquecimento da
  regra conta um candle a mais (`period + 1`, em `collectIndicatorHorizons`). RSI: `< oversold` compra,
  `> overbought` vende (platô = 50 ⇒ 0). Bollinger: fecha abaixo da inferior compra, acima da superior vende.
  OBV: acima da EMA compra. Fear & Greed: `≤ fearAtOrBelow` compra, `≥ greedAtOrAbove` vende (inclusivos).
- **Antes do aquecimento o passo não decide**: `signal: null` (o `HOLD` aqui seria uma linha em `signals`
  que o contrato proíbe — `firstSignalCandleOpenTime` e a régua nascem com o primeiro sinal). Depois do
  aquecimento, indicador sem valor (de regra, ATR ou ADX) é `IndicatorError` com código `MISSING_VALUE`; só o
  sentimento pode faltar.
- **Regime.** `adx >= trendThreshold` (inclusivo) ⇒ `trending`; senão `ranging`; sem filtro, `none` e todo
  peso `1`. O ADX vem do fechamento corrente (nunca do seguinte).
- **Pontuação.** Soma de `voto × peso(família, regime)` em `decimal.js`, texto canônico. `BUY` se
  `score ≥ buy`; `SELL` se `score ≤ sell`; senão `HOLD`. Limiares inclusivos; as faixas não se sobrepõem
  (`buy > 0 > sell` no schema). Empate (votos de sinais opostos que se anulam, soma `0`) é `HOLD`.
- **Indicadores gravados** (`signal.indicators`): `rule:<id>` (achatado: `rule:macd-12-26-9.signal`),
  `risk:atr` e `regime:adx.adx` / `.minusDi` / `.plusDi` (o ADX tem três saídas, então segue o
  achatamento); a regra de sentimento grava o valor usado ou `null`.
- **Motivo.** `<Ação> · pontuação <±N> · <regime> · compra: … · venda: … · neutras: …[ · sem dado: …]`,
  `Ação ∈ {Compra, Venda, Neutro}`, pontuação com sinal explícito quando positiva (`+2.5`, `0`, `-1.5`),
  ponto decimal, regras na ordem da configuração separadas por `, `, lista vazia = `nenhuma`; a regra sem
  dado aparece só em `sem dado`. ADX truncado em uma casa por `formatTruncatedAdx` (24,96 ⇒ `24.9`).
  Sem `toLocale*`, `Intl` nem relógio.
- **`SIGNAL_ENGINE_VERSION = 'signal-2'`** (era `signal-1` na T2.3; a T2.5 acrescentou `configHash` e
  `confirmedGapCandles` ao `SignalDecision`) prende o dourado do Placar clássico
  (`test/fixtures/strategy-engine/golden/classic-scoreboard-signals.signal-2.json`): saída diferente sem
  trocar a versão reprova; trocar a versão exige gravar o novo dourado. A T2.5 integra a versão à
  `engineVersion` do motor completo.
- **Prova** (T2.3): tabela de cenários escrita à mão (`scoreboard-scenarios`), tabela de votos por tipo,
  regime, peso e ADX exibido (`rule-cases`), seleção de sentimento (`selection-cases`),
  `runSignalContract` (determinismo, imutabilidade, serialização, carimbo, sem lookahead — candles ×1,37,
  ×0,63, constante, permutados e sentimento futuro —, retomada do estado serializado em todo corte e lotes
  de 2/3/5/7) e o ponta a ponta nos dois conjuntos reais (BTCUSDT 1h × 500: 307 decididos, 113 `BUY`, 57
  `SELL`, 137 `HOLD`; ETHUSDT 1d × 400: 207 decididos, 60 `BUY`, 67 `SELL`, 80 `HOLD`; nenhum antes do
  candle 194).

| Mutante (mutação de UMA expressão numa cópia do `src`) | Quem o reprova primeiro |
|---|---|
| `THRESHOLD_EXCLUSIVE` / `_SELL` (`≥`→`>`, `≤`→`<` nos limiares) | tabela de cenários (score exatamente em ±2) |
| `WEIGHTS_SWAPPED` (pesos de tendência e lateral trocados) | tabela de regime e peso |
| `SENTIMENT_STALE_ACCEPTED` (48 h + 1 ms vota) | tabela de cenários |
| `SENTIMENT_WRONG_SOURCE` (outra fonte vota) | tabela de cenários |
| `ADX_ROUNDED_UP` (24,96 ⇒ `25.0`) | tabela de ADX exibido |
| `HOLD_BEFORE_WARMUP_MISSING` (sem a guarda de aquecimento: o passo vota antes dele) | contrato (`completes`: `MISSING_VALUE`) |
| `WARMUP_ONE_CANDLE_LATE` (`<` → `<=`) | contrato (`timing`) |
| `DONCHIAN_WITHOUT_EXTRA_CANDLE`, `DONCHIAN_PREVIOUS_NOT_STORED`, `SNAPSHOT_NOT_SAVED` | contrato (`completes`) |
| `DONCHIAN_USES_CURRENT_CHANNEL`, `RSI_AT_OVERSOLD_BUYS`, `EQUAL_AVERAGES_BUY`, `FEAR_NOT_CONTRARIAN`, `MISSING_SENTIMENT_NOT_FLAGGED`, `REGIME_THRESHOLD_EXCLUSIVE` | tabela de votos/regime |
| `SELECTOR_IGNORES_SOURCE`, `SELECTOR_IGNORES_INSERTION_CUTOFF`, `SELECTOR_ACCEPTS_FUTURE_OBSERVATION` | tabela de seleção |
| `VOTE_LOOKAHEAD`, `REGIME_ON_FUTURE_ADX` (decisão do candle `t-1` refeita com o fechamento ou o ADX de `t`) | contrato (`timing`); a verificação `no-lookahead` sozinha também os reprova |

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
| `signal-policy` | A tabela de sinais e comandos de §e/§h no fechamento de cada candle, incluindo a supressão de entrada por `halt`/`exit_position` e o `commandId` repetido ignorado |
| `gap-policy` | Numa lacuna confirmada a posição aberta sai pela fórmula da lacuna, a pendente caduca com motivo `gap` e nenhuma entrada nasce (T2.6) |
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

  `exit_position` e `halt` aplicados SUPRIMEM qualquer entrada nova no candle deles (mesmo um `BUY` no mesmo
  fechamento, mesmo um `resume` depois do `halt` no mesmo passo). O `commandId` é idempotente ENTRE passos: a
  carteira guarda os últimos 64 (`wallet.processedCommandIds`); o repetido num passo posterior é ignorado, sem
  efeito nenhum, e sai em `decisions.commands[]` com `status: ignored_duplicate`. Fora da janela de 64, o
  identificador volta a ser aplicável (limite assumido).

  Motivos: `goal_reached`, `goal_max_loss`, `goal_expired`, `user_stop`, `user_resume`, `kill_switch`,
  `window_end`. Cada comando vira `decisions.commands[]` (`status` `applied` ou `ignored_duplicate`); `commandId` repetido no
  mesmo passo é recusado. **O kill switch da spec 002 age FORA do motor** (cancela as ordens na corretora e desarma);
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

- `engine-contract.fixture.ts` — `runEngineContract({ createEngine, scenarios })` roda as 21 verificações
  de §g em cada cenário (a 21ª, `gap-policy`, entrou na T2.6); `runEngineCheck` roda uma só. Cenários carregam `strategy`, `run`, `candles`,
  `sentiment` (observações, selecionadas por candle como o chamador real faz) e `commands` (por candle).
- `reference-engine.fixture.ts` (+ `reference-signal`, `reference-wallet`, `reference-fills`,
  `reference-sizing`, `reference-policy`) — motor de referência: compra em todo fechamento, vende quando o
  candle cai 3% ou mais da abertura, "ganância" (Fear & Greed fresco ≥ 80) segura a compra; implementa
  comandos e todo o modelo de §e. Passa o harness em dez cenários (`reference-scenarios.fixture.ts`; os três últimos são da T2.6: `exit_position` na carteira livre e duas lacunas, uma com posição aberta e outra com a limitada viva):
  mercado com stop/gap/alvo; limitada com expiração e gap; caminhos de SELL, comandos e sentimento;
  recusas e participação no volume; preenchimentos de borda (toque no limite, 2º candle, alvo só tocado,
  gap acima do alvo, limitada no meio com a máxima além do alvo); entrada limitada pelo caixa; gap de alta
  na entrada seguido de stop.
- 33 motores defeituosos (`REFERENCE_ENGINE_DEFECT`; 27 da T2.1 e 6 da T2.6: vale ignorando a posição que saiu,
  vale contando o stop, lacuna que mantém a posição, lacuna que mantém a pendente, `exit_position` que deixa
  entrar, comando repetido reaplicado), cada um reprovado pela verificação certa (tabela no teste, que também
  exige cobertura de todo o catálogo).
- **Cortes amostrados (T2.6).** `no-lookahead` e `resume` reexecutam o cenário por corte (O(n²)). Por padrão cortam
  onde o motor decide algo (os 3 primeiros candles, as bordas do pré-aquecimento, todo candle com sinal não-`HOLD`,
  ordem, preenchimento ou comando, e ~8 índices espaçados) e a execução perturbada para 3 candles depois do corte
  (só o prefixo é comparado; o horizonte existe para pegar o defeito que carimba no passado). `FULL_CONTRACT=1`
  (`make contract-full`, `bun run test:full`) roda todo corte, sem truncar. O poder de detecção é o mesmo:
  os 33 defeitos e os 51 mutantes de produção continuam reprovados na versão amostrada.
- `indicator-contract.fixture.ts` — `expectIndicatorContract` (aquecimento exato, convergência ≥
  aquecimento, lote = incremental, determinismo, retomada pelo snapshot), provado com uma média simples e
  três indicadores defeituosos.

## Revisão do arquiteto (T2.1b)

Veredito da revisão da T2.1 (commits `8b7d78b`, `c5c4961`, `6690202`): **aprovado com ajustes**. Cada
ajuste, a decisão e a prova:

| # | Ajuste | Decisão | Prova (mutante reprovado) |
|---|---|---|---|
| A1 | Tamanho pelo RF05 (a T2.1 dava ≈1,06% no stop) | Pendente guarda `riskAmount`; quantidade no preenchimento pelo risco por unidade com saída estimada no stop e as duas taxas, limitada por exposição, caixa e volume; a T2.4 trocou o ajuste passo a passo pela folga de arredondamento descontada antes de dividir. Gap além do stop fica fora de "até o stop" | `realized-risk`: `SIZE_AT_DECISION`, `IGNORES_FEES_IN_SIZE`, `VOLUME_OF_FILL_CANDLE` (T2.4) |
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

## Indicadores — convenções e tolerâncias (T2.2)

Escrito **antes** de implementar; os testes e o código seguem este texto, não o contrário.

### Oráculos e ferramentas

- **Verdade numérica:** implementação de referência em `decimal.js` (precisão 40, só `+ − × ÷ sqrt`,
  sem `exp/log`), em `test/fixtures/strategy-engine/oracle/`. Recebe o **texto** dos preços da
  Binance (decimais exatos), não os `number`: o erro medido inclui a conversão para `number`. É
  escrita em lote a partir de textbook (cada valor recalculado do histórico), de forma independente do
  código incremental de `src`.
- **Referência externa:** `trading-signals` **8.3.0**, devDependency de versão exata só em
  `packages/strategy-engine`. Conferido em 2026-10-10: licença MIT, última versão publicada em
  2026-08-11 (mantida; 8.x lançada em julho/2026), tipos próprios (`dist/index.d.ts`), **zero
  dependências**, ESM, e roda no Bun 1.3.14 (RSI de 3 períodos conferido à mão no teste). Nunca é
  importada por `src`: o teste de fronteira continua só com `decimal.js` e `zod` em `dependencies`.
- **Séries:** BTCUSDT 1h × 500 e ETHUSDT 1d × 400 (reais, `market/`), mais uma série sintética
  determinística (platô, gap, volume zero, subida e queda monótonas) para as bordas.
- **Conferência à mão:** SMA(3), EMA(3), RSI(3), ATR(3), OBV e Donchian(3) numa janela de 6 candles,
  com os números escritos no teste.

### Regras comuns

- **Entrada.** Todo campo do `IndicatorCandle` precisa ser `number` finito (`openTime`: inteiro
  seguro ≥ 0). Campo ausente, `NaN` ou `±Infinity` ⇒ `IndicatorError` com
  `code: INVALID_CANDLE`, **nunca** um `NaN` que atravessa. Período não inteiro ou < 1,
  `fast ≥ slow` no MACD e desvio ≤ 0 no Bollinger ⇒ `INVALID_PARAMETER`. Snapshot que não tem o
  formato esperado ⇒ `INVALID_SNAPSHOT`.
- **Saída.** Sempre finita. `-0` vira `0` (valor e snapshot). Saída com várias grandezas é um objeto
  de chaves fixas, achatado pelo registro do sinal (§c).
- **Janelas finitas** (SMA, Donchian, Bollinger, z-score) guardam os últimos `n` valores no
  snapshot e **recalculam** a soma, o máximo, o mínimo e o desvio a cada candle — nunca
  `soma += novo − velho`. Acumulados sem janela (OBV) e a semente de uma suavização (soma única das
  `n` primeiras entradas, feita uma vez) são os únicos somatórios.
- **Suavização com semente.** EMA (`α = 2/(n+1)`) e Wilder (`α = 1/n`) usam a **mesma** recursão
  `y = y₋₁ + α·(x − y₋₁)`, semeada pela **média simples das `n` primeiras entradas** (o valor sai no
  `n`-ésimo). Escolha única para as duas: é a convenção de livro (Wilder; TA-Lib) e dá ao primeiro
  valor um significado (a média das `n` entradas reais, sem peso residual de um único candle).
  Alternativa rejeitada: semear a EMA pelo primeiro valor, como faz a `trading-signals`
  (`previous ?? price`): o primeiro valor "válido" carregaria ≈ 13% de peso de um candle só. A
  diferença de semente decai por `(1 − α)^k`; o teste contra a `trading-signals` (a) alinha a
  semente (alimenta o `EMA` da biblioteca com a `SMA` dela) e prova igualdade exata e (b) prova a
  equivalência da convenção original depois de `n + ⌈(n+1)/2·ln(10⁸)⌉` candles.
- **Convergência** como no §c: `EMA(n) = ⌈(n+1)/2·ln(1/ε)⌉`, `Wilder(n) = ⌈n·ln(1/ε)⌉`, ε = 1e-3,
  constante `LN_INVERSE_CONVERGENCE_EPSILON`; encadeado soma. Sempre `convergência ≥ aquecimento`.

### Tabela por indicador

`n` = período. Saídas entre chaves. "Aquec." = `warmupCandles`; "Conv." = `convergenceCandles`.

| Indicador | Convenção exata | Aquec. | Conv. |
|---|---|---|---|
| SMA(n) | média dos últimos `n` fechamentos | `n` | `n` |
| EMA(n) | `α = 2/(n+1)`; semente = SMA das `n` primeiras | `n` | `EMA(n)` |
| MACD(f, s, g) `{macd, signal, histogram}` | `macd = EMA(f) − EMA(s)` (cada EMA corre desde o 1º candle, semeada no seu `n`-ésimo); `signal` = EMA(g) **dos valores do `macd`**, semeada pela SMA dos `g` primeiros; `histogram = macd − signal`; exige `f < s` | `s + g − 1` | `EMA(s) + EMA(g)` |
| Donchian(n) `{upper, lower}` | maior máxima e menor mínima dos últimos `n` candles, **incluindo o corrente**. A regra de rompimento (T2.3) compara o fechamento com o valor do candle **anterior** (os `n` candles anteriores) | `n` | `n` |
| RSI(n) | variação do fechamento; `ganho = max(Δ,0)`, `perda = max(−Δ,0)`; médias de Wilder semeadas pela SMA dos `n` primeiros ganhos/perdas; `RSI = 100 − 100/(1 + ganhoMédio/perdaMédio)` | `n + 1` | `Wilder(n)` |
| Bollinger(n, k) `{lower, middle, upper, width}` | `middle` = SMA(n); desvio **populacional** (divisor `n`, igual ao do TA-Lib e da `trading-signals`) dos mesmos `n` fechamentos, em duas passagens (média, depois soma dos quadrados); `upper/lower = middle ± k·desvio`; `width = (upper − lower)/middle` | `n` | `n` |
| z-score(n) | `(fechamento − média)/desvio` na janela de `n` (inclui o corrente), **desvio populacional** (o mesmo do Bollinger) | `n` | `n` |
| VWAP `{vwap}` → número | sessão = dia UTC de `openTime` (`⌊openTime / 86 400 000⌋`); preço típico `(máx + mín + fechamento)/3`; `Σ(típico·volume)/Σvolume` recalculado sobre os candles da sessão; reinicia quando o dia muda | 1 | 1 |
| OBV | acumulado: `+volume` se o fechamento sobe, `−volume` se cai, `0` se igual; o 1º candle vale `0` (sem anterior). O **nível** depende do candle em que a série começa — só a diferença e médias dele (regra `obv_trend`) têm significado | 1 | 1 |
| ATR(n) | `TR₁ = máx − mín`; `TRₜ = máx(máx − mín, \|máx − fechₜ₋₁\|, \|mín − fechₜ₋₁\|)`; Wilder semeado pela SMA dos `n` primeiros `TR` (o `TR₁` entra) | `n` | `Wilder(n)` |
| ADX(n) `{adx, plusDi, minusDi}` | `+DM = alta` se `alta > baixa` e `alta > 0`, senão `0` (`alta = máxₜ − máxₜ₋₁`, `baixa = mínₜ₋₁ − mínₜ`); `−DM` simétrico; **no 1º candle `+DM = −DM = 0`** (sem anterior), como a `trading-signals`; `TR`, `+DM` e `−DM` suavizados por Wilder (semente SMA das `n` primeiras, o 1º candle entra); `±DI = 100·DM suavizado/TR suavizado`; `DX = 100·\|+DI − −DI\|/(+DI + −DI)`; `ADX` = Wilder dos `DX`, semeado pela SMA dos `n` primeiros `DX` (**a segunda suavização**) | `2n − 1` | `2·Wilder(n)` |
| `ema_cross(f, s)` `{fast, slow}` (composto da regra) | duas EMAs; sai quando a lenta sai | `s` | `EMA(s)` |
| `obv_trend(g)` `{obv, ema}` (composto da regra) | OBV e a EMA(g) **do OBV** (semente SMA dos `g` primeiros OBV) | `g` | `EMA(g)` |

Valores de exemplo (ε = 1e-3): MACD 12/26/9 ⇒ aquec. 34, conv. 94 + 35 = 129; ADX 14 ⇒ aquec. 27,
conv. 97 + 97 = 194; RSI 14 ⇒ aquec. 15, conv. 97; ATR 14 ⇒ aquec. 14, conv. 97. O pré-aquecimento do
Placar clássico (EMA 21, MACD, RSI, OBV×EMA 20, ATR e ADX 14) é **194**, o do ADX.

### Bordas

| Caso | Resultado |
|---|---|
| RSI sem perdas (`perdaMédia = 0`, `ganhoMédia > 0`) | `100` |
| RSI sem ganhos (`ganhoMédia = 0`, `perdaMédia > 0`) | `0` |
| RSI sem ganhos **e** sem perdas (platô) | `50` (neutro). A `trading-signals` devolve `100`; um mercado parado não pode votar "sobrecomprado", então esta é a única diferença declarada e o platô só é comparado com o oráculo de alta precisão |
| Bollinger/z-score com desvio `0` | desvio `0`, bandas = média, `width = 0`, z-score `0` |
| `middle = 0` no Bollinger | `width = 0` (preço positivo nunca chega aqui; o indicador não divide por zero) |
| ATR com `TR = 0` na janela inteira | `0` |
| ADX/DI com `TR` suavizado `0` | `+DI = −DI = 0` |
| ADX com `+DI + −DI = 0` | `DX = 0` (e `ADX` segue a suavização) |
| VWAP com volume zero na sessão (`Σvolume = 0`) | preço típico do candle corrente; candle de volume zero não pesa depois que entra volume |
| OBV com fechamento igual | acumulado inalterado |
| Donchian com `n = 1` | `upper = máxima` e `lower = mínima` do candle |
| `-0` | normalizado para `0` |

### Tolerâncias

Declaradas antes de implementar. **Erro relativo** `|obtido − referência| / máx(|referência|, piso)`,
com `0/0 = 0`.

| Alvo | Tolerância | Piso |
|---|---|---|
| Todo indicador × oráculo de alta precisão, **todo candle depois do aquecimento**, 3 séries | `1e-8` | `0`, exceto: `macd`, `signal`, `histogram` (piso = `\|fechamento\|` do candle), z-score (piso `1`) e OBV (piso = volume total acumulado) |
| Todo indicador × `trading-signals` com convenção alinhada | `1e-8` | idem |
| EMA e MACD × `trading-signals` nativa (semente diferente) | `1e-8` a partir de `aquecimento + ⌈(n+1)/2·ln(10⁸)⌉` por etapa encadeada | idem |

O piso existe porque `macd`, `signal`, `histogram`, z-score e OBV cruzam o zero: o erro absoluto é do
tamanho do `ε` de máquina vezes o operando (≈ 1e-11 num preço de 1e5), e dividi-lo por um valor
próximo de zero mediria cancelamento, não erro. Nenhum valor maior que `1e-8` é aceito; o erro
medido de cada indicador entra no relatório da task.

### Erro medido (T2.2)

Maior erro relativo contra o oráculo de alta precisão, em **todos** os candles depois do aquecimento
das 7 séries (BTCUSDT 1h × 500, ETHUSDT 1d × 400 e as 5 de borda), e contra a `trading-signals` com
convenção alinhada nas 2 séries reais. Tolerância declarada: `1e-8`.

| Indicador | Aquec. | Conv. | Erro × oráculo de alta precisão | Erro × `trading-signals` |
|---|---|---|---|---|
| SMA(20) | 20 | 20 | 5.7e-16 | 0 |
| EMA(21) | 21 | 76 | 4.5e-16 | 9.4e-16 |
| MACD(12, 26, 9) | 34 | 129 | 4.7e-16 | 7.7e-16 |
| Donchian(20) | 20 | 20 | 0 | 0 |
| RSI(14) | 15 | 97 | 8.8e-15 | 6.9e-16 |
| Bollinger(20, 2.3) | 20 | 20 | 2.0e-14 | 0 |
| z-score(20) | 20 | 20 | 1.4e-13 | 0 |
| VWAP | 1 | 1 | 4.6e-16 | 0 |
| OBV | 1 | 1 | 1.0e-16 | 0 |
| ATR(14) | 14 | 97 | 4.9e-15 | 0 |
| ADX(14) | 27 | 194 | 3.4e-14 | 5.4e-16 |
| `ema_cross(9, 21)` | 21 | 76 | 4.5e-16 | 9.4e-16 |
| `obv_trend(20)` | 20 | 73 | 1.6e-16 | — |

Convergência medida (diferença relativa máxima entre uma execução que começa `k` candles depois e a
de histórico longo, nas duas séries reais e `k` ∈ {17, 61, 130}, contado a partir do horizonte
declarado de cada indicador): EMA 2.4e-4, MACD 2.4e-5, RSI **9.9e-4**, ATR 4.9e-4, ADX 1.4e-5 — todos
abaixo de ε = 1e-3 (o RSI com folga de 1%: o horizonte `n·ln(1/ε)` é justo, não generoso). Com o antigo
fator de 3 × o aquecimento, RSI, ATR e ADX ficam acima de 1e-3 (até 7.3e-2, 2.9e-2 e 5.6e-2); a EMA e o
MACD passavam. O pré-aquecimento conjunto do Placar clássico (194) cobre os cinco.

### Prova das mutações

Cada mutação de `src` foi aplicada à mão, reprovou algum teste e foi revertida:

| Mutação | Teste que reprova (o primeiro) |
|---|---|
| Semente do Wilder errada (último valor no lugar da média) | `indicator atr > BTCUSDT 1h × 500: stays within 1e-8 of the high-precision oracle` (23 falhas: ATR, ADX, RSI) |
| `n` por `n − 1` na janela | Donchian: `passes the indicator contract` e o oráculo; Bollinger: `Bollinger(3, 2) uses the population deviation`; SMA: `passes the indicator contract` |
| ADX sem a segunda suavização | `indicator adx > BTCUSDT 1h × 500: passes the indicator contract` (aquecimento) e o oráculo |
| RSI com média simples | `values worked out on paper … RSI(3) = 100, 800/11, 1600/31` e o oráculo do RSI |
| VWAP sem reinício de sessão | `indicator vwap > BTCUSDT 1h × 500: stays within 1e-8 of the high-precision oracle` |
| OBV com sinal trocado | `indicator obv…` e `indicator obv-trend…` contra o oráculo |
| z-score com desvio amostral | `Bollinger(3, 2) uses the population deviation` e `z-score(3) uses the population deviation` (18 falhas) |
| Bollinger com desvio errado (múltiplo aplicado duas vezes) | `Bollinger(3, 2) uses the population deviation` e o oráculo |
| EMA com `α = 1/n` | `indicator ema > BTCUSDT 1h × 500: stays within 1e-8 of the high-precision oracle` |
| Snapshot sem restaurar a janela (SMA) ou a sessão (VWAP) | `indicator sma > BTCUSDT 1h × 500: passes the indicator contract` (retomada do snapshot) e o equivalente da VWAP |

## Risco em produção (T2.4)

`packages/strategy-engine/src/risk/` — funções puras, texto decimal canônico na entrada e na saída.

- **`computeProtectivePrices`** — `stop = tickDown(P − k·ATR)`, `alvo = tickUp(P + m·ATR)`, com `P` o preço de
  PREENCHIMENTO (já com slippage) e o ATR do candle de DECISÃO `t`; a assinatura não recebe o fechamento de
  `t` nem o ATR de `t+1`. Recusas tipadas: `zero_atr` (ATR ≤ 0), `invalid_stop` (stop bruto ≤ 0 ou
  `stop ≥ P × (1 − slippage)`), `stop_below_tick` (stop positivo que o tick arredonda para zero).
- **`computePositionSize`** — o ÚNICO dimensionamento do produto; a spec 002 o reutiliza no envio da ordem.
  Saída `{ quantity, notional, estimatedStopLoss, constraint }` com `constraint ∈ none · exposure_capped ·
  cash_capped · volume_capped · below_min_notional · invalid_stop · zero_risk`. A quantidade é o menor
  entre risco, exposição, caixa e volume de `t`; empate vale o primeiro da lista; abaixo de `minNotional`
  ou zero ⇒ `below_min_notional` com quantidade `0`. Garantia (RF05): a perda no stop SEM gap — taxas das
  duas pontas e slippage de saída — é **menor** que `riskAmount`, e o débito menor que o caixa.
- **Folga de arredondamento no lugar do laço.** Cada arredondamento de dinheiro erra no máximo `u = 1e-8`.
  O débito soma 2 (valor e taxa, para cima); a perda soma 4 (os dois, o valor da saída para baixo e a taxa
  de saída para cima). Descontar `4u` do risco e `2u` do caixa antes de dividir prova as duas
  desigualdades, em tempo constante. Custo: em raros empates a quantidade fica um passo abaixo do máximo
  exato, sempre contra o usuário. O laço "desce até caber" da T2.1b mascarava erros de fórmula (um
  denominador errado era corrigido pelo laço) e podia custar milhões de voltas com passo fino.
- **Exposição.** `maxExposureRate` é o teto POR CARTEIRA sobre o patrimônio (`quantidade × P ≤ maxExposureRate
  × patrimônio`). O teto TOTAL entre pares **não é do motor**: quem o cobra é o RiskGuard da execução real
  (spec 002) e a camada de metas no ao vivo.
- **`warnRunParameters(runParameters, referencePrice)`** — avisos (nunca erros) que o backtest exibe:
  `tick_dominates_slippage` (tick ÷ preço maior que o slippage configurado e ≥ 0,01%: tick 0,01 sobre 0,53
  dá slippage efetivo de até ≈ 1,9%), `quantity_step_exceeds_balance` (um passo vale mais que o saldo: a
  quantidade sempre zera), `quantity_step_coarse` (passo > 5% do saldo) e `min_notional_exceeds_balance`.

**Prova.** (1) Contas à mão em 9 cenários de tamanho e 3 de proteção (`risk-hand-values`). (2) Teste
DIFERENCIAL: produção × oráculo independente (`test/fixtures/strategy-engine/risk/reference-risk.fixture.ts`,
que não importa `risk/`) em 6.000 cenários gerados por PRNG inteiro (mulberry32, semente fixa; preços de
1e-5 a 1e5, ATR de 0 a 10% do preço, taxas e slippage de 0 a 0,5%, ticks e passos variados, caixa de 10 a
1e9, volumes de 0 a ~1e15): resultados idênticos byte a byte, desvio máximo de quantidade `0`. (3)
Propriedades sobre a mesma grade, sem consultar o oráculo: perda no stop ≤ risco, débito ≤ caixa,
quantidade múltipla do passo, `notional ≥ minNotional`, exposição e participação no volume de `t`. (4) 18
mutantes reprovados pelo diferencial (cópias de `src` com uma edição, mais três de ENTRADA em que o
chamador dá o dado errado): taxa de saída fora do denominador, fechamento de `t` no lugar de `P`,
quantidade para cima, sem teto de caixa / exposição / volume, `volume(k)`, `minNotional` ignorado, stop para
cima, alvo para baixo, ATR de `t+1`, exposição sobre o caixa, saída sem slippage, débito para baixo, folgas
de arredondamento removidas, ATR zero aceito, stop inválido aceito.

## Motor em produção (T2.5)

`packages/strategy-engine/src/wallet/` (a corretora simulada) e `src/create-engine.ts` (o motor completo). Nenhuma
dependência nova; a referência de teste continua independente do `src` de carteira (importa só as primitivas
decimais e os tipos).

- **`createEngine()`** devolve o `Engine` do contrato: `step = assertStepInput → signalStep → runWalletStep`, e
  `signalStep`/`walletStep` expostos para o walk-forward e as metas. `ENGINE_VERSION = 'engine-1'` é o que o estado
  grava (estado de outra versão ⇒ `engine_mismatch` ⇒ migração, §b). A T2.6 passou a versão a `engine-2` (abaixo). A semântica do sinal continua versionada à
  parte: **`SIGNAL_ENGINE_VERSION` passou a `signal-2`** (e o dourado do sinal foi regravado) porque o
  `SignalDecision` ganhou dois campos, abaixo.
- **`walletStep` avulso confere o que o `step` já conferiu** (herdado da revisão do arquiteto). O sinal carrega
  `configHash` (a versão da estratégia que decidiu) e `confirmedGapCandles` (a lacuna que o `signalStep` aceitou);
  o `WalletState` carrega `configHash` e `runHash` (o esquema do estado exige que sejam os do estado). O avulso
  recusa com código: `CONFIG_HASH_MISMATCH` (estado, estratégia ou sinal de outra versão), `RUN_HASH_MISMATCH`,
  `CANDLE_GAP_UNCONFIRMED` (o candle não é o seguinte ao último da carteira e o sinal não ecoa a contagem exata de
  candles ausentes; sinal nulo = aquecimento = sem lacuna), além das guardas de forma, ordem, sinal de outro candle
  e comandos. O `step` composto usa `runWalletStep`, sem essas conferências (já fez a guarda do passo inteiro,
  inclusive lacuna no aquecimento, onde o sinal é nulo e não tem como ecoá-la).
- **`simulatedFillModel`** é o `FillModel` de produção: ordem pendente na abertura de `t+1`, depois stop e alvo
  contra máxima e mínima (§e, ao pé da letra). `executionReports` não vazio ⇒ `EXECUTION_REPORTS_UNSUPPORTED`.
  Stop, alvo e quantidade vêm de `computeProtectivePrices` e `computePositionSize` (T2.4). A ordem pendente guarda
  as DISTÂNCIAS (ATR de `t` × múltiplos), não o ATR; o ATR de `t` volta delas por divisão exata
  (`stopDistance ÷ stopAtrMultiple`: o quociente termina em até 15 algarismos), então o preço de preenchimento `P`
  é o único dado novo. Recusa do preenchimento vira `rejected` com motivo (`invalid_stop`, `below_min_notional`).
- **Dois comportamentos de §e que a prova tornou explícitos** (e que ficam, por serem a regra escrita):
  (1) a limitada que preenche do 2º candle em diante com a abertura ≤ `L` preenche a `L` mesmo que o candle inteiro
  esteja abaixo de `L` (preço acima da máxima: pessimista, "nunca melhor"); (2) o gap acima do alvo preenche ao
  PREÇO DO ALVO, que pode estar abaixo do candle inteiro (a ordem de alvo estava no livro; otimista nesse ponto,
  já listado em "Riscos"). A propriedade "preço dentro do candle" do teste trata esses dois casos pelo que são.
- **Prova.** (1) Contas à mão do `FillModel` (`wallet-fill-hand-values`): mercado, quantidade, taxa, caixa,
  melhora de preço só no 1º candle, toque sem preenchimento, expiração no N-ésimo, limitada no meio do candle com
  máxima além do alvo, stop com gap, stop e alvo no mesmo candle, alvo só tocado, gap acima do alvo, venda por
  sinal. (2) DIFERENCIAL: `walletStep` e `simulatedFillModel` de produção × referência, byte a byte, em 3.000
  fluxos de 30 a 120 candles gerados por PRNG inteiro (mulberry32, semente 20 261 011; gaps de preço e de tempo, ATR
  zero ou ausente, volume pequeno, limitadas, expirações, comandos): 227.213 passos, 0 divergências; o gerador
  exercita cada caminho de preenchimento mais de 100 vezes. (3) PROPRIEDADES sobre as mesmas execuções, sem
  consultar a referência: caixa ≥ 0, no máximo uma posição, patrimônio = caixa + posição a valor de liquidação (no
  fechamento e na mínima), perda realizada num stop sem gap ≤ valor em risco, e nenhuma ordem preenchida fora do
  candle permitido (a mercado em `t+1`, limitada dentro da validade, protetora no candle em que nasce). (4)
  HARNESS: `runEngineContract` (20 verificações) passa no `createEngine` em 6 cenários sintéticos (placar de
  verdade com indicadores curtos, passeio aleatório com semente: gap na entrada, stop e alvo com e sem gap,
  limitadas, SELL que cancela a viva, `halt`/`resume`/`exit_position`, sentimento fresco e velho) e nos dois
  conjuntos reais com o Placar clássico; a carteira de produção ligada ao sinal da referência passa nos 7 cenários
  originais; os 27 motores defeituosos da referência continuam reprovados.
- **33 mutantes de produção** (cópias do `src` com uma edição, como na T2.3 e na T2.4), cada um reprovado pelo
  estágio indicado: DIFERENCIAL (preencher na abertura errada, no candle de decisão, sem taxa de entrada ou de
  saída, sem slippage na compra ou na venda, preço de compra para baixo, alvo antes do stop, gap no preço do stop,
  stop que exige cruzar, alvo no toque, alvo contado no candle de uma limitada preenchida no meio, limitada que
  preenche no toque, melhora de preço em todo candle, expiração com erro de 1, proteção calculada da abertura e
  não do preço de preenchimento, volume do candle de preenchimento, teto de caixa esquecido, régua comprada no
  fechamento, `equityAtLow` no fechamento, segunda posição, `SELL` ignorado, `SELL` que não cancela a limitada
  viva, `halt` ignorado, comando reaplicado); GUARDAS (contiguidade, eco da lacuna, hashes do estado e do sinal,
  relatório da corretora ignorado); API DO MOTOR (o sinal que não ecoa a lacuna); HARNESS (`step` que descarta os
  comandos, `step` sem a guarda de entrada).
- **Dourado preso à `engineVersion`** (`test/fixtures/strategy-engine/golden/classic-scoreboard-engine.engine-1.json`):
  Placar clássico + saldo 10 000, taxa 0,1%, slippage 0,05% sobre os dois conjuntos reais inteiros. Guarda número de
  operações, vitórias, taxas pagas, patrimônio final, queda máxima (no fechamento e na mínima), retorno do "comprar
  e segurar" e o digest de todas as decisões; saída diferente sem trocar `ENGINE_VERSION` reprova, e trocar a
  versão exige gravar o dourado novo. Mais: a contabilidade fecha por conta independente (soma dos resultados das
  operações + o que a posição aberta vale a mais ou a menos que o custo dela = patrimônio final − saldo inicial; e
  reproduzir os preenchimentos sobre o saldo inicial dá o caixa final), e as duas primeiras operações de cada
  conjunto foram calculadas à mão (só `decimal.js` e as fórmulas de §e) e conferidas por uma terceira conta fora do
  TypeScript.
- **Paridade e retomada.** O motor de produção retomado do estado serializado a cada 37 candles dá a execução
  contínua byte a byte nos dois conjuntos reais, e a execução em lotes de 1, 5 e 50 candles (motor novo e estado
  vindo do JSON a cada lote) é idêntica.

## Revisão da Fase 2 (T2.6)

O `code-reviewer` reprovou a Fase 2 (T2.1–T2.5) com 1 bloqueante e 7 importantes. Cada item, a decisão e a prova.
`ENGINE_VERSION` passou a `engine-2` (o comportamento mudou: vale, lacuna, comandos e `commandId`) e o dourado
foi regravado; `SIGNAL_ENGINE_VERSION` continua `signal-2` (o sinal não mudou).

| # | Achado | Decisão | Prova |
|---|---|---|---|
| B1 | `equityAtLow` ignorava a posição que sai no mesmo candle: toda barra vencedora escondia o vale e o drawdown/perda máxima ficavam subestimados (constituição §3) | `equityAtLow = min(valoração na mínima da posição que existiu durante o candle, valor ao fim do passo)`; regra completa em §e ("Vale do candle") | contas à mão (`wallet-equity-low`: 10 136,45387706 de fechamento contra 9 934,11523824 no vale do cenário do revisor); referência, harness (`fees-and-slippage` reconcilia por razão de caixa), propriedades e oráculo bigint; mutantes `EQUITY_LOW_IGNORES_EXITING_POSITION` e `EQUITY_LOW_COUNTS_STOP_AT_LOW` (e os defeitos de mesmo nome na referência) |
| I1 | `runHash`/`configHash` eram rótulos: `{...run, parameters:{feeRate:'0.5'}}` com o mesmo `runHash` era aceito | o motor recalcula o SHA-256 canônico de `config` e `parameters` uma vez por objeto (`WeakMap`) no `step` e no `walletStep` avulso | `engine-hash-recompute` (parâmetros e estratégia adulterados recusados; objeto reusado não reenumera); mutantes `RUN_HASH_NOT_RECOMPUTED`, `CONFIG_HASH_NOT_RECOMPUTED`, `HASH_CACHE_DISABLED`, `STEP_DOES_NOT_RECOMPUTE_THE_HASHES` |
| I2 | lacuna confirmada deixava a posição sem proteção e sem saída | §e "Lacuna confirmada": stop assumido tocado, saída na abertura pós-lacuna, pendências canceladas, sem entrada | `wallet-gap-policy` (contas à mão); check `gap-policy` do harness com 2 cenários; 3.000 fluxos do diferencial com cobertura mínima de `gap-exit` e `gap-cancel`; mutantes `GAP_KEEPS_POSITION`, `GAP_KEEPS_PENDING`, `GAP_ALLOWS_ENTRY`, `GAP_EXIT_AT_THE_STOP_NOT_THE_OPEN`, `GAP_NEEDS_TWO_CANDLES` |
| I3 | `exit_position` não impedia entrada no mesmo candle | `exit_position` e `halt` aplicados suprimem qualquer entrada nova nesse candle; sem posição, `exit_position` só cancela pendências | `wallet-command-policy`; check `signal-policy`; mutante `EXIT_COMMAND_ALLOWS_ENTRY` (e o defeito da referência) |
| I4 | o arredondamento a 8 casas das taxas da carteira não era exercido (M19 `sellCredit` com `moneyUp` e M41 `buyDebit` com `moneyDown` sobreviviam: tick 0,01 × passo 0,00001 dá notional de 7 casas, o arredondamento era um no-op) | cenário com `tickSize` 1e-8 e `quantityStep` 0,001 (notional de 11 casas), contas à mão de `buyDebit`, `sellCredit`, `entryFee`, `exitFee`, `netProfit` e do patrimônio; o gerador de fluxos ganha o perfil de notional fino | `wallet-rounding-hand-values`; mutantes `SELL_CREDIT_ROUNDED_UP` e `BUY_DEBIT_ROUNDED_DOWN` reprovados pelo diferencial, pelas contas à mão e pelo oráculo |
| I5 | aritmética de dinheiro duplicada (`risk/trade-cost.ts` × `wallet/wallet-pricing.ts`; `risk/rounding.ts`) | UMA implementação em `src/money.ts` (`moneyUp/Down`, `floor/ceilToIncrement`, taxa, débito e crédito) importada por `risk/` e `wallet/` | diferenciais da T2.4 (6.000 cenários) e da T2.5 (3.000 fluxos) e todos os mutantes seguem verdes |
| I6 | a referência compartilhava código com a produção (primitivas de arredondamento, guardas) | oráculo de contabilidade em `bigint` (unidades de 1e-8; notional em 1e-16) em `test/fixtures/strategy-engine/oracle-bigint/`, ~200 linhas, sem importar nada de `src` nem de `reference-*`: replica caixa, `netProfit` e patrimônio (fechamento e vale) dos preenchimentos que o motor emitiu | confere passo a passo os cenários do harness, as 3.000 sequências do diferencial e os dois conjuntos reais; primitivos testados com valores à mão (negativos, exatamente no múltiplo, incremento de 12 casas recusado); reprova sozinho 4 mutantes de dinheiro e de vale; um teste varre os imports do oráculo |
| I7 | `RunParameters` aceitava incrementos de 12 casas, mas o dinheiro é `numeric(24,8)` | no máximo 8 casas em `tickSize`, `quantityStep`, `minNotional`, `initialBalance`, `feeRate` e `slippageRate`; avisos novos `fee_rate_is_zero` e `slippage_rate_is_zero` ("resultados otimistas") | `run-parameters-places`, `risk-warnings`; o hash dourado não mudou (os valores de exemplo cabiam em 8 casas) |
| I8 | no backtest, `selectAvailableSentiment` com `createdAt <= início da execução` não selecionaria nada num histórico recarregado hoje | só documental, desenho da T3.1: na carga histórica `sentiment_observations.created_at` = instante ESTIMADO de publicação (data do dado + atraso de publicação conservador), nunca o horário da carga (§d) | linha da T3.1 do `tasks.md` |
| a | `commandId` só era único dentro do passo | a carteira guarda os últimos 64 (`processedCommandIds`); o repetido num passo posterior sai como `ignored_duplicate` (§h) | check `signal-policy`; fluxos de "tempestade de comandos" no diferencial (passam de 64 identificadores e repetem alguns já esquecidos); mutantes `DUPLICATE_COMMAND_REAPPLIED`, `COMMAND_HISTORY_UNBOUNDED`, `COMMAND_HISTORY_ONE_TOO_SHORT` |
| b | `step` não conferia `signal.lastCandleOpenTime === wallet.lastCandleOpenTime` | `assertStepInput` recusa com `invalid_state` | `engine-step-halves`; guarda do harness; mutante `STEP_ACCEPTS_THE_HALVES_AT_DIFFERENT_CANDLES` |
| c | §f2 citava `signal-1` | corrigido para `signal-2` e o nome real do dourado | — |
| d | exports sem uso | `assertSentiment`, `collectIndicatorHorizons`, `previousValueId`, `buildWalletContext`, `normalizeZero` e `DECIMAL_STATE_TEXT_SCHEMA` deixam de ser exportados | `tsc` e a suíte |

**Riscos ACEITOS (T2.6).**

- A SAÍDA não tem teto de participação no volume; só a entrada tem (§e, "Participação no volume"). Uma posição
  grande num candle de volume pequeno sai inteira ao preço da regra. Otimista nesse ponto; a execução real (spec 002)
  mede o impacto de verdade e recalibra.
- A convergência com ε = 1e-3 (§c) faz o MESMO candle poder dar EMA/RSI diferentes em ~0,1% conforme o ponto de
  partida do backtest: o peso residual do primeiro candle não é zero. O resultado de um backtest depende da janela;
  duas janelas que se sobrepõem divergem nos primeiros sinais da sobreposição. O pré-aquecimento (`leadInCandles`)
  limita o erro, não o elimina.
- A janela de idempotência de `commandId` é de 64 identificadores: um identificador esquecido volta a ser aplicável.
  Os chamadores (metas, usuário) geram identificadores únicos por instante; reutilizar um depois de 64 comandos é
  erro do chamador.

**Medida do harness (T2.6).** `production-engine` 34,7 s → 7,2 s e `production-engine-mutants` 34,0 s → 5,8 s com
os cortes amostrados e o juiz que para na primeira divergência (a suíte inteira, 124 s → ~68 s, já com os testes
novos e o oráculo).

## Métricas (T2.6-metricas)

`packages/strategy-engine/src/metrics/`: funções PURAS, decimal exato (`EngineDecimal`, 40 algarismos), sem
`Math.exp`, `Math.log` nem `Math.pow` (a potência fracionária e a raiz são `EngineDecimal.pow` e `.sqrt`,
determinísticas em qualquer runtime), sem relógio nem locale. `METRICS_VERSION = 'metrics-1'`; `runs.metrics` (plan §3)
grava essa versão junto de `ENGINE_VERSION`. Mudar uma fórmula exige `metrics-2` e o dourado regravado.

**Interface.** `computeRunMetrics({ equityPoints, closedPositions, openPosition, run })` devolve `RunMetrics`.
`equityPoints` são os `EquityPointDecision` do motor em ordem de tempo (um por candle decidido, a partir do primeiro
sinal); `closedPositions` são as `ClosedPositionDecision` em ordem de saída; `openPosition` é a posição ainda aberta no
fim (`openedCandleOpenTime`, `entryFee`, `unrealizedProfit`) ou `null` (campo obrigatório: quem chama decide, e a taxa
da posição aberta não some por esquecimento); `run` traz `initialBalance` e `timeframeMilliseconds`
(`ENGINE_TIMEFRAME_DURATION_MILLISECONDS`). Entrada que viola o contrato (ponto fora de ordem, patrimônio ≤ 0,
`equityAtLow` acima de `equity`, posições sobrepostas, texto não decimal) lança `StrategyEngineError`: é erro de quem
chama, nunca um número torto.

**Números e arredondamento (sem arredondamento escondido).** Toda saída numérica é TEXTO decimal canônico
(`formatEngineDecimal`: sem expoente, sem zeros à direita). Soma de dinheiro (`netProfit`, `grossProfit`, `grossLoss`,
`feesPaid`) é EXATA, sem arredondar. Toda grandeza que sai de uma divisão, raiz ou potência (retornos, razões, médias,
drawdown, Sharpe, Sortino, fração de exposição) é calculada a 40 algarismos e arredondada UMA vez, para 12 casas
(`METRICS_DECIMAL_PLACES`, `ROUND_HALF_UP`); nenhuma métrica é composta a partir de outra já arredondada. Valor que não
se define é `{ value: null, reason }` (nunca `NaN`, `Infinity` nem um `"0"` fingindo); valor definido é
`{ value: "…", reason: null }`.

| Motivo (`reason`) | Quando |
|---|---|
| `no_equity_points` | nenhum ponto de patrimônio (o aquecimento não acabou) |
| `insufficient_returns` | menos de 2 retornos por período (Sharpe e Sortino) |
| `zero_volatility` | todos os retornos iguais (desvio-padrão 0): Sharpe |
| `zero_downside` | nenhum retorno negativo (desvio de queda 0): Sortino |
| `period_too_short` | período menor que 30 dias (`MINIMUM_ANNUALIZATION_PERIOD_MILLISECONDS`): retorno anualizado e operações por ano |
| `no_trades` | nenhuma operação fechada |
| `no_losses` | nenhuma perda (profit factor, perda média, razão ganho/perda) |
| `no_wins` | nenhum ganho (razão ganho/perda) |

**Definições.** `E_k` = `equity` do ponto `k` (liquidação no fechamento), `L_k` = `equityAtLow`, `B_k` = `benchmark`,
`E_0` e `E_n` o primeiro e o último ponto, `S` o saldo inicial, `T` a duração do timeframe, `Y` = 365,25 dias =
31 557 600 000 ms (ano fixo: 365 dias subestimaria os períodos por ano).

| Métrica | Definição |
|---|---|
| `totalReturn` | `E_n ÷ S − 1` (liquidação do último ponto: taxa e slippage já descontados) |
| `benchmarkReturn` | `B_n ÷ S − 1`: comprar e segurar no mesmo período, com a mesma taxa e o mesmo slippage (constituição §3) |
| `excessReturn` | `totalReturn − benchmarkReturn`, calculado dos valores de 40 algarismos (uma só arredondagem) |
| `annualizedReturn` | `(E_n ÷ S)^(Y ÷ Δ) − 1`, com `Δ` = tempo de `E_n` − tempo de `E_0` em ms (do fechamento do primeiro ponto ao do último); `null` `period_too_short` se `Δ` < 30 dias (anualizar horizonte curto engana) |
| retorno do período | `r_k = E_k ÷ E_{k−1} − 1`, `k = 1..n` (fechamento a fechamento; uma lacuna confirmada entre dois pontos conta como UM período) |
| `sharpe` | `média(r) ÷ desvio_amostral(r) × √(Y ÷ T)`; `n−1` no denominador do desvio (`n` = número de retornos), taxa livre de risco 0; `null` se `n < 2` (`insufficient_returns`) ou se todos os retornos são iguais (`zero_volatility`: igualdade EXATA, sem tolerância escondida; a divisão decimal é arredondada corretamente, então razões iguais dão textos iguais) |
| `sortino` | `média(r) ÷ desvio_de_queda × √(Y ÷ T)`, desvio de queda = `√( Σ min(r_k, 0)² ÷ n )` sobre TODOS os `n` períodos (alvo mínimo 0; o período positivo entra como 0, nunca é descartado); `null` se `n < 2` ou sem retorno negativo (`zero_downside`) |
| pico | `P_k = max(E_0..E_k)`: o máximo corrente do patrimônio de FECHAMENTO, inclusive o candle corrente (o lado pior: o pico não encolhe) |
| queda do ponto | no fechamento `(P_k − E_k) ÷ P_k`; na mínima `(P_k − L_k) ÷ P_k`. A queda máxima é o maior valor da série; **empate de profundidade: vale a ocorrência mais antiga** (comparação estrita `>` sobre o valor de 40 algarismos). `maxDrawdownAtLow` é o relatório honesto e o que as metas (RF13) usam; vale `≥ maxDrawdownAtClose` porque `L_k ≤ E_k` |
| instantes da queda | `peakTime` = o ponto do pico vigente na queda máxima; `troughTime` = o ponto da queda máxima; `recoveryTime` = o primeiro ponto, a partir do vale (inclusive), com `E ≥` o valor do pico, ou `null` se nunca recuperou. Duração: do pico à recuperação, ou do pico ao último ponto se não recuperou; em candles (diferença dos índices dos pontos) e em ms (diferença dos `candleOpenTime`). Sem queda, os três instantes são `null` e as durações 0 |
| `trades`, `wins`, `losses` | operações fechadas; `wins` = `netProfit > 0`; `losses` = `netProfit < 0`; resultado exatamente zero não é ganho nem perda (entra em `trades`) |
| `winRate` | `wins ÷ trades` (a posição ABERTA não entra); `null` `no_trades` |
| `grossProfit`, `grossLoss`, `netProfit` | soma dos `netProfit` positivos; soma dos módulos dos negativos (não negativa); soma de todos (`= grossProfit − grossLoss`); o `netProfit` de cada operação já traz as duas taxas |
| `profitFactor` | `grossProfit ÷ grossLoss`; `null` `no_trades` sem operações e `null` `no_losses` se `grossLoss = 0` (só vitórias: infinito não se escreve); só perdas dá `0` |
| `averageTrade` | `netProfit ÷ trades` |
| `averageWin`, `averageLoss` | `grossProfit ÷ wins`; `grossLoss ÷ losses` (módulo, não negativo); `null` `no_wins` / `no_losses` |
| `expectancy` | `winRate × averageWin − (losses ÷ trades) × averageLoss`, com as médias a 40 algarismos: o ganho esperado por operação (igual a `averageTrade`; `null` `no_trades`; média ausente conta como 0) |
| `payoffRatio` | `averageWin ÷ averageLoss`; `null` `no_wins` ou `no_losses` |
| `maxConsecutiveLosses` | a maior sequência de perdas consecutivas na ordem de saída (resultado zero ou ganho a interrompe) |
| `feesPaid` | soma de `entryFee + exitFee` de TODAS as fechadas MAIS a `entryFee` da posição aberta: toda taxa que saiu do caixa, inclusive a da posição ainda sem saída |
| `exposure` | fração dos pontos (candles a partir do primeiro sinal) em que havia posição NO FECHAMENTO do candle: a posição aberta no candle `a` e fechada no candle `c` está exposta nos fechamentos de `a` até `c−1`; a ainda aberta, de `a` ao fim. Entrada e saída no mesmo candle (stop) não contam. O aquecimento fica fora (não há ponto) |
| `tradesPerYear` | `trades ÷ (Δ ÷ Y)`; `null` `period_too_short` se `Δ` < 30 dias |
| `openPosition` | `null` ou `{ openedCandleOpenTime, entryFee, unrealizedProfit }`, SEPARADA das fechadas: `unrealizedProfit` = valor de liquidação da posição no último fechamento − o débito de compra (que inclui a taxa de entrada) |
| `exitReasonCounts` | quantas fechadas saíram por `stop`, `target`, `signal`, `command` e `gap` |

**Reconciliação.** `reconcileRunMetrics(metrics)` confere, em decimal exato e sem tolerância, que
`netProfit + openPosition.unrealizedProfit = E_n − S` (sem ponto, `E_n − S` vale 0). As taxas já estão dentro do
`netProfit` de cada operação e do `unrealizedProfit` (a compra debita o valor mais a taxa): descontá-las de novo seria
contá-las duas vezes. O teste exige que a conta feche nos dois conjuntos reais (BTC 1h × 500 e ETH 1d × 400).

**Conferência independente.** `test/fixtures/strategy-engine/oracle/metrics_reference.py` recalcula as métricas em
Python puro (`python3 -I`, módulo `decimal`, contexto de 40 algarismos, sem biblioteca) a partir dos pontos e das
posições que o motor exportou. Uso, da raiz do repositório:

```text
mkdir -p tmp && bun run scripts/export-metrics-input.ts "BTCUSDT 1h × 500" > tmp/metrics-btc.json
python3 -I test/fixtures/strategy-engine/oracle/metrics_reference.py tmp/metrics-btc.json \
  test/fixtures/strategy-engine/golden/classic-scoreboard-metrics.metrics-1.engine-2.json "BTCUSDT 1h × 500"
```

O script imprime cada métrica do Python ao lado da do dourado e sai com código 1 se alguma diferir mais que 1e-9. Não
roda na CI (Python não é dependência do repositório); o resultado conferido fica registrado nos números do dourado e na
seção "Prova" abaixo.

**Prova (T2.6-metricas).**

- **Contas à mão** (`metrics-return-risk`, `metrics-drawdown`, `metrics-trades`): a série A tem períodos de +10%, −2%,
  +6%, −1% e +2% (média 0,03; desvio amostral √(0,01 ÷ 4) = 0,05; desvio de queda √(0,0005 ÷ 5) = 0,01), o que dá
  Sharpe 60 e Sortino 300 (o timeframe de 3 155 760 ms tem 10 000 períodos por ano, raiz exata 100), queda de 2% no
  fechamento e de 5% na mínima. O livro de 7 operações dá taxa de acerto 3 ÷ 7, profit factor 1,8, expectativa 80 ÷ 7,
  sequência de 3 perdas, taxas 31,7 (a da posição aberta incluída) e exposição 11 ÷ 20. Bordas: zero operações, só
  vitórias (`no_losses`), só perdas (profit factor 0), série plana, retornos iguais que não terminam (−2/3 e 1/7 − 1: a
  igualdade exata evita um "desvio" de 1e-40), um ponto, período de 29 dias e 30 dias exatos, queda sem recuperação,
  posição aberta no fim, duas quedas de mesma profundidade (a mais antiga), volta exata ao pico.
- **Propriedades** (`metrics-properties`): 2 000 séries de passeio aleatório por PRNG inteiro (mulberry32, semente
  20 261 010; centavos inteiros, lacunas de tempo, operações disjuntas e posição aberta). Invariantes: determinismo e
  entrada intacta; queda em [0, 1) e `maxDrawdownAtLow ≥ maxDrawdownAtClose`; taxa de acerto e exposição em [0, 1];
  profit factor, perda média, razão ganho/perda, taxas e somas brutas não negativas; `grossProfit − grossLoss =
  netProfit`; instantes ordenados; razões, quedas, Sharpe e Sortino IGUAIS quando o saldo é multiplicado por 3 ou por
  1 000; acrescentar um ponto no fim nunca diminui a queda máxima; a queda máxima é igual à força bruta sobre todos os
  pares pico/vale (600 séries); com o patrimônio final igual à contabilidade a reconciliação fecha.
- **Dourado** (`classic-scoreboard-metrics.metrics-1.engine-2.json`, preso a `METRICS_VERSION` e `ENGINE_VERSION`): o
  Placar clássico com saldo 10 000, taxa 0,1% e slippage 0,05% sobre os dois conjuntos reais, pelo motor completo. Bate
  com o dourado do motor da T2.5 (operações, vitórias, taxas, patrimônio final, quedas e retorno de comprar e segurar,
  em 8 casas) e a reconciliação fecha sem tolerância nos dois. Regravar: `bun run scripts/record-metrics-golden.ts`.

| Métrica | BTCUSDT 1h × 500 | ETHUSDT 1d × 400 |
|---|---|---|
| pontos (candles decididos) / dias | 307 / 12,8 | 207 / 206,0 |
| retorno total | −4,4217% | −2,5058% |
| comprar e segurar / excesso | +12,3458% / −16,7675% | −8,3800% / +5,8742% |
| retorno anualizado | `null` (`period_too_short`) | −4,3998% |
| Sharpe / Sortino | −5,6835 / −7,1300 | −1,0325 / −1,3762 |
| queda máx. no fechamento / na mínima | 6,0983% / 6,2414% | 4,1866% / 4,3058% |
| duração da queda (candles; sem recuperação) | 273 | 197 |
| operações / vitórias / derrotas | 13 / 4 / 9 | 10 / 3 / 7 |
| taxa de acerto / profit factor | 30,77% / 0,4114 | 30,00% / 0,6263 |
| expectativa / ganho médio / perda média | −39,48 / 89,69 / 96,89 | −25,06 / 139,99 / 95,79 |
| razão ganho/perda / maior sequência de perdas | 0,9257 / 4 | 1,4614 / 4 |
| taxas pagas | 153,1433697 | 20,94468677 |
| exposição / operações por ano | 51,47% / `null` | 33,33% / 17,73 |
| posição aberta no fim | sim (+71,07365016 não realizado) | não |
| lucro líquido das fechadas + não realizado = variação | −513,24722162 + 71,07365016 = −442,17357146 | −250,57655867 + 0 = −250,57655867 |

- **Conferência independente.** `metrics_reference.py` (Python 3.14, `python3 -I`, `decimal`) recalculou os dois
  conjuntos a partir dos pontos e das operações exportados do motor e bateu com o dourado em TODAS as métricas
  (retornos, Sharpe, Sortino, quedas com pico, vale e duração, taxa de acerto, profit factor, médias, expectativa,
  razão, sequência, taxas, exposição e operações por ano), dentro de 1e-9 (diferença real: abaixo de 1e-12, só o
  arredondamento do dourado). O script não é importado por nada e não roda na CI; ele sai com código 1 se algo
  divergir (provado alterando o dourado).
- **31 mutantes de produção** (`metrics-mutants`: cópia do `src` com uma edição, os testes de métrica relançados num
  processo à parte; o controle sem edição passa e nenhum mutante falha por erro de carga), todos reprovados: Sharpe com
  `n` no lugar de `n − 1`; Sortino sobre só os períodos negativos; Sharpe sem o teste de igualdade exata; ano de 365
  dias; períodos por ano sem a raiz; fator de anualização esquecido; queda na mínima medida no fechamento; pico tirado da
  mínima; empate de queda que fica com a mais nova; pico que guarda o primeiro toque; recuperação que exige máxima nova;
  duração que acaba no vale; profit factor invertido; taxa de acerto contando a posição aberta; taxas sem a de entrada;
  taxas sem a da posição aberta; exposição que conta o candle da saída; exposição que ignora a posição aberta;
  anualização de período curto; limiar de 30 dias exclusivo; operações por ano de período curto; limiar de 29 dias;
  excesso invertido; régua tirada do patrimônio; sequência de perdas que conta resultado zero ou que é a última; perda
  bruta com sinal; resultado zero contado como ganho; expectativa sem o lado da perda; perda média sobre todas as
  operações; reconciliação que ignora o não realizado.
- **Decisões que a implementação fixou** (todas no ADR acima): o pico inclui o fechamento do próprio candle, de modo
  que uma queda medida na mínima de um candle que fecha em máxima nova se recupera dentro dele (duração 0); o pico passa
  a ser o último ponto que alcançou o valor máximo, de modo que a volta exata ao pico encerra a queda anterior; a
  exposição conta fechamentos com posição, então uma operação aberta e fechada no mesmo candle (stop) não conta.

## Persistência (T3.1)

Entregue em `packages/database` (migrations 0007 e 0008); o mapeamento de §a (tabela "O que entra em `decisions`")
e as chaves naturais de §b valem como escritos. O que a implementação fixou:

| Decisão | Valor | Motivo |
|---|---|---|
| Dono e integridade | `user_id NOT NULL` em toda tabela de dono; `UNIQUE (id, user_id)` nos pais (`strategies`, `strategy_versions`, `runs`); FK composta `(pai_id, user_id)` nas filhas (`strategy_versions`, `runs` — duas, para a versão e para `migrated_from_run_id` —, `signals`, `orders`, `fills`, `positions`, `equity_points`, `run_commands`), todas `ON DELETE RESTRICT` | O banco recusa linha cujo dono diverge do dono do pai (provado com INSERT cru nas seis tabelas de resultado) e apagar estratégia ou versão com execuções |
| Versão da estratégia | único `(strategy_id, version)` e único `(strategy_id, config_hash)`; `addVersion` devolve a versão existente quando o hash repete, e o `FOR UPDATE` na linha da estratégia serializa a numeração | Hash igual NÃO gera versão nova (RF03), nem sob concorrência |
| Status monotônico | `orders`: `created` < qualquer final; `positions`: `open` < `closed`; `DO UPDATE … WHERE rank(novo) > rank(gravado) AND user_id igual`; os campos que o evento novo traz nulos mantêm o valor anterior (`coalesce`); `runs.status` só aceita a origem válida no `WHERE` do UPDATE e o checkpoint só grava com `running` e `last_candle_time` maior | Evento atrasado ou reenvio nunca regride um estado final; um final nunca vira outro final |
| Lote | `append*` = uma transação por chamada; blocos de no máximo 5.000 linhas e menos que 60.000 parâmetros; as linhas do mesmo `engine_key` no lote são colapsadas antes do INSERT | O Postgres recusa o `ON CONFLICT DO UPDATE` que afeta a mesma linha duas vezes; o protocolo limita a 65.535 parâmetros |
| Decimais | `numeric` sem precisão nas colunas vindas do motor | O motor emite até 15 algarismos significativos em distâncias; `numeric(24,8)` arredondaria em silêncio e o reenvio deixaria de ser byte a byte igual |
| `sentiment_observations` imutável | **Gatilho**, não `REVOKE`: `BEFORE UPDATE OR DELETE` por linha e `BEFORE TRUNCATE` levantam `sentiment_observations é append-only` | O aplicativo conecta com o mesmo papel que dono da tabela, e `REVOKE` não vale contra o dono nem contra o superusuário; o gatilho vale para qualquer papel que não o desabilite de propósito (`ALTER TABLE … DISABLE TRIGGER` exige ser dono). Provado por UPDATE e DELETE crus |
| Seleção do sentimento | `observed_at ≤ t` **e** `created_at ≤ corte de inserção`, da fonte pedida; empate em `observed_at` vale a inserida por último (`created_at`, depois `id`) | Regra de §d; o corte compara com precisão de milissegundo (a linha de .123456 não entra no corte .123) |
| Execução órfã | `failOrphanedRuns({ kinds, errorCode })`: `running` de `backtest`/`walk_forward` vira `failed` com `finished_at`; devolve só a contagem | Uso do boot (T3.6); a simulação ao vivo e `queued` nunca são tocadas. É a única operação de repositório sem `OwnerScope` (ADR 0001 §e, regra 7) |

**Medida (RNF01, T3.2).** Gravação em lote de uma execução sintética de 17.520 pontos de patrimônio, 4.000 sinais e
300 ordens, 300 preenchimentos, 300 posições e 20 comandos, num Postgres local descartável: **~1,0 s** (pontos
~0,66 s, sinais ~0,27 s, o resto ~0,08 s), meta < 1,5 s do `make database-test`. O reenvio do mesmo lote grava 0
linhas e deixa a contagem e o digest das seis tabelas idênticos.

**Exportação e exclusão (LGPD).** As nove tabelas de dono entram em `OWNED_TABLE_EXPORTS` (por colunas, sem
`user_id`, `engineState` nem os hashes `config_hash`/`run_hash`, que o contrato de colunas secretas também barra) e na
ordem de exclusão `equity_points`, `run_commands`, `fills`, `positions`, `orders`, `signals`, `runs`,
`strategy_versions`, `strategies`; `sentiment_observations` é pública (`UNOWNED_PUBLIC_TABLES`).

## Backtest em `worker_thread` (T3.2)

Entregue em `apps/api-cryptoada/src/backtest/` (caso de uso e thread) e em `packages/database` (`resolveRunOwnerScope`,
`createRunBatchRepository`). O backtest é UM laço sobre o `Engine.step` de produção, o mesmo do ao vivo; não existe
`runBacktest` com outra lógica (§a). O que a implementação fixou:

| Decisão | Valor | Motivo |
|---|---|---|
| Dono da execução | `resolveRunOwnerScope(handle, runId)` devolve o `OwnerScope` do dono (ou `undefined` para `runId` malformado, inexistente, ou dono apagado/bloqueado). A thread nunca cunha `UserId`; o escopo nasce na sessão (`attach`) e o caso de uso nunca o vê | A thread só recebe um `runId`. **Só vale para `runId` enfileirado pela API depois de autorizar o usuário** (ADR 0001 §e, regra 8) |
| Uma transação por lote | `runInBatch(scope, runId, work)`: trava a linha da execução (`FOR UPDATE`), entrega ao `work` um escritor preso ao dono e o caso de uso faz, nesta ordem, **status → resultados → checkpoint** (`engine_state`, `last_candle_time`, `progress`). Falha em qualquer passo desfaz o lote inteiro | ADR 0002 §b: o backtest grava em LOTE (2.000 passos), não por passo. O checkpoint só existe depois dos resultados que ele resume; o lote inteiro ou nada |
| Cancelamento | O status é lido DENTRO da transação do lote, com a execução travada: `cancelled` ⇒ para sem gravar o lote em curso, sem erro, mantendo os lotes anteriores. Um cancelamento concorrente espera o fim do lote e vale depois dele | Sem janela entre "ainda corre" e "gravou". Latência do cancelamento = um lote (~0,3 s) |
| Falha | Qualquer erro vira `failed` com `error_code` estável (`NO_CANDLES`, `INSUFFICIENT_HISTORY`, `HASH_MISMATCH`, `ENGINE_REJECTED_INPUT`, `ENGINE_STATE_UNUSABLE`, `BACKTEST_UNEXPECTED`, …, e `BACKTEST_TIMEOUT`/`WORKER_CRASHED` da thread). A mensagem do erro original NUNCA sai: só código e texto escrito por nós | Erro de driver traz consulta, URL ou segredo (RNF04). O que os lotes anteriores gravaram fica (nada se apaga) |
| Hashes | `configHash` e `runHash` gravados são RECALCULADOS do conteúdo (`createStrategyVersion`, `createRunSetup`) e comparados com os das linhas, antes de carregar um candle | O motor só confere o rótulo que recebe, e o rótulo nasce no próprio caso de uso: sem esta conferência uma linha adulterada rodaria |
| Pré-aquecimento | `leadInCandles` do `computeStrategyLeadInCandles`; carga de `[period_start − leadIn × duração, period_end)`. **Largada nova confere ANTES de qualquer passo ou gravação**: sem candle fechado no período ⇒ `NO_CANDLES`; menos de `leadIn` candles no aquecimento ⇒ `INSUFFICIENT_HISTORY` com a contagem (`94 de 194`) | Resultado calculado sobre menos dados é pior que falha tipada (§c, "Riscos aceitos") |
| Lacuna | Entre candles consecutivos do banco, `(abertura − abertura anterior) ÷ duração − 1` > 0 vira `confirmedGapCandles` (a lacuna confirmada de §a); na retomada, a comparação parte do último candle do checkpoint | "Nunca pula candle em silêncio": sem a declaração exata o motor recusa (`CANDLE_GAP_UNCONFIRMED`) |
| Candle aberto | O fim do período é `min(period_end, início do candle em curso)` pelo relógio injetado: candle com fechamento depois do relógio não entra | Paridade com o ao vivo, que só vê vela `x = true` |
| Páginas | Uma consulta por janela de tempo de `batchSize` candles (nunca por candle, nunca tudo de uma vez); janela vazia é pulada | Sem N+1: 17.520 candles = 9 consultas de candle |
| Sentimento | `listAvailable` uma vez (fonte da execução, até o fechamento do período) e, por candle, `selectAvailableSentiment` do motor com `insertionCutoff` = fechamento do candle | Regra de §d: observação inserida depois do fechamento não vale naquele candle |
| Métricas | `computeRunMetrics` sobre o que ficou GRAVADO (pontos de patrimônio e operações fechadas, lidos por páginas de 5.000) e `computeOpenPositionMetrics` (novo no motor: as mesmas primitivas da carteira) para a posição aberta | Execução retomada e contínua passam pelo mesmo caminho; o dourado de métricas confere a posição aberta ao último dígito |
| Conclusão | `completed` grava `metrics` e `progress = 100` (`transitionRun` passou a fixar o progresso na conclusão); `engine_version` e `metrics_version` da linha são conferidos antes (`ENGINE_VERSION_MISMATCH`) | A linha nasce com as versões do motor que a vai executar; outra versão ⇒ execução nova ligada à anterior (§b) |
| Retomada | `running` com checkpoint retoma do `engine_state` (validado: motor, `configHash`, `runHash` e último candle conferem, senão `ENGINE_STATE_UNUSABLE`) carregando só os candles depois dele; `running` sem checkpoint recomeça do zero (nenhum lote chegou a gravar). A proteção (stop e alvo) da posição aberta vem do estado | Resultado IDÊNTICO ao da execução contínua, qualquer que seja o corte e o tamanho do lote (prova abaixo) |

**A thread.** `backtest.worker.ts` abre o PRÓPRIO banco (`DATABASE_URL`, validada por Zod em `environment.ts`) e o fecha ao
terminar. Pedido `{ type: 'run', runId }` (UUID) e eventos (`ready`, `progress`, `completed`, `cancelled`, `failed`) são
`z.strictObject` validados nas DUAS direções: nenhum evento carrega estado do motor, resultado, texto livre nem dado de
usuário. O lado da API (`createBacktestThreadRunner`) usa o `Worker` do Bun, termina a thread no timeout
(`BACKTEST_TIMEOUT_SECONDS`, 5 a 86.400, **padrão 900**) e marca `failed` com `BACKTEST_TIMEOUT`; thread que morre
(`process.exit`, exceção não capturada, evento fora do esquema) vira `WORKER_CRASHED`, também gravado pela thread
principal; `terminateAll()` roda no encerramento gracioso da API e deixa a execução `running` com checkpoint
(recuperável: a retomada acima, ou `failOrphanedRuns` no boot, T3.6). A API não bloqueia: `GET /v1/health` responde em
menos de 100 ms durante o backtest.

**Medida (RNF01) e prova.** `make backtest-test` (Postgres descartável, thread de produção, 17.520 candles `1h` de
BTCUSDT sintéticos de semente fixa + 740 observações de Fear & Greed): **~3,4 s de ponta a ponta** (`runner.run` até
`completed`), contra o teto de 5 s. Decomposição: partida da thread ~40 ms, carga ~70 ms, motor ~540 ms, **gravação ~2,5 s**
(17.327 sinais e 17.327 pontos de patrimônio dominam), métricas ~240 ms, resto ~35 ms. A gravação em lote é o gargalo; o
motor não é. Duas execuções dão o mesmo digest (sinais, ordens, preenchimentos, posições, patrimônio, métricas, estado do
motor e candle do checkpoint); o gravado é idêntico ao do mesmo motor rodado direto em memória; os dois conjuntos reais
(`BTCUSDT 1h × 500`, `ETHUSDT 1d × 400`) produzem métricas IGUAIS ao dourado `metrics-1`/`engine-2` e ao da T2.5
(**o período começa no candle `leadIn` = 194, que é exatamente onde o dourado deixa de aquecer, então a diferença é nula**;
com outro `period_start` o aquecimento mudaria o primeiro sinal e o resultado deixaria de ser comparável ao dourado, ver
"Riscos aceitos" da T2.6). Contratos sem banco (`test/backtest-*.contract.test.ts`, repositório em memória que emula a
transação e o status) cobrem lotes, checkpoint, cancelamento, falha, lacuna, histórico insuficiente, hashes, candle
aberto, sentimento e retomada (cortes em todos os 12 primeiros lotes, inclusive com posição aberta); **28 mutantes**
(`test/backtest-mutants.contract.test.ts`) são reprovados: lacuna ignorada ou com contagem errada, candle aberto aceito,
checkpoint antes do lote, lote fora de UMA transação, status não verificado entre lotes, cancelamento tratado como falha,
hash de execução ou de versão não conferido, aquecimento menor que o `leadIn`, histórico insuficiente ou período vazio
não conferidos, posição aberta avaliada no preço errado, erro engolido, texto do erro que viaja, posição retomada
esquecida, checkpoint não validado, corte de inserção do sentimento ignorado, uma consulta por candle, thread sem
timeout, thread não terminada, morte da thread não detectada, encerramento que não termina, evento e pedido da thread
sem validação, banco da thread que não fecha e queda não registrada.

**Suposições registradas.** (1) A bolsa é `binance` (única suportada; `runs` não guarda exchange). (2) Cauda sem candle
(o banco acaba antes de `period_end`) NÃO é erro: a execução termina no último candle fechado e `last_candle_time` mostra
onde parou; lacuna no MEIO, ao contrário, é declarada. (3) `orders.expires_candle_time` fica nulo no backtest: a validade
da limitada já está em `eligible_candles`. (4) A janela de aquecimento exige `leadIn` candles PRESENTES, sem buraco;
buraco no aquecimento é `INSUFFICIENT_HISTORY` e não lacuna.

## Walk-forward (T3.3)

Entregue em `packages/strategy-engine/src/walk-forward/` (domínio puro), `apps/api-cryptoada/src/walk-forward/` (execução e
threads) e `packages/database` (migration 0009, `walk_forward_windows`). O walk-forward reaproveita as metades do motor
(§a): o sinal sai UMA vez por combinação da série contínua e a carteira roda por janela com o `walletStep` avulso.

**Domínio (puro, decimal, sem `Date`/`Math.random`/`Intl`).**

| Decisão | Valor | Motivo |
|---|---|---|
| Janelas | `planWalkForwardWindows({ start, end, trainMonths = 6, testMonths = 2, stepMonths = 2 })`: meses de calendário UTC por aritmética inteira (dia inexistente vai para o último do mês), todas as fronteiras contadas do começo do período; ajuste `[trainStart, trainEnd)` e teste `[testStart, testEnd)` com `trainEnd = testStart`; passo < teste é `INVALID_WINDOW_CONFIG` (testes sobrepostos); menos de 3 janelas é `PERIOD_TOO_SHORT` | Ajuste e teste disjuntos e crescentes; o mesmo candle nunca é contado em dois testes |
| Aquecimento | cada janela carrega `trainLeadInStart`/`testLeadInStart` (`leadIn` candles antes do início); a carteira de cada período parte do candle-âncora (o anterior ao período: decide no fechamento dele, executa na abertura) | O aquecimento não vaza teste para o ajuste: o sinal é causal e o ajuste termina estritamente antes do teste |
| Grade | `{ parameters: [{ path, values }] }` sobre um catálogo FECHADO (`thresholds.*`, `risk.*`, `regime.period/trendThreshold`, `entry.*` e `rules.<id>.<campo>` com os campos por tipo de regra); caminho fora do catálogo, ausente na configuração-base (regime sem ADX, entrada a mercado), de tipo errado ou repetido é `INVALID_GRID` | Nada de caminho arbitrário (`__proto__`, `id`, `kind`, pesos) |
| Teto | `MAX_WALK_FORWARD_COMBINATIONS = 200` conta só as combinações VÁLIDAS (o esquema inteiro da estratégia decide: período rápido < lento etc.); as inválidas são descartadas e contadas à parte; acima do teto, `GRID_TOO_LARGE` com a contagem ANTES de rodar; produto bruto acima de 5.000 também recusa sem enumerar | Uma grade 20 × 20 tem 400 brutas e 190 válidas e passa |
| Seleção | `selectBestParameters`: maior Sharpe líquido de custos NO AJUSTE entre as com ≥ `minTradesPerWindow` (10) operações fechadas e Sharpe definido; empate: mais operações, menor queda na mínima, primeira da grade; nenhuma elegível ⇒ `no_eligible_parameters` e a janela NÃO opera no teste (carteira parada: `halt` no âncora, só a régua anda) | Nunca escolhe a "menos pior" |
| Encadeamento | `chainWindowResult`: o teste de cada janela recomeça do patrimônio FINAL da anterior em unidades relativas (fator = patrimônio carregado ÷ saldo inicial, 20 casas; valores com 12 casas). A posição aberta no fim do teste é liquidada ali (operação `command`, `netProfit` = lucro não realizado) porque a janela seguinte recomeça parada. A régua da janela 0 é a própria; das seguintes, só a razão interna ao primeiro ponto continua a anterior | Repagar a entrada da régua a cada janela a empurraria para baixo e favoreceria a estratégia |
| Relatório | `concatenateOutOfSample` + `computeRunMetrics` sobre a curva encadeada: é o RELATÓRIO PRINCIPAL (`runs.metrics`) | Constituição §3 |
| Alerta | `detectOverfitting`: dispara com (1) Sharpe fora < 50% (`OVERFITTING_DEGRADATION_LIMIT = '0.5'`, estrito) do de dentro (média ponderada pelos pontos do ajuste, só janelas elegíveis), (2) fora negativo com dentro positivo, (3) menos de `MIN_ELIGIBLE_WINDOW_FRACTION = '0.5'` das janelas elegíveis, (4) fora indefinido com dentro positivo; devolve `{ isAlert, reasons, inSampleSharpe, outOfSampleSharpe, degradation, eligibleWindows, totalWindows }`, `null` com motivo quando indefinido | Dentro ≤ 0 não tem razão definida e não dispara por (1) |

**Execução.**

| Decisão | Valor | Motivo |
|---|---|---|
| Pedido | `options` de `runWalkForward` = grade, `trainMonths`/`testMonths`/`stepMonths`, `minTradesPerWindow` (+ `threads`, `now`, `engine`, `onProgress`). A grade fica na execução, não na versão da estratégia. **Desde a T3.4 o pedido mora na linha (`runs.request`, migration 0010)** e a thread o lê de lá: as opções só valem quando a linha não tem pedido (linha anterior à 0010 e contratos em memória); o checkpoint guarda o HASH do pedido efetivo e uma retomada com outro é `OPTIONS_MISMATCH` | Não alterar `run_parameters` (o `runHash` das carteiras)
| Busca | Uma unidade = uma combinação: o sinal sai UMA vez da série contínua (do aquecimento da combinação ao fim do último AJUSTE) e a carteira roda por janela, devolvendo `{ trades, sharpe, maxDrawdownAtLow, points }` por janela. Até `WALK_FORWARD_THREADS` (env, padrão 2, 1–8) threads (`search.worker.ts`), mensagens `z.strictObject`; o resultado é função pura da combinação e NÃO depende do número de threads | A ordem janela × combinação exigiria todos os sinais de todas as combinações em memória |
| Checkpoint | Busca: `runs.engine_state` guarda os resumos das combinações avaliadas (`last_candle_time` = começo do primeiro ajuste + combinações avaliadas), um commit por combinação. Teste: por janela, na MESMA transação (`commitUnit`: status → janela → resultados → checkpoint, com a execução travada), `last_candle_time` = fim do teste. Janela concluída não é refeita; as gravadas formam um prefixo e o patrimônio carregado vem da última | O progresso vai de 0 a 99 por (janela × combinação) e 100 só em `completed` |
| Teste | Para a janela, escolhe, refaz o ajuste da escolhida (as métricas completas vão em `in_sample`; o Sharpe reproduzido precisa bater com o resumo da busca) e roda o teste com `halt` (`window_end`) no último candle. Sinais, ordens, preenchimentos, posições, comandos e patrimônio (encadeado) do TESTE são gravados com `engine_key`/`command_id` `w<i>:`; o âncora (candle anterior ao teste) não grava sinal nem patrimônio | O âncora é do teste anterior: colidiria na chave natural |
| Cancelamento e falha | O status é lido dentro de cada unidade; `cancelled` para sem gravar a seguinte e sem erro. Falha vira `failed` com código estável (`GRID_TOO_LARGE`, `NO_VALID_COMBINATIONS`, `INVALID_GRID`, `INVALID_WINDOW_CONFIG`, `PERIOD_TOO_SHORT`, `NO_CANDLES`, `INSUFFICIENT_HISTORY`, `OPTIONS_MISMATCH`, `SEARCH_WORKER_FAILED`, `WALK_FORWARD_TIMEOUT`, `WORKER_CRASHED`, …) e a mensagem original NUNCA sai | Erro de driver traz consulta, URL ou segredo |
| Relatório gravado | `runs.metrics` = métricas fora da amostra + `overfitting` + `walkForward` (janelas, elegíveis, liquidadas no fim da janela). Sai do que ficou GRAVADO (janelas e `equity_points`), então a execução retomada e a contínua passam pelo mesmo caminho | Idêntico byte a byte |
| Coordenadora | `walk-forward.worker.ts` abre o próprio banco e cria as threads de busca (worker aninhado, validado no Bun 1.3.14); a mensagem de `run` leva só o `runId` (o pedido vem da linha, T3.4); `walk-forward-thread-runner.ts` termina a thread no tempo limite e no encerramento (a execução fica `running`, recuperável) | RNF02: nada disso roda na thread da API |

**Paridade com o motor completo por janela.** `test/walk-forward-parity.contract.test.ts` compara, decisão por decisão (patrimônio,
ordens, preenchimentos, posições abertas e fechadas, comandos), o pipeline (sinal calculado uma vez + `walletStep` por
janela) com o `Engine.step` completo rodado sobre a janela, nas 4 janelas de teste e nas 4 de ajuste de uma série sintética e
em 3 janelas sobrepostas de cada um dos dois conjuntos reais. A equivalência é exata. Uma diferença MEDIDA, e aceita, é
a de ponto de partida (§"Riscos aceitos" da T2.6): o sinal da série contínua e o de um motor iniciado no aquecimento da janela
diferem pelo peso residual do primeiro candle (ε = 1e-3); na série sintética, 0 ações divergentes em 248 candles de teste.

**Prova.** Contratos sem banco (janelas à mão e 1.200 períodos aleatórios; grade e teto com 1.200 grades; seleção com 1.500
listas; encadeamento com contas à mão e 1.000 sequências; alerta com limites à mão; caso de uso, retomada na busca e no
teste, cancelamento, falhas, não-lookahead por alteração de candles, carteira parada, lacuna, ordem das operações,
1 × 4 threads, thread que morre / evento inválido / tempo limite); **28 mutantes do domínio** e **18 da execução**
reprovados (janelas sobrepostas, ajuste com dado de teste, `minTrades` ignorado, desempate não determinístico, teto contando
inválidas, relatório = dentro da amostra, limiar 50% → 100%, sinal com o candle seguinte, checkpoint antes da gravação,
cancelamento ignorado, grade fora do catálogo aceita, janela refeita na retomada, entre outros). `make walkforward-test`
(Postgres real, thread coordenadora de produção): ver a seção de medidas.

**Medidas (`make walkforward-test`, Postgres real, thread coordenadora de produção, máquina de desenvolvimento).**

| Caso | Resultado |
|---|---|
| Overfitting conhecido (passeio aleatório sem borda, custos zerados para isolar o viés de seleção, 24 combinações, 8 janelas 6/2/2 sobre 17.520 candles `1h`) | ALERTA DISPARA: Sharpe DENTRO 2,2614, FORA −0,9982, degradação −0,4414, motivos `sharpe_below_half_of_in_sample` + `negative_out_of_sample_with_positive_in_sample` |
| Tendência persistente (drift de 4 pontos-base por hora, custos reais, mesma grade) | alerta NÃO dispara: DENTRO 8,6468, FORA 8,6412, degradação 0,9994 |
| ETHUSDT `1d` × 400 real (aquecimento de 200 candles, 3 janelas 3/1/1, sem Fear & Greed) | 92 pontos de teste; fora da amostra: retorno −2,48%, Sharpe −2,25, comprar e segurar +36,75%; alerta falso (sem motivo) |
| BTCUSDT `1h` × 500 real | 12,5 dias úteis não comportam uma janela de calendário: falha tipada `PERIOD_TOO_SHORT` gravada, nenhuma janela escrita |
| Determinismo | duas execuções, 1 × 2 × 4 threads: o mesmo digest (janelas, sinais, ordens, preenchimentos, posições, patrimônio e métricas) |
| Retomada | queda na busca (52%): continua do checkpoint em 7,3 s (sem queda: 11,2 s); queda no teste (4 janelas gravadas): 1,9 s; digest idêntico ao da execução sem queda |
| Cancelamento | na busca e no teste das janelas: para entre as unidades, `cancelled` sem erro nem métricas, nada gravado depois |
| Isolamento | B não lê as janelas, a execução, o checkpoint nem o patrimônio de A, não a cancela e não abre lote nela |
| `GET /v1/health` durante o walk-forward | 119 amostras, média 0,6 ms, máxima 33–39 ms (< 100 ms) |

Tempos (17.520 candles `1h`, 8 janelas): **realista, 24 combinações, 2 threads: 12,2–12,6 s** (busca 8,5–8,9 s, teste 1,7 s,
relatório 0,15 s), 33–35 mil candles·combinações/s; 1 thread 18,0 s, 4 threads 8,1 s. **Grande, 200 combinações: 119–120 s
com 1 thread** (29,1–29,4 mil candles·combinações/s) **e 65,5 s com 2 threads** (53,4 mil). Extrapolação LINEAR em candles para
175.000 candles (5 anos em `15m`) com as mesmas combinações: 24 combinações ≈ 2 min (2 threads); 200 combinações ≈ 20 min
com 1 thread e ≈ 11 min com 2. O RNF02 só pede que rode fora da thread da API e informe progresso, o que se cumpre; a
extrapolação cresce além do linear se as janelas aumentarem junto com o período. **Gargalo medido:** a BUSCA (96% do tempo
do caso grande: indicadores do sinal, a carteira por janela e `computeRunMetrics` sobre o ajuste, 200 × 8 vezes); o teste
das janelas (1,7 s) e o relatório (0,15 s) são desprezíveis. Não foi otimizado às cegas; o caminho natural é mais threads
(8 dão ≈ 4× sobre 1) e reduzir o custo decimal das métricas de ajuste.

**Suposições registradas.** (1) A bolsa é `binance`. (2) O pedido é persistido na linha da execução (T3.4, ver "Pedido"). (3)
Posição aberta no fim do teste é liquidada ali (e contada como operação), em vez de atravessar a fronteira. (4) O ajuste
inclui o ponto do candle-âncora (retorno do primeiro candle); o teste encadeado o descarta e usa o retorno de fronteira.
(5) O âncora de uma janela cai no candle imediatamente anterior ao período; se ali há lacuna ela é declarada ao motor.
(6) `no_eligible_parameters` roda a carteira parada sobre os sinais da primeira combinação só para ter os candles e a
régua.

## Rotas REST de mercado, estratégias e execuções (T3.4)

Entregue em `apps/api-cryptoada/src/{markets,strategies,runs,openapi,docs}/` e `packages/database` (migration 0010,
`listStrategiesPage`, `listVersionsPage`, `createStrategyWithFirstVersion`, `limit` na leitura de candles). Todas as rotas são
`access: 'user'` (as de documentação, públicas e só fora de produção), com o envelope de sempre e `Cache-Control: no-store`.

**Pedido persistido (`runs.request`).** `jsonb` nulo, migration 0010 com `.rollback.sql`. Walk-forward grava
`{ grid, trainMonths?, testMonths?, stepMonths?, minTradesPerWindow? }` (validado por Zod na API ANTES de aceitar); backtest e
simulação ao vivo gravam nulo (o backtest já recebia só o `runId`: o pedido dele é a própria linha). A mensagem das duas threads
passou a levar só `{ runId }` (`z.strictObject`; campo a mais é recusado). A coluna é dado do usuário: entra em
`OWNED_TABLE_EXPORTS` (exportação LGPD) e sai com a exclusão da conta. Queda no meio + retomada usa o MESMO pedido gravado
(contrato em memória e `make walkforward-test`).

**`RunDispatcher`.** Porta `dispatch({ runId, kind }) → Promise<void>` (resolve quando a execução foi ENTREGUE, não quando
terminou; rejeita se não foi possível entregar). A implementação padrão (`createDirectRunDispatcher`) inicia a `worker_thread`
de backtest ou de walk-forward na hora e a rota responde `202`; NÃO há teto por usuário nem fila — **o ponto de troca da T3.6** (feita: ver §"Fila de
execuções (T3.6)") é a fábrica em `create-application.ts`. Falha ao despachar: a execução vira `failed` com
`DISPATCH_FAILED` na mesma requisição (nunca fica `queued` para sempre); a resposta é `202` com `status: failed`.

| Decisão | Valor | Motivo |
|---|---|---|
| Validação | Corpo `z.strictObject`; TODOS os problemas de uma vez só com `field` e `reason` (nunca o valor enviado); a configuração da estratégia e os `runParameters` são conferidos pelos esquemas do MOTOR dentro do mesmo passo do corpo; regras entre campos (período, grade só em walk-forward) saem juntas na 2ª fase | RF03/RF07, RNF04 |
| Antes de aceitar (walk-forward) | `expandWalkForwardGrid` contra a configuração-base e `planWalkForwardWindows` sobre o período cortado no candle fechado: `GRID_TOO_LARGE` (teto de 200 combinações VÁLIDAS), `NO_VALID_COMBINATIONS`, `INVALID_GRID` (texto fixo: a mensagem do motor cita o caminho enviado), `INVALID_WINDOW_CONFIG`, `PERIOD_TOO_SHORT`, todos `400`; nada é criado | RNF02, ADR 0002 §Walk-forward |
| `live_paper` | `501 LIVE_RUNS_NOT_AVAILABLE` até a Fase 4, DEPOIS da validação e da conferência da versão (versão alheia continua `404`). **Substituído na T4.1:** a rota cria a simulação (ver "Simulação ao vivo (T4.1 e T4.2)") | Não revelar existência |
| Avisos | `warnRunParameters` contra o preço (`open`) do PRIMEIRO candle do período, na criação e na leitura (mesma conta); sem candle, sem avisos de preço | Determinístico e sem gravar |
| Recurso alheio | `404` com o mesmo `<RECURSO>_NOT_FOUND`, mesma mensagem e mesmo tamanho de corpo do inexistente e do id malformado (UUID só em minúsculas, como no banco); `STRATEGY_NOT_FOUND`, `STRATEGY_VERSION_NOT_FOUND`, `RUN_NOT_FOUND` | ADR 0001 §e |
| Paginação | Cursor opaco (JSON em base64url validado por Zod), `limit` 1 a 100 (padrão 50), cursor adulterado ou parâmetro desconhecido ou repetido é `400`; as séries leem UMA página do repositório por chamada | Sem carregar a série em memória |
| Estratégias | `createStrategyWithFirstVersion` grava a estratégia e a versão 1 na MESMA transação; configuração igual (mesmo hash) devolve a MESMA versão (`200`), nova é `201`; as views nunca levam hash nem dono | RF03 |
| Parar | `POST /v1/runs/:id/stop` cancela `queued`/`running` de qualquer tipo; já cancelada responde igual (idempotente); `completed`/`failed` é `409 RUN_ALREADY_FINISHED`; a thread vê o `cancelled` entre lotes (backtest) ou unidades (walk-forward) | RF11 |
| CSV | `GET /v1/runs/:id/export.csv?table=trades\|signals\|fills\|equity\|windows` (padrão `trades`), em FLUXO por páginas de 1.000 (a 1ª página é lida antes de responder, para o `404` sair antes do corpo), `text/csv; charset=utf-8`, anexo, `no-store`, CRLF, cabeçalho fixo; decimais como texto exato (negativo incluso); célula de texto iniciada por `=`, `+`, `-`, `@`, tab ou CR leva apóstrofo; teto de 1.000.000 linhas e 60 s ABORTA o fluxo (nunca um arquivo cortado que parece completo); nunca `user_id` nem hash | RF12, OWASP CSV injection |
| Limites | Criação de execução 20/min (`EXECUTION_CREATION`), candles 60/min (`CANDLE_QUERY`), exportação 10/min (`RUN_EXPORT`), além dos 120/min por usuário | ADR 0001 §g |
| Candles | `symbol` e `timeframe` só os de `MARKET_SYMBOLS`/`MARKET_TIMEFRAMES` do ambiente; `from` incluído e `to` excluído; no máximo 5.000 candles (o intervalo é recusado antes de ir ao banco); texto decimal | RF01 |

**OpenAPI 3.1 e Scalar.** O documento é GERADO da tabela de rotas (`buildOpenApiDocument`): cada rota declara
`documentation` (resumo, esquemas Zod de parâmetros, consulta, corpo e resposta, e os erros próprios); o gerador converte com
`z.toJSONSchema` (`input` para o que a rota aceita, `output` para o que devolve), acrescenta os erros comuns pelo `access`
(401, 403, 429, 500, 503) e RECUSA gerar se alguma rota não tem documentação (lista as rotas). Os mesmos esquemas validam a
requisição, então a documentação não diverge; os contratos conferem cada resposta real contra o esquema documentado.
`GET /v1/openapi.json` e `GET /v1/docs` (HTML do Scalar) existem SÓ fora de `ENV=production`: em produção nem entram na tabela
(`404 ROUTE_NOT_FOUND`) nem no documento. **Scalar `1.72.1`**: a última versão estável publicada há mais de duas semanas em
2026-10-10 (publicada em 2026-09-25; as `1.72.2` a `1.73.1` são de 2026-09-29 a 2026-10-07) e anterior às mais novas, escolhida
EXATA (nada de `latest`/`1`), carregada de `https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.72.1/dist/browser/standalone.js`
(o arquivo original, não o minificado dinamicamente pelo jsDelivr, que o próprio CDN desaconselha para SRI) com `integrity`
`sha384-U11tb2XnKvmwt8RlTvnwUnYgrN+ur4Xyh9htLhjajWNR/Oyl5AX5DEz00qRmlrmK` — o mesmo byte do tarball do npm. A CSP da página
(e só dela; as demais rotas seguem com `default-src 'none'`) é `default-src 'none'`, `script-src 'nonce-<N>'` mais o pacote
fixado, `style-src 'nonce-<N>'`, `connect-src 'self'`, `img-src 'self' data:`: sem `unsafe-inline` nem `unsafe-eval`. O nonce muda a
cada resposta e o Scalar o lê de `<meta property="csp-nonce">` para os estilos que injeta. Conferido num navegador real
(2026-10-10): a página carrega o documento e navega; o Scalar aplica alguns `style` inline em ATRIBUTOS que a CSP bloqueia
(ruído no console, sem efeito visível) e aceitar isso é preferível a `unsafe-inline`. Trocar a versão exige trocar o hash.

**Prova.** Contratos por grupo de rota com repositórios em memória (`test/api-{markets,strategies,runs,run-series,run-export,openapi,docs-page}.contract.test.ts`):
sucesso, validação (todos os erros de uma vez, sem eco), limites, paginação, rate limit, `401` sem token, contrato negativo entre
usuários em CADA rota que endereça recurso (404 comparado com o do inexistente por `expectIndistinguishableNotFound`), CSV com
fórmula, aborto por teto; **36 mutantes** da API (`test/api-routes-mutants.contract.test.ts`: rota sem `access`, rota
pública, 404 distinguível, `userId` aceito no corpo, CSV sem proteção ou com proteção parcial, cursor sem teto, OpenAPI incompleto,
documentação ligada em produção, CSP frouxa ou vazando, versão idêntica duplicada, execução que fica `queued`, grade não validada,
pedido não gravado, entre outros) e **11 mutantes de repositório** (`make api-runs-mutants`: filtro de dono removido em cada
repositório que alguma rota usa, contra Postgres real). `make api-runs-test` sobe a API de verdade (token assinado por JWKS
local) e percorre estratégia → versão → backtest de 2 anos → séries → CSV → walk-forward → parada → isolamento entre usuários,
com `GET /v1/health` abaixo de 100 ms durante.

**Suposições registradas.** (1) Teto de página 100 também nas séries: um gráfico de 2 anos em `1h` (17.520 pontos) pede 176
páginas e esbarra nos 120/min por usuário; o painel (T5) deve usar o CSV ou a T5 sobe o teto das séries com uma constante
(`MAX_PAGE_SIZE`). (2) O padrão da fonte de sentimento é `alternative.me` quando `runParameters.sentimentSource` não é enviado.
(3) `WALK_FORWARD_TIMEOUT_SECONDS` (padrão 3.600) e `MARKET_EXCHANGE`/`MARKET_SYMBOLS`/`MARKET_TIMEFRAMES` entram no ambiente da
API (os mesmos do cron e do worker). (4) O período do pedido é em milissegundos (como `from`/`to` dos candles).

## Estratégia de exemplo (T3.5)

Entregue em `packages/strategy-engine/src/classic-scoreboard.strategy.ts`, `packages/database/src/strategies/example-strategy-seed.ts`
(migration 0011 com `.rollback.sql`) e `apps/api-cryptoada/src/strategies/{seed-example-strategy.use-case,example-seeding-user-resolver}.ts`.

| Decisão | Valor | Motivo |
|---|---|---|
| Fonte única | `CLASSIC_SCOREBOARD_STRATEGY` (`name`, `description`, `version = createStrategyVersion(config)`) no pacote do motor; o fixture de teste (`classic-scoreboard.strategy.json`) segue como oráculo e o contrato prova o MESMO `configHash` (`7dc257e6…`) e a mesma configuração. A descrição não é persistida (não há coluna): serve à documentação e a telas futuras | A constante de produção não pode divergir do que o plano §4 descreve |
| UMA vez só | `users.example_strategy_seeded_at` (a MARCA) + `UPDATE … WHERE example_strategy_seeded_at IS NULL AND deleted_at IS NULL AND blocked_at IS NULL RETURNING id`, e na MESMA transação `INSERT strategies (is_example) … ON CONFLICT DO NOTHING` e a versão 1. O `UPDATE` serializa os acessos simultâneos pelo lock da linha: o 2º relê, não casa e devolve `skipped`. Falha em qualquer ponto desfaz TUDO, inclusive a marca | Idempotente e à prova de corrida; a marca sobrevive a apagar, renomear ou editar |
| Segunda trava | Índice único parcial `strategies (user_id) WHERE is_example`: no máximo uma linha de exemplo por usuário, mesmo apagada por soft delete | Defesa em profundidade; não substitui a marca (apagar a linha de vez só é segurado por ela) |
| Quando semeia | Decorador do `UserResolver` (`createExampleSeedingUserResolver`) na `create-application`: depois de resolver a conta ATIVA, tenta semear; acessos simultâneos do mesmo usuário compartilham UMA tentativa em voo; sucesso fica lembrado no processo (conjunto limitado a 10.000 usuários, esvaziado ao encher); conta bloqueada ou apagada nunca é semeada. Vale para usuário novo (a linha de `users` nasce na mesma requisição) e para quem já existia (preguiçoso, no primeiro acesso depois do deploy) | Cobre "primeiro acesso" e "primeira listagem" sem tocar `resolveUserBySubject` (o caminho quente continua só leitura) |
| Falha | NUNCA derruba o acesso: o erro vai ao log (`example strategy seeding failed`, só o erro; o logger já redige PII) e o próximo acesso tenta de novo | A semeadura é conveniência, não requisito de login |
| Cópias | Cada usuário tem linhas próprias (estratégia e versão com ids diferentes); editar a de A não altera a de B | RF00b |
| LGPD | A estratégia de exemplo é dado do dono como qualquer outra: entra na exportação (`strategies`, `strategy_versions`) e sai com a exclusão; a marca é dado técnico e fica fora da exportação. `make lgpd-test` passou a esperar a linha a mais por dono | RNF08 |

**Prova.** `test/example-strategy.contract.test.ts` (constante = fixture por hash; caso de uso; decorador: simultâneos, cache,
conta inativa, falha tolerada e repetida, usuários separados), 6 mutantes da API (`test/example-strategy-mutants.contract.test.ts`),
`checkExampleStrategySeeding` no `make database-test` (20 acessos simultâneos → 1 estratégia e 1 versão; renomear, editar,
apagar e até remover a linha não trazem o exemplo de volta; cópias independentes; falha desfaz a marca; conta inativa; índice
parcial) e 6 mutantes do banco (`make example-mutants`: sem marca, sem índice, re-semeia, linha compartilhada, conta inativa
semeada, marca fora da transação, todos contra Postgres real). `make api-runs-test`: usuário novo → `GET /v1/strategies` já lista o
exemplo (`isExample: true`), um backtest com ele completa e 20 primeiros acessos simultâneos pela API deixam exatamente 1
estratégia e 1 versão.

## Fila de execuções (T3.6)

Entregue em `packages/database/src/run-queue/` (migration 0012 com `.rollback.sql`), `apps/api-cryptoada/src/runs/queue/` e
`apps/api-cryptoada/src/runs/{run-admission,run-queue-position}.ts`. **O despachante sem tetos da T3.4 foi substituído**: a troca é
explícita em `create-application.ts` (`createApplicationDispatcher`), e `create-direct-run-dispatcher.ts` deixou de existir.

**A fila é o banco.** `POST /v1/runs` continua gravando a execução `queued` e chamando `RunDispatcher.dispatch` (resolve na hora, `202`);
quem decide QUANDO ela roda é o despachante da fila (`createRunQueueDispatcher`), que reivindica a próxima elegível com
`claimNextRun` e entrega à `worker_thread` (a mesma de antes; o backtest e o walk-forward já aceitavam `running` com checkpoint).

| Decisão | Valor | Motivo |
|---|---|---|
| Reivindicar | (1) lista a CABEÇA da fila de cada (usuário, tipo) entre as contas ativas (`DISTINCT ON`), com `users.limits`, o `running` do tipo e o último início do usuário; (2) ordena em TypeScript pela política pura (`claim-policy.ts`); (3) para cada candidato, UMA transação: `SELECT … FROM users FOR NO KEY UPDATE SKIP LOCKED` (serializa quem reivindica para o mesmo dono; `NO KEY UPDATE` não conflita com a FK das execuções novas), RECONTA os `running` do dono e do tipo, `SELECT … FROM runs … FOR UPDATE SKIP LOCKED` na cabeça e `UPDATE … SET status = 'running', claimed_by, heartbeat_at = now(), started_at = coalesce(started_at, now())`. Dois reivindicadores simultâneos nunca pegam a mesma execução nem passam do teto | Seguro com várias instâncias da API sobre o mesmo banco |
| Tetos por usuário | `maxConcurrentBacktests` 2, `maxConcurrentWalkForwards` 1 (RF00b), lidos de `users.limits` por Zod campo a campo (inválido ou ausente = padrão); `maxActiveLivePaperRuns` 5 vale na criação | O 2º walk-forward do mesmo dono espera; o de outro dono roda |
| Teto global | `RUN_GLOBAL_CONCURRENCY` (1 a 32, padrão `max(1, núcleos − 1)`): quantas execuções ESTA instância roda ao mesmo tempo | Não esgotar a máquina |
| Justiça | Round-robin: quem NUNCA foi servido vem primeiro; depois quem foi servido há mais tempo (`max(runs.started_at)` do usuário, em microssegundos); depois a fila mais antiga e o id. Teste de não-inanição: 10 de Ana na frente e 1 de Bia depois, Bia é a 2ª a começar | Um usuário com fila grande não bloqueia os outros |
| Fila por usuário | `RUN_QUEUE_PER_USER_LIMIT` (1 a 1000, padrão 20) de execuções `queued` de backtest e walk-forward: o estouro responde `429 RUN_QUEUE_FULL` e nada é criado. Conferência antes de inserir (uma criação simultânea pode passar do teto por 1 ou 2; o teto é de uso, não de segurança) | RF00b |
| Simulação ao vivo | `409 LIVE_RUN_LIMIT_REACHED` quando as ativas (`queued` ou `running`) do dono chegam a `maxActiveLivePaperRuns`; vem ANTES do `501 LIVE_RUNS_NOT_AVAILABLE`. A fila nunca a reivindica | A regra existe desde já; a rota liga na Fase 4 |
| Batimento | `runs.claimed_by` (id da instância, um por processo) e `runs.heartbeat_at`; CHECK `claimed_by IS NULL OR status = 'running'`; estado final limpa os dois. Cada `RUN_HEARTBEAT_INTERVAL_SECONDS` (padrão 15) a instância renova SÓ as execuções que ainda roda e descobre as que perdeu (`lost`: voltaram à fila ou rodam sob outro dono; as que simplesmente terminaram não contam) | A instância que cai deixa o batimento vencer |
| Órfã | `running` de backtest ou walk-forward com batimento ausente ou mais velho que `RUN_HEARTBEAT_TIMEOUT_SECONDS` (5 a 3600, padrão 60, maior que o intervalo). **Política padrão `resume`**: a que tem checkpoint (`engine_state`) VOLTA À FILA (`queued`, `claimed_by` nulo, checkpoint, progresso e `started_at` intactos) e a próxima reivindicação a retoma, com resultado idêntico ao da execução contínua; a que não tem vira `failed` com `ORPHANED`. **Política `fail`** (`RUN_ORPHAN_POLICY=fail`): todas viram `failed`/`ORPHANED`. A simulação ao vivo nunca é tocada. Roda no boot e a cada ronda (2 s) em QUALQUER instância; duas instruções atômicas, então quem renovar o batimento antes vence a corrida | Resolve `failOrphanedRuns` (T3.1), que falhava toda `running` de todos e era inseguro com mais de uma instância; ele deixou de existir |
| Encerramento | `stop()` (SIGTERM, dentro do prazo de `shutdown.ts`): para de reivindicar, derruba as threads (`terminateAll`) e DEVOLVE à fila (`releaseClaimedRuns`: `running` → `queued`, checkpoint preservado) as execuções desta instância; a próxima instância retoma do checkpoint. Escolhido em vez de "terminar o lote em curso": o prazo do encerramento (10 s) é menor que um lote de backtest grande e o checkpoint é por lote, então devolver à fila nunca perde trabalho. Se o banco não responde no encerramento, o erro é reportado e o processo sai assim mesmo: o batimento vence e outra instância recupera | `queued` não se perde; nada fica `running` sem dono |
| Reinício | `queued` é durável. No boot (`start()`): recupera as órfãs, cancela as de contas inativas e REDESPACHA a fila; a ronda de 2 s pega o que outra instância enfileirou | Fila no banco |
| Conta inativa | A reivindicação só considera contas sem `deleted_at` nem `blocked_at` (lista e trava); as `running` de conta bloqueada ou apagada são CANCELADAS pela ronda e a thread vê o `cancelled` entre lotes; as `queued` ficam e voltam a ser reivindicadas se a conta for desbloqueada (ADR 0001 §k) | LGPD e bloqueio |
| `queuePosition` | `GET /v1/runs/:id` (e a resposta do `POST`) devolve `{ own, overall }` só para `queued` (senão `null`): `own` é a posição 1-based entre as execuções `queued` DO PRÓPRIO dono; `overall` é a posição na fila inteira, só como NÚMERO (contagem; nenhuma linha de outro usuário). A ordem é a de CRIAÇÃO; quem de fato começa antes é decidido pelo round-robin | Informar a espera sem vazar |
| Saúde do admin | `GET /v1/admin/health` ganhou `runs: { queued, running, byKind }`, só contagens agregadas por estado e tipo (`null` se o banco não responde); a rota continua sem dado de usuário | RF11 |
| Cancelar | `POST /v1/runs/:id/stop` numa `queued` a torna `cancelled`: sai da fila (não é reivindicada) e devolve a vaga da fila do usuário | RF11 |

**Limitações assumidas.** (1) Se uma instância perde a posse (batimento atrasado) enquanto a thread ainda roda, hoje o despachante só
REPORTA a perda; a thread segue até o fim (os lotes são idempotentes e o checkpoint só avança em `running`). Matar a thread seria um
refinamento. (2) O round-robin lê `max(started_at)` por usuário (índice parcial `runs_user_id_started_at_idx`); para milhares de
usuários com fila, trocar por uma coluna de "último servido". (3) O teto da fila por usuário é conferido antes de inserir, sem
travar o dono.

**Prova.** Contratos puros e com fakes: política de reivindicação e tetos (`test/run-queue-policy.contract.test.ts`), despachante
com relógio injetável (`test/api-run-queue-dispatcher.contract.test.ts`: teto global, boot, batimento, órfãs, encerramento, `abandon`),
ligação com as threads (`test/api-application-dispatcher.contract.test.ts`), tetos de criação e posição
(`test/api-run-admission.contract.test.ts`), ambiente (`test/run-queue-environment.contract.test.ts`) e saúde agregada; **20
mutantes da API** (`test/run-queue-mutants.contract.test.ts`). `make database-test` e `make queue-mutants` (14 mutantes do banco:
teto ignorado, FIFO puro, sem `SKIP LOCKED` na execução e no usuário, sem a trava do usuário, batimento não renovado, órfã nunca
detectada, órfã que perde o checkpoint, `queued` perdida no encerramento, conta bloqueada reivindicada, posição que vaza de outro
usuário, posição de execução alheia legível, contagem sem dono, estado final que guarda a posse) rodam os checks da fila no
Postgres real. `make queue-test`: duas instâncias reais sobre o mesmo banco, o 2º walk-forward do mesmo dono espera enquanto o de
outro dono roda, 10 backtests de um dono + 1 de outro (o de outro começa antes da 3ª), 24 execuções em 2 instâncias (cada uma
entregue UMA vez, nenhuma perdida), queda no meio com batimento vencido e retomada do checkpoint com resultado IDÊNTICO ao da
contínua, reinício sem perder a fila e isolamento pela API (posição, 404, saúde, `429` e `409`).

## Simulação ao vivo (T4.1 e T4.2)

Entregue em `apps/worker-cryptoada/src/live/`, `packages/database/src/live-runs/` (sem migration) e `packages/run-recording/` (novo), com
`POST /v1/runs` ligando `live_paper`. **Só o worker avalia**; a API cria a execução e a encerra, nunca calcula um candle. O passo é o
mesmo do backtest: `advanceCandle` (em `@cryptoada/run-recording`) chama o `Engine.step` de produção, e o backtest da API passou a
usá-lo também (as peças que os dois compartilham — passo de candle, mapeamento decisões → linhas, rastreio de posição, escolha do
sentimento, mapeamento registro → candle e parse de JSON canônico — saíram de `apps/api-cryptoada/src/backtest/` para o pacote, porque
uma app não importa código de outra).

| Decisão | Valor | Motivo |
|---|---|---|
| Quem reivindica | `createLiveRunRepository(handle).claimLiveRuns({ claimedBy, heartbeatTimeoutSeconds })`: as `queued` e as `running` de batimento vencido, de conta ativa, UMA por vez, cada uma numa transação com o lock do usuário (`FOR NO KEY UPDATE SKIP LOCKED`), a contagem das ativas do dono (`running` com batimento fresco) contra `maxActiveLivePaperRuns` e o lock da execução (`FOR UPDATE SKIP LOCKED`); `claimed_by` + `heartbeat_at` como na fila (T3.6). `renewHeartbeat` e `releaseClaimedRuns` são os mesmos da fila | Dois workers nunca avaliam a mesma simulação; a de um worker caído passa a outro quando o batimento vence; o teto de ativas vale também sob disputa. A fila de backtests continua sem tocar `live_paper` |
| Conta inativa | A reivindicação só considera conta sem `deleted_at` nem `blocked_at`; `cancelLiveRunsOfInactiveOwners` cancela as `running` dela a cada ronda (as `queued` ficam e voltam se a conta for desbloqueada); o dono da execução vem de `resolveRunOwnerScope`, que não resolve conta apagada ou bloqueada | ADR 0001 §k. A fila só cancelava backtest e walk-forward; para o ao vivo isto é do próprio repositório |
| Ronda | `createLiveEvaluator(...).tick()`: cancela as de conta inativa, renova o batimento (a posse perdida sai da lista), reivindica e avalia cada execução detida, todas em paralelo e SEM que uma derrube outra (a avaliação de uma execução nunca lança: vira desfecho). O `createLiveScheduler` roda uma ronda a cada `LIVE_POLL_SECONDS` (padrão 5) e uma a mais a cada candle gravado pelo stream (`onCandleStored`); as rondas nunca se sobrepõem; no SIGTERM espera a ronda no ar e devolve as simulações da instância à fila | RNF03 (alerta em até 10 s do fechamento); retomada por qualquer instância |
| Um passo = UMA transação | `runInBatch`: trava a execução, confere `running`, grava as linhas do candle (`signals`, `orders`, `fills`, `positions`, `equity_points`, `run_commands`) e o checkpoint (`engine_state` canônico + `last_candle_time`) juntos. O checkpoint só avança (`last_candle_time` estritamente maior): recusado ⇒ `already_recorded` e a transação inteira é desfeita | Reiniciar nunca duplica operação nem sinal: o que caiu antes do COMMIT não existe e o que caiu depois já está no checkpoint |
| Retomada | Cada ronda lê o checkpoint (nenhum estado em memória entre rondas), confere que o estado é DESTA estratégia e DESTES parâmetros (`engineVersion`, `configHash`, `runHash`) e que termina exatamente no `last_candle_time`, e processa os candles fechados depois dele em ordem, no máximo `maxStepsPerPass` (500) por ronda. Sem checkpoint é a largada: o aquecimento (candles antes de `period_start`) precisa estar inteiro no banco, senão `INSUFFICIENT_HISTORY`; o estado inicial (capital fictício e parâmetros de risco dos `run_parameters`, versão da estratégia imutável por hash) nasce com `createInitialState` no primeiro passo | O estado inicial é função pura de entradas imutáveis, então não há o que gravar antes do primeiro candle; hashes recalculados do conteúdo a cada ronda |
| Candle repetido | O estado é a verdade: candle com abertura ≤ à do último processado é pulado sem tocar o motor nem o banco (`CANDLE_ALREADY_PROCESSED` = pule, §a); a vela reentregue pelo stream já não duplica no `upsertCandles` | Idempotência nos dois níveis |
| Lacuna | Buraco entre o último candle processado e o seguinte do banco só é declarado ao motor (`confirmedGapCandles` exato) se a recuperação do stream já o marcou como inalcançável (`unfillable`, o conjunto vivo de `gap-recovery.ts`, compartilhado com o avaliador); senão a simulação ESPERA (não falha, não avança) até a recuperação preencher. Lacuna confirmada ⇒ regra de §a: posição fechada na abertura seguinte com motivo `gap`, ordens caducas | Candle que só "ainda não chegou" nunca vira lacuna no ao vivo (paridade com o backtest) |
| Falha | Erro tipado (hash, versão, histórico, estado, entrada recusada pelo motor) ⇒ `failed` com código estável (`HASH_MISMATCH`, `INSUFFICIENT_HISTORY`, `ENGINE_STATE_UNUSABLE`, `ENGINE_REJECTED_INPUT`, …) e nada mais: o texto do erro original NUNCA sai (no log vai o código e o nome da classe). Erro de banco ou rede (SQLSTATE fora das classes 22, 23 e 42, ou código de conexão) NÃO falha a execução: ela segue detida e a ronda seguinte retoma do checkpoint | Falha de infraestrutura não pode matar uma simulação de semanas |
| Exclusão da conta | Violação de FK (23503) no passo, ou execução que sumiu, = execução encerrada, sem erro e sem `failed` | ADR 0001 §k |
| API | `POST /v1/runs` com `kind: live_paper`: o corpo NÃO leva `periodStart` nem `periodEnd` (`not_allowed_for_kind`); a execução nasce `queued` com `period_start` = abertura do candle em curso pelo relógio da API e sem fim, e não passa pelo despachante de backtests; backtest e walk-forward passam a responder `required` quando falta o período. `409 LIVE_RUN_LIMIT_REACHED` acima do teto segue; o `501 LIVE_RUNS_NOT_AVAILABLE` saiu. `POST /v1/runs/:id/stop` cancela a `queued` ou `running`; o worker vê o `cancelled` no passo seguinte e para | RF09 |

**Paridade (T4.2).** `test/live-parity.contract.test.ts` (em memória) e o `make live-test` (Postgres) rodam o MESMO conjunto de candles
reais (`BTCUSDT 1h × 500` e `ETHUSDT 1d × 400`, `test/fixtures/strategy-engine/market/`) como backtest (thread de produção, período a
partir do candle `leadIn`) e como simulação ao vivo passo a passo (uma transação por candle, 64 passos por ronda) e exigem: as mesmas
linhas uma a uma — sinais, ordens, preenchimentos, posições abertas e fechadas, patrimônio (ids, preços, quantidades, motivos, taxas) —,
o mesmo digest SHA-256 do conjunto, o mesmo `engine_state` no último candle e o mesmo `last_candle_time`. Medido: `BTCUSDT 1h`: 307
sinais, 27 ordens, 27 preenchimentos, 14 posições, 307 pontos de patrimônio, digest `1db049e92d591707…`; `ETHUSDT 1d`: 207, 20, 20, 10,
207, digest `7c8849814fd68407…`; **~3 ms por passo** com o Postgres local (500 passos em ~1,3 s). Uma execução ao vivo interrompida e
retomada é igual à contínua, que é igual ao backtest.

**Prova.** 54 contratos sem banco (`test/live-evaluator*.contract.test.ts`, `test/live-scheduler.contract.test.ts`,
`test/live-parity.contract.test.ts`: passo por candle, queda dentro de cada ponto sensível, posse perdida, assunção, encerramento
gracioso, cancelamento, conta inativa, FK, lacuna que espera e que se confirma, candle repetido, histórico curto, hashes, versão do
motor, checkpoint de outra execução, sentimento com corte de inserção, erro de banco repetível e defeito de dado que falha, texto do erro
que não vaza) e **33 mutantes** do avaliador e do agendador (`test/live-mutants.contract.test.ts`) reprovados — o juiz roda uma cópia do
módulo (com a cópia do pacote de gravação ao lado) num processo à parte. No banco, `make database-test` e `make queue-test` (checks
`live-run-checks.ts`: marca com dono e batimento, teto por usuário, 200 rodadas × 6 workers disputando a única vaga, `SKIP LOCKED`,
assunção por batimento vencido, vencido não ocupa vaga, conta inativa, devolução) e `make queue-mutants` (+10 mutantes do banco: teto
ignorado, sem lock do usuário nem da execução, assunção proibida, vencido que ocupa vaga, tipo e dono não filtrados, cancelamento
que atinge backtest ou conta ativa). `make live-test` (Postgres descartável, API real, worker em PROCESSO à parte): paridade com o
backtest; morte do processo por SIGKILL depois do 1º passo, no fim do aquecimento, aos 250 e de fora aos 60 e 230 candles, com retomada
por outra instância e digest idêntico ao contínuo; passo = uma transação (o banco recusa o checkpoint de um passo depois das linhas
dele e nada sobra); candle repetido; conta bloqueada, apagada no meio e dados apagados entre dois passos; dois workers e seis
simulações de três usuários (cada uma avaliada por um só); teto de 1 ativa; lacuna recuperável e confirmada; falhas tipadas; API de
ponta a ponta. `make live-mutants`: 6 mutantes do adaptador (passo em duas transações, checkpoint recusado que deixa linhas, bolsa errada,
leitura de candles desde o começo, sem corte de inserção do sentimento, falha nunca gravada) reprovados pelo `live-test` inteiro.

**Limitações assumidas.** (1) A simulação ao vivo não termina sozinha (sem `period_end`): só `stop`, falha tipada ou conta inativa a
encerram; `progress` fica em 0 e o painel mostra `last_candle_time`. (2) A marca de lacuna inalcançável vive na memória do worker e só
nasce para buraco com mais de 24 h dentro da janela de retrocesso (`STREAM_GAP_LOOKBACK_HOURS`, 168 h): buraco recente espera; buraco
mais velho que a janela, depois de um reinício, não é mais marcado e a simulação fica esperando por ele até alguém preencher (o
backfill do cron). Esperar é conservador (nenhuma decisão errada), mas uma posição aberta fica sem stop avaliado nesse tempo. (3) Uma
ronda avalia no máximo 500 passos por execução; o batimento é renovado uma vez por ronda, então uma ronda mais longa que
`LIVE_HEARTBEAT_TIMEOUT_SECONDS` (padrão 60) deixa outra instância assumir (o checkpoint monotônico impede dano: o passo repetido é
recusado). (4) Conta bloqueada ou apagada no meio de uma ronda deixa terminar, no máximo, os passos dessa ronda (candles históricos já
fechados); a ronda seguinte cancela. (5) O estado inicial não é gravado na criação: nasce no primeiro passo. (6) Sem histórico de
aquecimento a execução falha com `INSUFFICIENT_HISTORY` no worker, não na criação.

## Sobrevivência do saldo (T4.3)

Entregue em `packages/strategy-engine/src/survival/` (`SURVIVAL_VERSION = 'survival-1'`) e exposta por `GET /v1/runs/:id` (campo `survival`
do detalhe da execução; `POST /v1/runs` já devolve os níveis). É o RF09: a partir do capital fictício, o piso e a meta de dobro, o
tempo até cada um quando atingido e, enquanto não, `null` com o progresso. `computeBalanceSurvival({ initialBalance, startTime,
durationMilliseconds, settings, points })` é PURA (decimal exato, sem `Date`, `Math.random` nem I/O; o teste de fronteira do pacote varre os
arquivos novos) e recusa a entrada em voz alta com `SurvivalInputError` (códigos `INVALID_INITIAL_BALANCE`, `INVALID_SETTINGS`,
`INVALID_TIME`, `INVALID_POINT`, `POINTS_OUT_OF_ORDER`), sem repetir o valor recebido.

| Decisão | Valor | Motivo |
|---|---|---|
| Níveis | `piso = ceil8(saldo inicial × floorRate)` e `meta = ceil8(saldo inicial × doubleRate)`: os dois arredondados PARA CIMA a 8 casas (o piso fica mais alto, a meta mais difícil). `floorRate` ∈ (0, 1) e `doubleRate` ∈ (1, 100], até 4 casas, texto decimal canônico (`"0.80"` = `"0.8"`); padrões do RF09: `0.8` e `2` | Contra o usuário, como toda a aritmética de dinheiro do motor (§e) |
| Piso atingido | primeiro candle da simulação com `equityAtLow <= piso` (o VALE do candle, que inclui a posição valorada na mínima): tocar já vale | Lado pior, sem adivinhar o que aconteceu dentro do candle (constituição §3) |
| Dobro atingido | primeiro candle com `equity >= meta` (o FECHAMENTO): alcançar vale; a máxima do candle não conta | O vale é conhecido pelo motor; a máxima só serviria para uma posição que ainda pode sair abaixo dela |
| Tempo | do início da simulação (`period_start`) ao FECHAMENTO do candle em que o marco foi observado (`abertura + duração − início`), em milissegundos inteiros; `null` enquanto não atingido. `observedMilliseconds` é o mesmo até o último candle visto | Todo candle é medido pelo instante em que o dado deixou de ser parcial |
| Aquecimento | pontos de candles ANTES do início (`candleOpenTime < startTime`) são lidos e validados, mas não contam: o motor já passou por eles com o caixa inicial | Os candles do aquecimento não fazem parte da simulação |
| Progresso | fração de 0 a 1 em texto, 4 casas: consumo do piso `(saldo − vale mais fundo) ÷ (saldo − piso)` PARA CIMA e ganho do dobro `(fechamento mais alto − saldo) ÷ (meta − saldo)` PARA BAIXO; `0` se nunca saiu do saldo; `1` se e SÓ se o marco foi atingido (o consumo do piso é limitado a `0.9999` enquanto não atingido: arredondar para cima chegaria a `1` a um centavo do piso) | Pior para o usuário nos dois lados e sem "100%" sem o marco |
| Configuração | `runs.request.survival` (`{ floorRate, doubleRate }`), gravada só quando o corpo do `POST /v1/runs` traz `survival` (e só em `live_paper`; nos outros tipos `not_allowed_for_kind`); ausente vale o padrão. Os campos inválidos saem com o caminho (`survival.floorRate`), todos de uma vez, sem o valor. Sem migration e sem tocar `runHash` | `request` já guarda o pedido da execução (T3.4); `RunParameters` é o que o hash trava |
| Leitura | `GET /v1/runs/:id` de uma execução `live_paper` lê a curva de patrimônio por páginas de 5.000 (cursor estável) e chama a função pura; outros tipos: `survival: null`. A lista (`GET /v1/runs`) NÃO traz o campo: custaria uma leitura da curva por execução da página | Sem estado novo para manter; o worker não precisa gravar nada além do que já grava |

**Prova.** `test/balance-survival.contract.test.ts` (57 casos: tabela de níveis à mão com os arredondamentos, cada marco — tocar o piso,
vale contra fechamento, dobro pelo fechamento, os dois em qualquer ordem, primeira vez, timeframe de 4 h, aquecimento, sem pontos —,
progresso contra o usuário e nunca `1` sem o marco, configuração e entrada inválidas por código, pureza e determinismo, e **600 séries
aleatórias contra um oráculo `bigint` independente**, sem `decimal.js` nem o código do pacote), **23 mutantes**
(`test/survival-mutants.contract.test.ts`: arredondamento do piso e da meta, `<=` virando `<`, vale ou fechamento trocados, primeira vez,
aquecimento contado, tempo até a abertura, progresso arredondado ao contrário, `1` sem o marco, ordem, valor negativo, saldo zero, taxa
`1` aceita, campo desconhecido) reprovados; na API, 8 contratos novos em `test/api-runs.contract.test.ts` (níveis desde a criação,
configuração guardada e relida, campos inválidos sem eco, só ao vivo, tempo a partir da curva gravada, 10.500 pontos em 3 páginas, tipos
sem o campo, 404 idêntico entre donos) e 7 mutantes da API reprovados; `make live-test` compara a rota da API real com a função pura
sobre a curva que o worker gravou no Postgres (piso 99% tocado em 140.400.000 ms e meta 100,4% em 118.800.000 ms, em 306 candles reais).

## Tempo real (T4.4 e T4.7)

| Peça | Decisão | Motivo |
|---|---|---|
| Escutador de `LISTEN` | Cliente do protocolo Postgres v3 próprio (`packages/database/src/notifications/`): SCRAM-SHA-256, TLS por `upgradeTLS`, só `trust` e SCRAM, reconexão com backoff e jitter, RE-LISTEN | O `Bun.SQL` 1.3.14 não tem `listen`/`notify` em runtime (os tipos 1.4.2 mentem); dependência npm é proibida |
| Aviso do worker | `pg_notify('run_events', {runId, kind, eventId})` na mesma transação do passo (`publishStepEvents`); `kind` ∈ `signal`, `trade`, `balance`; `eventId` é o uuid da linha (saldo: o `candle_time`) | Atomicidade: sem aviso de passo desfeito; payload sem dado pessoal |
| Entrega | A API resolve o dono pelo banco e entrega ao hub `userId → sockets`; sem broadcast; queda do LISTEN = `resync` para todos | ADR 0001 §e e §r |
| Ticker | UMA conexão ao stream combinado `<par>@miniTicker` (~KB/s); `!miniTicker@arr` traria o mercado inteiro | Custo e superfície |
| Agregação | Janela por par: o último tick de cada segundo é publicado (100 ticks em 1 s = 1 publicação); tick repetido (mesmo `eventTime`) é descartado; `change24h` em BigInt, 4 casas, meio afastando do zero | Teto de 1 atualização/s/par sem perder o último valor |
| Porta | `PriceTickListener` recebe cada tick agregado uma vez (a futura spec de alertas assina nela) | Desacoplar consumidor |
| Assinatura | `{type:'subscribe', pairs}` limitado à lista suportada e a `STREAM_MAX_PAIRS_PER_SOCKET` (10); par inexistente = erro tipado `PAIR_NOT_SUPPORTED` | Impedir assinatura aberta |
| Dado velho | Sem tick por `TICKER_STALE_SECONDS` (10) o par é selado `stale: true`; volta ao normal no próximo tick | O usuário não decide com preço parado sem saber |
| Relógio | `serverTime` usa o desvio do relógio já medido (`createServerClock`) | Uma fonte de verdade para o tempo |
| Env | `TICKER_STREAM_ENABLED` (padrão `false`), `STREAM_MAX_PAIRS_PER_SOCKET`, `TICKER_STALE_SECONDS`, `BINANCE_BASE_URL`, `BINANCE_STREAM_URL` (https/wss em produção) | Ticker desligado por padrão: o worker segue sem depender dele |

**Prova.** Contratos do protocolo (codificador, decodificador, SCRAM contra vetores da RFC 7677, URL de conexão) e um Postgres falso em
memória; Postgres 18 real em `make database-test` (SCRAM, `require`, `prefer`, queda e reconexão); `stream-endpoint` (26 casos com
servidor real), `stream-hub`, `stream-sweep`, dispatcher, `market-stream` (23), `stream-market-endpoint` (12) e `market-stream-pipeline`
(Binance falsa → API → socket, p95 de publicação **1002 ms**, p50 493 ms, máximo 1003 ms, contra o teto de 2 s). Mutantes reprovados
(cópia do src): 8 do banco (`make stream-mutants`), 50 do stream, 25 do ticker e 28 do pub/sub da API. `make stream-api-test` roda a
API e o worker reais, o fake Keycloak e a Binance falsa.

**Limitações conhecidas.** TLS do escutador (`require` e `verify-full`) só foi verificado à mão contra um Postgres com certificado, não
em teste automático. Mensagem acima do teto fecha com 1006 no cliente do Bun (o servidor registra o motivo), e o cliente do Bun mostra
1000 no lugar de 1001. Uma instância de API (tickets, hub e rate limit em memória). O ticker é público e agregado por instância.


## Alerta de sinal no Telegram (T4.5)

O alerta tem duas metades que só se encontram no banco: o **passo ao vivo** (`apps/worker-cryptoada/src/live/`) o enfileira e o **despachante** (`src/alerts/`) o entrega.

| Peça | Decisão | Motivo |
|---|---|---|
| Caixa de saída | Tabela `alerts` (migration `0013`): `(run_id, candle_time, side, channel)` único; `status` ∈ `pending`, `sent`, `failed`, `skipped`; `attempts`, `next_attempt_at`, `locked_until` (arrendamento), `last_error` (código curto); FK composta `(run_id, user_id)` | Chave de idempotência `execução + candle + lado`; o banco recusa dono divergente |
| Nascimento | `writer.appendAlerts` **na transação do passo** (`runInBatch`), depois das linhas e antes do checkpoint; `ON CONFLICT DO NOTHING` | Passo desfeito leva o alerta junto; passo repetido (queda, reentrega, candle já gravado) nunca o duplica; provado com o checkpoint recusado por gatilho |
| Quem recebe | Só dono ativo com `telegram_chat_id` e `alert_telegram_enabled`; o chat **não é copiado** | ADR 0001 §s |
| Conteúdo | `buildStepAlert` (puro): par, timeframe, fechamento, placar, regime, **motivo** que o motor gravou, ação simulada (`enter` / `exit` / `none`), stop e alvo e o acerto histórico. Entrada nova: stop = fechamento − `stopDistance` e alvo = fechamento + `targetDistance` da ordem (referência; a execução é na abertura seguinte, com slippage); sem ordem nova: os níveis da posição aberta, se houver. A ordem que conta é a que o **sinal** provocou (entrada para BUY, venda a mercado para SELL): stop e alvo protetores também nascem e preenchem no candle, mas não são a ação do sinal | RF10 |
| Acerto histórico | `runs.metrics.winRate` e `trades` do walk-forward **concluído mais recente da mesma versão** do dono (o relatório é o fora da amostra concatenado, plan §5); lido uma vez por ronda, **best-effort**: leitura que falha ou ausência vira `hitRate: null` ("sem walk-forward concluído"), nunca um número inventado nem um passo quebrado | Plan §5 |
| Todo BUY/SELL alerta | Inclusive o que não gera ordem (já posicionado, entrada recusada, sem posição para vender): a mensagem diz "ação simulada: nenhuma" e por quê | Fiel ao RF10; decisão registrada para revisão do produto (repetição enquanto o placar persiste) |
| Frescor | O alerta só nasce se o fechamento do candle tem no máximo `LIVE_ALERT_MAX_AGE_CANDLES` (2) candles de idade: replay depois de parada longa não manda notícia velha | Reinício depois de horas não despeja alertas antigos |
| Despacho | `createAlertDispatcher`: reivindica até 10 (`FOR UPDATE SKIP LOCKED` + arrendamento de 120 s > 10 × 8 s de prazo), ordena por candle e envia **em sequência** ao chat do dono da linha; cada alerta é isolado (um erro não derruba o lote nem o ciclo). 429 respeita `retry_after` (com piso da espera padrão e teto de 15 min), 5xx e rede repetem com espera 30 s, 60 s, 120 s e 240 s, a 5ª tentativa desiste (`failed`), 4xx (401, 403, 404...) é definitivo, conteúdo ilegível é `bad_payload`, sem vínculo é `no_link` | A falha do Telegram **nunca** chega ao passo ao vivo: são processos de vida independentes ligados só pela tabela |
| Cliente | `fetch` direto (plan D8), `AbortSignal.timeout` de 8 s, `redirect: 'error'`, resposta validada com Zod (`ok`, `parameters.retry_after`); só códigos saem dele | Token na URL |
| Env | `TELEGRAM_BOT_TOKEN` (opcional; desliga o recurso), `TELEGRAM_API_BASE_URL` (padrão `https://api.telegram.org`; permite a Bot API falsa), `ALERT_POLL_SECONDS` (1 a 60, padrão 2) | RNF03: alerta ao painel em até 10 s |

**Prova.** 19 + 22 contratos do passo (`live-alerts`, `live-alert-parts`: um alerta por BUY/SELL, nenhum por HOLD, níveis conferidos contra a ordem e a posição, frescor no limite exato, queda e leitura atrasada sem duplicar, leitura do acerto que falha), `telegram-client` (Bot API falsa em HTTP de verdade), `alert-message`, `alert-dispatcher` (backoff, `retry_after`, desistência, recusa, rede fora do ar, quem não tem vínculo, três usuários, dois despachantes, log limpo) e `alert-scheduler`. Mutantes reprovados: 22 no passo (`live-mutants`), 34 no despacho (`telegram-alert-mutants`), 11 na caixa de saída (`make alert-mutants`) e 4 no adaptador contra Postgres real (`make telegram-mutants`). `make telegram-test` (Postgres real e Bot API falsa): vínculo por código, 170 + 127 alertas de dois donos entregues ao chat certo com o acerto de um walk-forward semeado, queda do banco no passo 150 sem duplicar, despachante que morre depois de reivindicar, alerta dentro da transação do passo (checkpoint recusado por gatilho não deixa alerta), 503/429/403/rede fora do ar, seis despachantes simultâneos, desvinculação, exportação e exclusão LGPD e varredura do log.

**Limitações conhecidas.** Entrega *at-least-once* (ADR 0001 §s); um despachante por vez por alerta, mas vários podem rodar (o arrendamento reparte); sem alerta no painel (T5.5 acrescenta o canal `panel` na mesma tabela, pela mesma chave); a taxa de acerto vem do último walk-forward concluído, pode ser antiga.

## Registro cronológico em CSV (T4.6)

`GET /v1/runs/:runId/log.csv` (RF12) junta sinais, ordens e preenchimentos numa linha do tempo só.

| Peça | Decisão |
|---|---|
| Ordem | `(instante do candle, posição do tipo, chave)`: no mesmo candle, **preenchimento** (abertura, ordem do candle anterior), **sinal** (fechamento) e **ordem** (nasce com o sinal); a ordem entra no candle em que **nasceu** e a última atualização vai à parte (`last_event_time`) |
| Consulta | `listLog` no `RunResultRepository`: `UNION ALL` das três tabelas com as mesmas 23 colunas, cursor por tupla `(event_time, event_rank, entry_key) >` e uma linha a mais para saber se há próxima página; o dono entra em **cada** consulta do `UNION` |
| Fluxo | Páginas de 1.000 linhas, a primeira lida antes de qualquer byte (404 antes do corpo), tetos de 1.000.000 de linhas e 60 s que **abortam** o fluxo (os mesmos do `export.csv`) |
| Colunas | Cabeçalho fixo de 21 colunas: `time,event,action,side,order_key,order_type,purpose,status,score,regime,price,limit_price,trigger_price,quantity,notional,fee,risk_amount,stop_distance,target_distance,last_event_time,reason` |
| Formato | Tempos em UTC ISO com milissegundos e `Z`; decimais como **texto exato** (`::text` no banco, nunca por `Number`); vazio onde o tipo da linha não tem o campo; texto passa pelo neutralizador de fórmula (`=`, `+`, `-`, `@`, tab e CR ganham apóstrofo) e pelo escape RFC 4180 da T3.4 |
| Acesso | `access: user`, `OwnerScope`, `404` idêntico ao de uma execução inexistente ou malformada; cota `RUN_EXPORT` (10 por minuto) compartilhada com `export.csv` |

**Prova.** `api-run-log-export` (18 contratos: cabeçalho, ordem completa em literal, decimais de 19 algarismos, ISO, injeção, RFC 4180, fluxo em 3 páginas, 3.000 linhas sem repetir nem perder, tetos, cota, 404 idêntico), 10 mutantes da API, `make database-test` e `make runlog-mutants` (10 mutantes contra Postgres real: ordem, cursor, linha extra, instante da ordem, float, filtro de dono de cada consulta) e `make api-runs-test` (19.999 linhas = sinais + ordens + preenchimentos do banco).

## Metas (T4b.1)

`evaluateGoal` (`packages/strategy-engine/src/goal/`) responde "com esta estratégia neste par, quantas vezes o saldo chegou à meta antes de perder o máximo tolerado, dentro do prazo?". Puro e determinístico, sem relógio, aleatoriedade nem `Math.exp/log/pow`; as taxas e os níveis usam `EngineDecimal`.

| Peça | Decisão |
|---|---|
| Entrada | Série CONTÍGUA de candles (o motor recusa lacuna, `CANDLES_NOT_CONTIGUOUS`), estratégia, `RunSetup` e a meta `{ targetRate, maxLossRate, horizonDays }` validada por `parseGoalSpec` (alvo de `0` a `10`, prazo de 1 a 365 dias; fotografia estrita, campo a mais é `INVALID_GOAL`) |
| Níveis | `alvo = saldo × (1 + alvoRate)` e `piso = saldo × (1 − perdaRate)`, ambos **arredondados para CIMA** a 8 casas (contra o usuário: o alvo é mais difícil e o piso é atingido mais cedo) |
| Janelas | Uma janela por candle decidido cujo prazo inteiro cabe na série (passo de 1 candle). Os SINAIS saem UMA vez da série contínua (`signalStep`); a carteira de cada janela nasce livre e só a trajetória a partir da primeira compra é calculada, e é compartilhada entre as janelas com a mesma primeira compra (cache por índice da compra). A equivalência com rodar a janela inteira é provada pelo oráculo em `BigInt` |
| Desfecho de uma janela | Por candle, nesta ordem: **perda máxima** (`equityAtLow ≤ piso`, o lado pior) ANTES do **alvo** (`equity ≥ alvo`, no fechamento), e por fim o **prazo** no último candle. Resultado líquido = valor final (a mínima se parou, o fechamento nos demais). A mesma regra é `judgeGoalPoint`/`judgeGoalStep` (`goal-progress.ts`), usada também pela simulação ao vivo (T4b.4) |
| Resumo | Contagens inteiras (`windowCount`, `reachedCount`, `stoppedCount`, `expiredCount`), taxas **arredondadas para BAIXO** (`reachRate`) e **para CIMA** (`stopRate`) a 8 casas, mediana do resultado líquido e o mesmo desfecho para a compra-e-segura (`buyBenchmark`) |
| Veredito | `COMPRAR` / `SEGURAR` / `EVITAR` de `GOAL_VERDICT_RULES`: ao menos 20 janelas; `COMPRAR` com alcance ≥ 50% e parada ≤ 25%; `EVITAR` com parada ≥ 40% e alcance ≤ 15%; o resto é `SEGURAR`. A comparação é por **contagens inteiras** (nunca pelas taxas arredondadas) |
| Versão | `GOAL_VERSION = 'goal-1'`: mudar qualquer fórmula acima exige uma nova |

**Prova.** Valores à mão, oráculo independente em `BigInt` (laço ingênuo que reconstrói a carteira de cada janela com `engine.step` inteiro) sobre `ethusdt-1d-400` e `btcusdt-1h-500` e séries sintéticas, e 64 mutantes da cópia de `src` (`goal-mutants.contract.test.ts`), todos mortos.

## Próximo gatilho (T4b.2)

`computeNextTriggers` (`packages/strategy-engine/src/trigger/`) diz, por família de indicador da estratégia, o que falta para a regra mudar o voto: **aguardando entrada** (carteira livre; o que faria votar COMPRA) e **comprado** (o que faria votar VENDA).

| Peça | Decisão |
|---|---|
| Medida | `close_price`, `rsi`, `macd_gap`, `obv_gap`, `fear_greed_index`; direção `above`/`below`; limiar e distância em texto decimal de 8 casas |
| Base | `exact`: o limiar é o fechamento que dispara a regra no candle seguinte (fórmula fechada; o cruzamento de médias exponenciais usa o fechamento e o teste de motor prova que ele vira o voto de produção). `indicative`: o valor atual do indicador contra o limiar, que se move quando o candle seguinte fechar |
| Rede | Arredondamento sempre contra o usuário (distância para CIMA) e `TRIGGER_VERSION = 'trigger-1'` |
| Situação | `computeLatestTriggers` devolve o sinal do último candle junto dos gatilhos (usado pela avaliação da T4b.3) |

**Prova.** Valores à mão, teste de motor (aplicar o limiar exato vira o voto), `next-trigger-latest` e 36 mutantes mortos.

## Metas (T4b.3)

Migration `0014_goals`, `goals` com `UNIQUE (id, user_id)`, taxas `numeric` lidas e gravadas como texto exato, `symbol` VARCHAR, CHECKs de par, alvo, perda e prazo, teto de 20 metas por usuário sob disputa (linha do usuário travada na criação) e paginação por cursor `(created_at, id)`. LGPD: entra em `OWNED_TABLES`, na exportação (colunas) e na ordem de exclusão (antes de `users`).

| Rota | Uso |
|---|---|
| `GET/POST /v1/goals` | Listar (cursor) / criar; o par precisa estar habilitado (`MARKET_SYMBOLS`); a meta passa pelo esquema do motor e os campos inválidos saem juntos; `409 GOAL_LIMIT_REACHED` acima do teto |
| `GET/PATCH/DELETE /v1/goals/:goalId` | Ler / alterar parcialmente (`isActive` incluso, ao menos um campo) / apagar; meta com simulação NÃO se apaga: `409 GOAL_IN_USE` (RESTRICT da FK; o Postgres 18 sinaliza `23001`, as versões anteriores `23503`: o repositório aceita os dois) |
| `GET /v1/goals/:goalId/evaluation` | Avalia a meta de cada estratégia do dono (as 5 mais novas) × cada par habilitado, em `1d`, sobre os últimos 1.100 dias de candles; devolve o ranking, o veredito e a situação atual (sinal e próximos gatilhos); 20/min (`GOAL_EVALUATION`) |

Meta alheia, inexistente e id malformado são o MESMO `404 GOAL_NOT_FOUND` (ADR 0001 §e). O ranking (`rankGoalCombinations`) ordena por alcance decrescente e parada crescente por **multiplicação cruzada das contagens**, depois por mais janelas e, por fim, pela chave da combinação (estável); combinação sem janela vai por último. A avaliação fica em cache em memória por (versão da estratégia, par, meta, dia do último candle), com teto de 1.000 entradas. Medido com candles diários: 5 pares de uma estratégia de 120 a 260 ms a frio e ~9 ms em cache; no `make goals-test`, com 800 candles por par, 2 estratégias × 5 pares levam ~1,2 s a frio e ~40 ms em cache (o orçamento é de 1 s por estratégia).

## Simulação com meta (T4b.4)

`POST /v1/runs` aceita `goalId` só em `live_paper`: a meta tem de ser do dono (`404`), estar ligada (`409 GOAL_INACTIVE`) e ter o mesmo par da simulação (`400`). Os parâmetros da meta são **fotografados** em `runs.request.goal`: editar a meta depois não muda a simulação em curso. Migration `0015_goal_runs`: `runs.goal_id` (FK composta com o dono, RESTRICT), `goal_outcome` (`goal_reached | goal_stopped | goal_expired`) e `goal_outcome_candle_time`, com CHECKs (só ao vivo; desfecho e candle juntos), e o `side` de `alerts` aceita `GOAL`.

| Peça | Decisão |
|---|---|
| Julgamento | A cada candle fechado o worker aplica `judgeGoalStep` ao `equityPoint` (perda pelo vale antes do alvo; prazo no último candle da meta; retomada tardia depois do prazo também expira; o aquecimento não conta) |
| Saída | No desfecho, o MESMO passo reexecuta o motor com os comandos `exit_position` e `halt` (ids `goal:<runId>:<desfecho>:<tipo>`, `issuedAt` = fechamento do candle, motivos `goal_reached`/`goal_max_loss`/`goal_expired`): a posição é vendida na abertura do candle seguinte e a simulação para de entrar. Só a reexecução é gravada |
| Atomicidade | Desfecho, comandos, linhas do passo, checkpoint e alerta vão na MESMA transação do candle (`recordGoalOutcome` só grava uma vez, em execução `running` com meta); depois dela, a execução é concluída (`completeRun`) quando a carteira assenta (sem posição nem ordem pendente) |
| Alerta | Linha `GOAL` na caixa de saída do T4.5 (chave única execução + candle + lado + canal): **uma vez por desfecho**; o texto leva só mercado e meta (`formatGoalAlertMessage`), resultado arredondado para BAIXO a 8 casas |
| Reinício | O worker novo retoma do checkpoint; desfecho e alerta não se repetem e as contagens são as da execução ininterrupta |

**Prova.** 27 contratos do acompanhamento, 10 do avaliador (os três desfechos contra uma referência de produção em laço direto, reinício logo após o desfecho, nenhum duplicado), 12 do texto do alerta, 14 da API, 30 mutantes do worker, 45 do alerta do Telegram e os mutantes da API, todos mortos; `make database-test` (FK, CHECKs, desfecho uma vez, conclusão, lado `GOAL`) e `make goals-test` (API e Postgres reais: CRUD, isolamento, avaliação, os três desfechos iguais à varredura independente, entrega ao chat do dono e reinício).

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
  `convergenceCandles` e o roda em `expectIndicatorContract`; T2.3 o voto, o regime e o motivo (§f2); T2.4 o
  tamanho e os tetos de §e; T2.5 o `FillModel` e o motor completo, que **precisa passar
  `runEngineContract`** nos cenários da referência e em cenários próprios com o Placar clássico, mais o
  teste diferencial e o golden por versão (entregue: "Motor em produção (T2.5)"). A referência de teste não vira
  código de produção.
- T3.1 cria as colunas e tabelas de §a/§b/§d (`runs.engine_state`, `engine_version`, `run_parameters`,
  `run_hash`, `migrated_from_run_id`, `engine_key` em `orders` e `positions`, `signals.regime`,
  `signals.sentiment_observation`, `equity_points.equity_at_low`, `run_commands`, `sentiment_observations`).
- T3.2 (backtest, entregue: seção "Backtest em `worker_thread` (T3.2)") e T4.1 (ao vivo, entregue: seção "Simulação ao vivo (T4.1 e T4.2)"; a sobrevivência do saldo, T4.3, está na seção seguinte) são laços sobre `step` com a persistência de §b; T4.2 (paridade, entregue)
  compara as duas execuções com os mesmos `leadInCandles` e as mesmas lacunas declaradas.
- T3.3 (walk-forward, entregue: seção "Walk-forward (T3.3)") usa as metades do motor: sinal por combinação, carteira por janela.
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
| Saída sem teto de participação no volume; EMA/RSI do mesmo candle variam ~0,1% com a janela do backtest (ε = 1e-3) | Riscos aceitos na T2.6 (seção "Revisão da Fase 2") |
| Semântica de `executionReports` sem implementação | Tipos fixados; a spec 002 implementa e acrescenta cenários ao harness |
| Formato exato do texto de motivo | Fixado em §f; a T2.3 implementa e prende por tabela |
