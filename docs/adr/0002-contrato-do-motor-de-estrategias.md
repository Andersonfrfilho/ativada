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

- `strategy-engine` **não depende** de `@ativada/market-data-crypto`, `@ativada/database` nem
  `@ativada/environment`. `EngineCandle` é estruturalmente compatível com o `Candle` do market-data
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

Entregue em `apps/api-ativada/src/backtest/` (caso de uso e thread) e em `packages/database` (`resolveRunOwnerScope`,
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

Entregue em `packages/strategy-engine/src/walk-forward/` (domínio puro), `apps/api-ativada/src/walk-forward/` (execução e
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

Entregue em `apps/api-ativada/src/{markets,strategies,runs,openapi,docs}/` e `packages/database` (migration 0010,
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
(migration 0011 com `.rollback.sql`) e `apps/api-ativada/src/strategies/{seed-example-strategy.use-case,example-seeding-user-resolver}.ts`.

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

Entregue em `packages/database/src/run-queue/` (migration 0012 com `.rollback.sql`), `apps/api-ativada/src/runs/queue/` e
`apps/api-ativada/src/runs/{run-admission,run-queue-position}.ts`. **O despachante sem tetos da T3.4 foi substituído**: a troca é
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

Entregue em `apps/worker-ativada/src/live/`, `packages/database/src/live-runs/` (sem migration) e `packages/run-recording/` (novo), com
`POST /v1/runs` ligando `live_paper`. **Só o worker avalia**; a API cria a execução e a encerra, nunca calcula um candle. O passo é o
mesmo do backtest: `advanceCandle` (em `@ativada/run-recording`) chama o `Engine.step` de produção, e o backtest da API passou a
usá-lo também (as peças que os dois compartilham — passo de candle, mapeamento decisões → linhas, rastreio de posição, escolha do
sentimento, mapeamento registro → candle e parse de JSON canônico — saíram de `apps/api-ativada/src/backtest/` para o pacote, porque
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
encerram; `progress` fica em 0 e o painel mostra `last_candle_time`. (2) ~~A marca de lacuna inalcançável vive na memória do worker~~ — **deixou de existir** (spec 001, correção H1 da revisão da Fase 4):
a decisão sobre uma lacuna agora é gravada na execução e não se perde num reinício; ver "Espera por dado" abaixo. (3) Uma
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

O alerta tem duas metades que só se encontram no banco: o **passo ao vivo** (`apps/worker-ativada/src/live/`) o enfileira e o **despachante** (`src/alerts/`) o entrega.

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

## Metas: CPU fora da thread da API (A1, auditoria T6.2)

O motor é síncrono: `evaluateGoal` + `computeLatestTriggers` de 5 estratégias × 5 pares custam centenas de milissegundos a segundos de CPU, e rodavam na thread da API (cedendo o laço entre as combinações, o que não impede o atraso de quem está na fila do laço). Agora cada combinação que erra o cache é calculada num **pool limitado de `worker_threads`**, atrás de um portão. O orquestrador do caso de uso, o cache e o formato da resposta são os mesmos; o `GET /v1/goals/:goalId/plan` não mudou.

| Peça | Decisão |
|---|---|
| Pool | `GOAL_EVALUATION_THREADS` threads (1 a 4, padrão 2), criadas na primeira tarefa. Pedido e resposta validados por Zod nas duas pontas; o pedido leva estratégia, par, candles e sentimento (tudo texto/JSON, clonável), a resposta leva a avaliação e a situação, ou o código do `GoalInputError` do motor ("indisponível") |
| Tempo e cancelamento | `GOAL_EVALUATION_TIMEOUT_SECONDS` (5 a 300, padrão 30) por tarefa; estourou, a thread **morre** (única forma de parar um cálculo síncrono) e a seguinte sobe outra: `503 GOAL_EVALUATION_TIMEOUT`. O sinal do pedido (`request.signal`) cancela a tarefa em andamento ou na fila; uma combinação que falha cancela as outras da mesma avaliação. Thread que morre ou lança vira erro da tarefa (500, sem texto do motor no log) e o pool segue servindo |
| Portão das avaliações **a frio** | Só passa por ele a avaliação em que alguma combinação erra o cache. (1) **Uma em voo por usuário**: o mesmo usuário pedindo a MESMA meta divide a avaliação em voo (sem gastar nada); outra meta dele enquanto uma voa é `429` com `Retry-After: 1`. (2) **Teto global** `GOAL_EVALUATION_MAX_CONCURRENT` (1 a 32, padrão 4): acima dele, `503 GOAL_EVALUATION_BUSY` com `Retry-After`, sem gastar o orçamento de quem foi recusado. (3) **Orçamento** `GOAL_EVALUATION_COLD`: 3 por minuto por usuário (a chave é o dono, a mesma em toda rota), `429 RATE_LIMITED` com `Retry-After`, cobrado só quando o cache erra; a política de 20/min de antes continua na rota |
| Cache e PATCH | A chave do cache segue (meta, alvo, perda, prazo, versão, par, último candle). Mudar alvo, prazo ou perda máxima por `PATCH` **gasta o mesmo orçamento a frio** (cobrado antes de qualquer leitura, então a meta alheia e a inexistente respondem o mesmo `429` quando o orçamento acabou, e nada vaza); `isActive` e `symbol` não gastam, porque não entram na chave. Criar metas novas para fugir do cache também cai no orçamento (a avaliação é a frio) |
| Prova | Contrato com fakes (portão, orçamento, pool com thread roteirizada: laço sem parada, no máximo N threads, tempo, cancelamento, morte, id da resposta), 15 mutantes de caso de uso e 14 de pool/portão reprovados, e `make goals-test` com a API real: 4ª avaliação a frio do minuto e o PATCH de alvo são `429`, e `/v1/health` responde em milissegundos durante uma avaliação a frio |

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

## Plano de operação (T4b.5)

`computeLatestPlan` / `computeOperationPlan` (`packages/strategy-engine/src/plan/`, `PLAN_VERSION = 'plan-1'`) respondem, para uma meta, uma estratégia e um par: **a que preço o próximo fechamento faz a regra disparar?** Puro, sem relógio, `Date`, `Intl` nem `Math.exp/log/pow`.

| Peça | Decisão | Motivo |
|---|---|---|
| Como o preço é achado | Não há fórmula paralela por família: o plano roda o próprio `signalStep` de produção sobre **um candle hipotético** (abre no último fechamento; máxima e mínima são as pontas entre abertura e fechamento; volume repete o do último candle; abertura/fechamento do timeframe seguinte) e procura, no **tick** (`RunParameters.tickSize`), o par de preços vizinhos em que o placar passa de não sinalizar a sinalizar | Cruzamento de médias, rompimento, RSI, Bollinger, MACD e o placar inteiro ficam exatos **por construção**, inclusive com o float dos indicadores; uma fórmula fechada por família duplicaria a regra e envelheceria com ela |
| Busca | `findTransition`: distâncias que dobram (1, 2, 4... ticks) para cima e para baixo, a última encostada na borda da faixa (de 1 tick a 4× o último fechamento), bisseção até o par adjacente; não presume monotonia (o par achado é sempre válido) | O par adjacente é a prova: o preço sinaliza e o vizinho do outro lado, não |
| Nível | `PlanLevel`: `price` (texto, no tick), `trigger` (`at_or_above`: fechar NO preço ou acima dele; `at_or_below`), `direction` (lado do preço em relação ao último fechamento), `distance` e `distanceRate` (absolutas, para CIMA a 8 casas). `status`: `price`, `already_active` (o último candle já sinalizou: o preço é o último fechamento) ou `unreachable` (a regra não depende do preço, como o Fear & Greed) | Texto da tela: "fechar acima de X" |
| Por regra | `rules[]` traz o nível de COMPRA (voto +1) e de SAÍDA (voto −1) de cada regra, com a família e a base | "Por família" do RF13 |
| Base | `exact` quando só o fechamento do próximo candle importa; `indicative` com OBV (soma o volume dele) ou filtro de regime ADX (depende da amplitude dele) | Honestidade: o Placar clássico é `indicative` |
| Alvo e stop | `computePlanLevels`: preço de VENDA em que uma unidade comprada em `entrada` rende o ganho alvo (ou a perda máxima), com o que o motor cobra (compra a `entrada × (1 + slippage)` no tick, taxa nas duas pontas, venda a `preço × (1 − slippage)`), ambos **para cima** no tick (alvo mais difícil, stop mais cedo). A entrada é o preço de compra do plano (ou o último fechamento se o sinal já está ativo). Se a perda máxima for menor que o custo de entrar, o stop sai acima da entrada e o fato não é escondido | Contra o usuário, como o resto do motor |
| Data limite | `startsAt = fechamento do último candle + 1 ms`; `deadlineAt = startsAt + prazo × 86.400.000 ms` | Sem relógio no motor |

Rota `GET /v1/goals/:goalId/plan?strategyId=` (`apps/api-ativada/src/goals/goal-plan.*`): meta e estratégia do dono (alheia ou inexistente = o MESMO 404; `strategyId` ausente ou malformado = 400 de validação), candles diários do par da meta, cache em memória por (meta, taxas, prazo, versão, par, último candle), cota `GOAL_EVALUATION`, `409 GOAL_PLAN_UNAVAILABLE` sem candles para o aquecimento.

**Prova.** 67 contratos (contas à mão contra um oráculo `Decimal` em Python; para cada família e para o Placar clássico, o preço calculado aplicado ao `signalStep` de produção sinaliza e o vizinho de um tick do outro lado não, em compra e em saída, em três ticks; busca com 500 predicados aleatórios; sentimento; determinismo), 50 mutantes do plano (`operation-plan-mutants`) e 11 mutantes da rota (`api-goals-mutants`), todos reprovados.

## Alertas de preço (T4b.6 e T4b.7)

Migration `0017_price_alerts` (`price_alerts`: `id`, `user_id`, `symbol`, `direction` `above|below`, `value numeric`, `origin` `manual|plan`, `is_enabled`, `triggered_at`, `created_at`; VARCHAR sem ENUM; CHECKs de par, vocabulários, valor > 0 e "disparado implica desligado"; `UNIQUE (id, user_id)`; índice parcial dos armados por par) e `0018_alerts_price` (caixa de saída aceita o lado `PRICE`).

| Peça | Decisão | Motivo |
|---|---|---|
| Rotas | `GET/POST /v1/price-alerts`, `GET/PATCH/DELETE /v1/price-alerts/:alertId`; `value` em texto decimal positivo, até 8 casas, grafia canônica; alerta alheio, inexistente e id malformado = o MESMO 404; "Avisar no plano" = `POST` com `origin: 'plan'` e o preço do plano | ADR 0001 §e |
| Teto | `PRICE_ALERT_MAX_ENABLED_PER_USER` (1 a 500, padrão 50) vale para os alertas **ligados**, na criação e ao religar, com a linha do dono travada (`409 PRICE_ALERT_LIMIT_REACHED`) | RF14; corrida de 12 POSTs respeita o teto |
| Religar rearma | `PATCH isEnabled: true` limpa `triggered_at`; disparar liga `is_enabled = false` e carimba no mesmo `UPDATE` | "Ficam desligados até ele religar" |
| Onde avalia | **Na API**, que já tem o ticker público (T4.7): `createPriceAlertEvaluator` assina a porta `PriceTickListener` e recebe cada tick agregado uma vez. Tick mais velho que `TICKER_STALE_SECONDS` não avalia nada; ticker fora do ar não gera tick | O worker não tem o ticker; mover o ticker ou abrir outra conexão custaria mais que o encaixe |
| Disparo atômico | `UPDATE price_alerts SET is_enabled = false, triggered_at = now() WHERE symbol = $1 AND is_enabled AND triggered_at IS NULL AND (direction = 'above' AND value <= preço OR direction = 'below' AND value >= preço) RETURNING ...` (comparação em `numeric`, **inclusiva**). Na MESMA transação: aviso na caixa de saída (`alerts`, `side = 'PRICE'`, `run_id` nulo, `price_alert_id`, `candle_time` = instante do tick, único por (alerta, instante)), só para dono com Telegram vinculado e ligado, e `pg_notify('run_events', {kind:'price_alert', alertId})` | Duas instâncias da API no mesmo tick nunca avisam em dobro |
| Aviso ao painel | Mesmo canal `run_events`, formato próprio `{kind, alertId}` (só o ponteiro); cada API resolve o dono ATIVO pelo banco e manda `{type:'price_alert', alertId, at}` só aos sockets dele | ADR 0001 §e: o dono nunca viaja no aviso |
| Telegram | O despachante do worker lê o `payload` (`symbol`, `direction`, `threshold`, `price`, só texto decimal) e envia "Alerta de preço · PAR / O preço subiu acima de X (agora Y)" ao chat do dono da linha, com o aviso de que não é recomendação | RF14 |
| LGPD | `price_alerts` em `OWNED_TABLES`, exportada e apagada antes de `users`; `alerts.price_alert_id` entra na exportação; sem FK de propósito (apagar o alerta não leva o aviso já enfileirado) | RNF08 |

**Prova.** 32 contratos das rotas (404 idêntico, teto, rearme) e 36 mutantes da API; `make price-alert-mutants` (26 mutantes contra Postgres real: dono, teto, trava, rearme, disparo estrito/invertido/sem par/sem carimbo/sem guarda atômica, aviso a dono sem Telegram, dono bloqueado ou apagado, cada CHECK); 8 mutantes do texto e do despacho no worker; `make price-alerts-test` (Postgres real, o publicador de produção da API com ticker falso, duas instâncias, o despachante e a Bot API falsa: cruzar o valor dispara UMA vez com ticks repetidos e com duas instâncias no mesmo tick, religar rearma, alerta de outro usuário nunca dispara para este, ticker indisponível e tick atrasado não disparam nada, exportação e log sem token nem chat).

## Seus ativos (T4b.8)

Migration `0019_user_assets`: `user_assets` (`id`, `user_id`, `symbol`, `quantity numeric`, `average_price numeric`, `created_at`, `updated_at`; `UNIQUE (user_id, symbol)` e `UNIQUE (id, user_id)`; CHECKs de par, `quantity >= 0` e `average_price > 0`). Os ativos são **digitados** pelo usuário (RF15): nenhuma chave de corretora. É dado financeiro pessoal: só o dono vê, entra na exportação e na exclusão (`OWNED_TABLES`), e nunca aparece em log (a API não registra corpo de requisição; o erro de validação não repete o valor).

| Peça | Decisão | Motivo |
|---|---|---|
| Rotas | `GET /v1/assets` (cursor por símbolo), `GET /v1/assets/summary`, `GET/PUT/PATCH/DELETE /v1/assets/:symbol`; par malformado, alheio e inexistente = o MESMO `404 ASSET_NOT_FOUND`; cadastrar (PUT, compra) exige par habilitado (`400` com `symbol: not_enabled`), vender e apagar não | ADR 0001 §e; quem tem uma moeda que saiu da lista ainda a vende |
| Posição | `PUT` grava a posição como foi digitada. `PATCH { side: 'buy', quantity, price }` soma a quantidade e recalcula o preço médio PONDERADO `(q₀·p₀ + q·p) / (q₀ + q)`, arredondado para **CIMA** a 8 casas (contra o usuário: custo médio maior, resultado menor). `PATCH { side: 'sell', quantity }` desconta e NUNCA passa da quantidade (`409 ASSET_INSUFFICIENT_QUANTITY`, nem por 1e-8); o preço médio não muda. Vender tudo deixa a quantidade em `0` (a linha fica) e uma compra seguinte volta a valer o preço pago | Quantidade e preço em texto decimal exato (até 8 casas), nunca `number` |
| Corrida | `mutateUserAsset` trava a linha do dono e a posição e roda a regra (síncrona) com a posição atual: 20 compras simultâneas somam todas, 12 pares simultâneos respeitam o teto `USER_ASSET_MAX_PER_USER` (1 a 200, padrão 50; só o ativo NOVO conta, `409 ASSET_LIMIT_REACHED`) | Soma ponderada sem perder compra |
| Resumo | Por ativo com quantidade: preço atual = fechamento do candle mais novo do banco (15 minutos nas últimas 2 h, senão o diário dos últimos 3 dias; `price: null` se nenhum), `value` (quantidade × preço, para BAIXO), `cost` (para CIMA), `result`, `resultRate` (para o lado de menos), `targetPrice`/`stopPrice`, `isTargetReached`/`isStopReached`; total só dos que têm preço (`unpricedAssets` conta os outros). Valores em **USDT**: a conversão para R$ é do painel (não há fonte de câmbio no produto) | RF15 |
| Alvo e stop | `computeHoldingLevels` (`plan/plan-levels.ts`, mesma conta do plano): o preço médio é o custo, só a SAÍDA paga taxa e slippage; alvo +10% e stop −8% por padrão, configuráveis (`targetRate`, `stopRate`, validados pelo esquema da meta do motor); tick de 8 casas para não arredondar moeda barata; ambos para CIMA | O ativo já foi comprado: não paga a entrada de novo |
| Regra do dia | Com `strategyId` (estratégia do dono, versão mais nova; alheia ou inexistente = `404 STRATEGY_NOT_FOUND`), cada ativo traz `computeLatestTriggers` no estado `holding` sobre os candles diários: sinal BUY = **segurar**, SELL = **vender**, HOLD = **aguardar**, mais o que falta para a regra votar venda. Em cache por (versão, par, último candle). Sem estratégia, `rule: null`. Cota `GOAL_EVALUATION` (20/min) | Reaproveita o gatilho e o plano, sem regra nova |

**Prova.** Contas à mão da média ponderada (tabela de 8 casos, dízima, 8 casas, posição zerada), 37 contratos das rotas (404 idêntico, teto, validação sem eco, venda além da quantidade), 21 do resumo (valor, custo, resultado, alvo e stop contra o oráculo Decimal do Python, sem preço, regra do dia, cache, cota), 52 mutantes da API; `make database-test` e `make user-asset-mutants` (14 mutantes contra Postgres real: dono, trava, teto, recusa, cursor, ordem, CHECKs e unicidade); `make lgpd-test` (exportação e exclusão da conta com `user_assets`).

## Painel: metas, plano, ativos e preços ao vivo (T5.6 a T5.8)

| Peça | Decisão | Motivo |
|---|---|---|
| Porcentagem → fração | O formulário recebe `%` e envia a fração movendo a vírgula NO TEXTO (`"2.5"` → `"0.025"`); nunca passa por `number` | A API valida a mesma grafia do motor; `0.07 / 100` em ponto flutuante não é `0.0007` |
| Ranking é histórico | A tela de uma meta traz o aviso fixo de que são janelas passadas e que COMPRAR/SEGURAR/EVITAR não é recomendação; campos nulos do motor (janela vazia, sentimento sem observação) têm texto próprio | RNF de linguagem; o motor devolve `null` e a tela não pode quebrar |
| Simular esta meta | Só para o par da meta (a API recusa outro par com `GOAL_SYMBOL_MISMATCH`); o cartão "Meta ativa" lê meta, detalhe e curva da simulação ligada e calcula progresso, ritmo e prazo no navegador | A simulação é a fonte da verdade do saldo |
| Regra do dia dos ativos | A API só calcula a regra com `strategyId`; o painel manda a primeira estratégia da lista até a pessoa escolher | Sem estratégia, `rule` é `null` e a tela ficaria sem a regra |
| Câmbio | O produto NÃO tem fonte de câmbio: a cotação USDT→R$ é digitada, guardada em `localStorage` e só multiplica na tela | Nenhuma fonte de dado de câmbio foi aprovada; o valor em USDT continua sendo o da API |
| Preços ao vivo | `MarketStore` fora do React (`useSyncExternalStore`), selo "ao vivo"/"sem dados há N s" pelo estado `live`/`waiting`/`stale`/`offline`, REST de reserva a cada 15 s e rebusca no `resync` | RF16: a tela não depende de recarregar, e nunca mostra preço velho como se fosse de agora |
| Sentimento | `GET /v1/market/sentiment` devolve o último valor gravado e o objeto `source` com o crédito; o painel mostra o crédito e o link junto do valor | RF01, D14 |

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
- `@ativada/strategy-engine` depende só de `decimal.js@10.6.0` e `zod@4.6.5`.

## Espera por dado (correção H1 da revisão da Fase 4)

A simulação ao vivo que encontra um buraco de candles que a recuperação do stream ainda não confirmou como inalcançável **espera**
(§a). Antes, isso era invisível (só um log) e a decisão dependia de uma marca em memória do worker, que só nascia para buraco com mais de
24 h dentro da janela de retrocesso e se perdia no reinício: um buraco mais velho que a janela deixava a simulação presa para sempre,
com a posição aberta sem stop avaliado. Agora:

| Regra | Como funciona |
|---|---|
| A espera é do dado, não da memória | `runs.waiting_since`, `waiting_open_time`, `waiting_failed_recoveries` e `waiting_last_recovery_at` (migration 0016, com `.rollback.sql`) guardam desde quando a execução espera, por qual abertura e quantas recuperações limpas já deixaram o buraco como estava. Um worker novo continua a contagem de onde o outro parou |
| Recuperação limpa | O worker anota o instante em que cada recuperação de lacunas termina SEM erro (`createRecoveryClock`). Ela conta uma vez para a espera quando terminou DEPOIS de a espera começar e depois da última já contada; uma rodada vista por dez rondas conta uma vez, e uma que terminou antes de a espera começar não conta |
| Confirmação por contagem | `LIVE_GAP_CONFIRM_RECOVERIES` (padrão 3) recuperações limpas que não preencheram o buraco o confirmam, desde que o buraco tenha ao menos 10 minutos desde o fechamento do último candle que falta (um candle recém-fechado pode demorar no REST) |
| Confirmação por idade | O buraco cujo último candle que falta fechou há mais que a janela de retrocesso (`STREAM_GAP_LOOKBACK_HOURS`) está fora do alcance da recuperação: esperar seria esperar para sempre, e ele é confirmado na hora |
| Aviso ao dono | O primeiro registro da espera (ou a troca de buraco) emite, na mesma transação, o evento `{ runId, kind: "warning", eventId: <waiting_since> }` pelo canal da API; o painel relê a execução |
| Visível na API | `GET /v1/runs/:id` traz `waitingForData: { since, openTime } | null` (só enquanto a execução está `running`) |
| A espera termina com o buraco | O primeiro passo que atravessa o buraco (preenchido ou confirmado) apaga as quatro colunas na MESMA transação do passo; confirmar não muda o que o motor recebe (`confirmedGapCandles` exato, §a) |

A confirmação em memória da recuperação do stream (`unfillable`) continua valendo e não grava espera. Prova: `test/live-gap-wait.contract.test.ts`
(9 contratos e 11 mutantes), `make database-test` (a gravação e a contagem no SQL, o aviso por NOTIFY e o CHECK do par) e `make live-test`
(buraco no meio, reinício do worker no meio da contagem, simulação que chega ao fim IDÊNTICA ao backtest com o mesmo buraco, e o buraco
além da janela confirmado por idade).

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

## Filtros de preço e quantidade por par (T0.1 da spec 003)

O tick 0,01 e o passo 0,00001 do motor são os do BTCUSDT; em PEPE/SHIB (~0,000004) o tick zera o preço e o backtest perde tudo sem aviso. A tabela `BINANCE_SYMBOL_FILTERS` mora em `packages/market-data-crypto` (dado de mercado compartilhado por API e worker), não na API nem no banco. BTCUSDT e ETHUSDT ficam FORA dela e usam o padrão do motor, para que os RunParameters e o runHash das execuções antigas não mudem (contrato dourado). Par em MARKET_SYMBOLS sem filtro conhecido reprova o boot; pedido com par sem filtro responde 400, nunca se cai no padrão em silêncio. Valor enviado no pedido vence a tabela. Os filtros entram no runHash como antes: mudar a tabela de um par é execução nova. Ler o exchangeInfo fica para a spec 002, que confere os filtros antes de operar; até lá, par novo exige uma linha na tabela, conferida contra a Binance no PR. Rejeitado: tabela na API (acopla goals a runs) e exchangeInfo no backfill (I/O e migration para dado quase estático, com hash dependente da data da leitura).

ETHUSDT fica nos padrões do motor (`quantityStep` 0,00001) embora a Binance use 0,0001 para ele: é uma decisão consciente para não mudar o `runHash` das execuções antigas. Metas e prazos de ETH usam esse passo, e a conferência com a Binance é da spec 002. A tabela `BINANCE_SYMBOL_FILTERS` foi conferida de memória, não contra a corretora: o PR que acrescentar um par deve conferir a linha dele contra o `exchangeInfo` da Binance, e o mesmo vale para revisar as linhas que já existem.

## Prazos (spec 003, Fase 1)

`packages/strategy-engine/src/horizon/` compara prazos sobre as MESMAS janelas das metas: `goal-window-path.ts` (extraído de `goal-windows.ts` sem mudar o resultado, com dourado de caracterização byte a byte) dá o caminho da carteira de cada janela, e `computeHorizonWindows` lê o patrimônio no último candle do prazo (retorno exato = patrimônio ÷ saldo inicial − 1; janela sem compra vale exatamente 0 e não é positiva). `summarizeHorizon` arredonda mediana, pior 10% (posto `ceil(n ÷ 10)`) e fração positiva para BAIXO a 8 casas, uma vez, no fim. **Arredondamento e recomendação:** `recommendHorizon` compara mediana e pior 10% pelo TEXTO PUBLICADO (o que a pessoa vê na tela; uma mediana que aparece como 0 não é elegível), a fração de positivas pelas contagens exatas (`positiveCount × 100 ≥ 55 × windowCount`), e ordena por mediana ÷ N arredondada para baixo a 8 casas; empate vence o prazo mais longo. Os limiares do spec §5 ficam em `horizon.constant.ts`. **15 minutos:** o bruto é `finalEquity − initialBalance + feesPaid` (o `grossProfit` das métricas já vem DEPOIS das taxas) e o slippage, embutido no preço, não aparece em `feesPaid`.

## Operações no gráfico (spec 005)

Contrato da T0.1 da spec 005: três rotas de leitura sobre `candles`, `fills` e `positions`; o motor e o `run-recording` não mudam. Conferido no código em 2026-10-13:

- `GET /v1/runs/:runId/trades` devolve o `PositionInput` inteiro (`engineKey`, `status`, `entryPrice`, `quantity`, `stopPrice`, `targetPrice`, `entryFee`, `exitPrice`, `exitFee`, `netProfit`, `exitReason`, `openedCandleTime`, `closedCandleTime`; opcional ausente é omitido), em ordem **crescente** de `(opened_candle_time, engine_key)`, com a query estrita `limit`/`cursor` (parâmetro desconhecido é `400`). O painel (`tradeSchema` em `run.validation.ts`) lê com `z.object`, que ignora campo novo, e só manda `limit` e `cursor`.
- Índices: `fills` tem `UNIQUE (run_id, order_key, candle_time)` e `(user_id, run_id)`; `positions` tem `UNIQUE (run_id, engine_key)` e `(user_id, run_id)`; `candles` tem só a PK `(exchange, symbol, timeframe, open_time)`. `runs` não guarda a corretora: o backtest usa `BACKTEST_MARKET_EXCHANGE = 'binance'`.
- Os motivos de saída reais são cinco: `stop`, `target`, `signal`, `command` e `gap` (`EXIT_REASON` do motor e do banco, com CHECK). `command` só nasce da saída da meta no ao vivo (`goal-step.ts`).
- O `notional` do preenchimento é o produto **sem arredondar** (`quantidade × preço`). O caixa usa `computeBuyDebit` = `ceil8(notional) + taxa` e `computeSellCredit` = `floor8(notional) − taxa`, e `net_profit` = crédito − débito. A taxa do preenchimento é a mesma da posição (`entry_fee`, `exit_fee`).
- No walk-forward, `positions` e `fills` só têm as janelas de TESTE (chaves `w<i>:`); o ajuste roda em memória.

**Divergências do plan corrigidas aqui.** (a) `closedCandleTime`, `quantity`, `entryFee` e `exitFee` já existem no `/trades`: não são campos novos. (b) A ordem atual é crescente, não "aberta primeiro e decrescente"; ela fica, e a aberta chega ao topo por um filtro (O3). (c) Pago e recebido usam o notional **arredondado** como o caixa (O5): com o notional cru, o saldo do resumo não fecharia com `net_profit` em decimal exato. (d) `end` e `stopped` não existem como motivo; `command` existe. (e) As faixas são semiabertas `[from, to)`, como `GET /v1/markets/candles` e `period_end`.

| # | Decisão | Motivo |
|---|---|---|
| O1 | **Faixa da execução.** Backtest: `[period_start, period_end)` quando `completed`, senão `[period_start, last_candle_time + duração do timeframe)`. Walk-forward: `[min(test_start), max(test_end))` das linhas de `walk_forward_windows` (só fora da amostra, spec D11). `live_paper`: `[period_start, last_candle_time + duração)`. Sem `last_candle_time` (ou sem janela gravada), a faixa é vazia | O aquecimento antes de `period_start` e o ajuste ficam fora. O ao vivo para na última vela que a própria execução processou, e `candles` só guarda vela fechada: a vela em andamento nunca aparece (RF15) |
| O2 | **Tempos** em milissegundos UTC, `from` incluído e `to` excluído, texto só de dígitos (o `TIMESTAMP_PATTERN` de mercado). Ausente vale a borda da faixa da execução. No `/chart` a faixa pedida é **recortada** à da execução; interseção vazia com a faixa da execução não vazia é `400` (`from: outside_run`). `to <= from` é `400` (`to: must_be_after_from`) | Link antigo do ao vivo continua abrindo; faixa sem sentido é erro, não gráfico vazio |
| O3 | **`GET /v1/runs/:runId/trades`** ganha a query opcional `from`, `to` (O2, sem recorte: só filtram) e `status` (`open` ou `closed`). Com faixa, entra a posição com compra **ou** venda em `[from, to)`: `opened_candle_time` ou `closed_candle_time` dentro dela; a que atravessa a faixa sem preenchimento nela fica fora (a mesma regra das setas). Ordem e cursor **iguais aos de hoje**, `limit` ≤ 100. O painel busca as abertas com `status=open` e as fixa no topo como "aberta" (no walk-forward, "aberta no fim da janela"); a lista virtual usa `status=closed` | Aditivo: nenhum campo some nem muda de tipo; o que antes era `400` passa a filtrar |
| O4 | **Campos novos de cada operação**, em texto decimal, omitidos quando ausentes (como os atuais): `entryNotional` (notional do preenchimento de compra), `paid` e `fees` (`entryFee + exitFee`, ou `entryFee` na aberta); só na fechada, `exitNotional`, `received` e `netProfitRate`. Os preenchimentos da página vêm numa **única** consulta (`run_id` e `position_key IN (...)`, sem N+1). Posição fechada sem preenchimento de venda é estado impossível (os dois são gravados na mesma transação) e vira `500`, nunca campo inventado | Dica e tabela iguais aos `fills` (critério 3 da spec) |
| O5 | **Pago, recebido e %.** `paid = ceil8(entryNotional) + entryFee`; `received = floor8(exitNotional) − exitFee`; `netProfitRate = floor8(netProfit ÷ paid)`, com piso para −∞ (o prejuízo nunca aparece menor). Contas em `EngineDecimal` e `roundMoney` na API. Identidade garantida, posição a posição: `received − paid = netProfit` | É a conta do caixa do motor; com o notional cru a soma divergiria de `net_profit` na 9ª casa |
| O6 | **`GET /v1/runs/:runId/chart?from=&to=&columns=`**, só do dono, query estrita. `columns` inteiro de 100 a 2.000, padrão 800. Resposta `{ data: { symbol, timeframe, from, to, lastClosedCandleTime, columns, markers, clusters, totals } }`. `from` e `to` são a faixa **efetiva** (recortada). `lastClosedCandleTime` = `runs.last_candle_time`: a abertura da última vela processada, `null` sem nenhuma; o painel mostra o fechamento (abertura + duração). `columns: [{ startTime, endTime, first, last, low, high }]`, com a abertura da primeira e da última vela da coluna, `first` = abertura da primeira e `last` = fechamento da última. `totals: { buys, sells }` na faixa. Exatamente um entre `markers` (lista, talvez vazia) e `clusters` é não nulo; o outro é `null`. Faixa vazia (execução na fila) é `200` com listas vazias | Contrato do plan D2, com `null` explícito como `survival` e `queuePosition` |
| O7 | **Redução no SQL**, parametrizada e sem `sql.raw`: `bucket = ((open_time − $from) * $columns) / ($to − $from)` em `bigint` (divisão inteira = piso, operandos não negativos; 5 anos × 2.000 cabe em 2^63), `WHERE exchange = 'binance' AND symbol = $s AND timeframe = $t AND open_time >= $from AND open_time < $to GROUP BY bucket ORDER BY bucket`, com `min(open_time)`, `max(open_time)`, `(array_agg(open ORDER BY open_time))[1]`, `(array_agg(close ORDER BY open_time DESC))[1]`, `min(low)` e `max(high)`. A corretora entra no `WHERE` (a constante do backtest) para a consulta ser uma varredura de faixa da PK. Os decimais saem na grafia canônica do motor, sem zeros à direita. Um oráculo TS puro em `test/` usa a mesma fórmula | Mínimo e máximo preservam o preço da compra; sem zeros à direita, 800 colunas ficam perto de 90 KB |
| O8 | **Nenhum índice novo e nenhuma migration.** Velas: a PK atende a faixa. Preenchimentos: no máximo dois por posição (cerca de 2.000 linhas para 1.000 operações), lidos por `(user_id, run_id)` e filtrados por `candle_time`; a junção com a posição usa `UNIQUE (run_id, engine_key)`. Se a medição da T1.5 passar de 300 ms p95, o primeiro passo é um índice aditivo `fills (run_id, candle_time)` com `.rollback.sql`, levado ao responsável ANTES de criar | O volume por execução é pequeno; índice sem medição é custo de escrita no lote do backtest |
| O9 | **Marcadores** (`CHART_MARKER_LIMIT = 500` em `runs.constant.ts`). Primeiro `count(*) FILTER (WHERE side = ...)` dos `fills` da faixa, que dá `totals`. Até 500, inclusive: `markers: [{ positionKey, side, candleTime, price, quantity, fee, amount, netProfit?, netProfitRate? }]` em ordem `(candle_time, order_key)`, com `amount` = `paid` na compra e `received` na venda (O5), e o resultado só na venda (lido da posição pela junção). Acima de 500: `clusters: [{ startTime, endTime, buys, sells }]`, só dos baldes com preenchimento, pelo MESMO balde de O7 sobre `candle_time`, com limites nominais `startTime = from + ⌈b·W/C⌉` e `endTime = from + ⌈(b+1)·W/C⌉` (`W = to − from`, `C = columns`; semiaberto, é exatamente o conjunto de tempos inteiros do balde) | Enter no agrupamento aproxima nessa faixa; 500 setas é o que ainda se distingue (spec D3) |
| O10 | **`GET /v1/runs/:runId/trade-summary`**, sem query (parâmetro é `400`), para a execução inteira: `{ data: { closedTrades, totalPaid, totalReceived, totalFees, net, openTrades, openPaid, message } }`. Fechadas: `totalPaid = Σ paid`, `totalReceived = Σ received`, `totalFees = Σ (entryFee + exitFee)` e `net = totalReceived − totalPaid`, que É `Σ net_profit` (O5). Abertas: `openTrades` (contagem; o walk-forward pode deixar uma por janela) e `openPaid = Σ paid` delas, `null` sem aberta. UMA consulta agregada em `numeric` (`ceil(notional * 1e8) / 1e8` e `floor(...)`, exatos), normalizada na API para a grafia canônica | RF11 e RF12; o resumo não depende do zoom |
| O11 | **Frase do resumo** (`trade-summary-message.ts`, no servidor): "Você pagou {totalPaid} USDT em {n} compras e recebeu {totalReceived} USDT nas vendas. Taxas: {totalFees} USDT. Saldo líquido: {net} USDT." ("1 compra" no singular). Com aberta: "+ uma operação ainda aberta, com {openPaid} USDT pagos." ou "+ {k} operações ainda abertas, com {openPaid} USDT pagos.". Sem fechada: "Nenhuma operação fechada ainda.", mais a parte da aberta se houver. Números em pt-BR com 2 casas e milhar (`98.410,22`), arredondados contra o usuário: pago e taxas para cima, recebido e saldo para baixo (−∞). Os campos numéricos continuam exatos | Mesmo padrão de `horizon-messages.ts`; o painel só exibe |
| O12 | **Motivo da venda em português simples**, no painel: `EXIT_REASON_PLAIN_TEXT` em `run.constant.ts` (novo; o `EXIT_REASON_LABEL` curto fica até a T4.1 trocar o miolo do `TradesCard`). `target` → "atingiu o alvo de lucro"; `stop` → "vendeu para limitar a perda (stop)"; `signal` → "a estratégia mandou vender"; `command` → "a meta chegou ao fim e a simulação vendeu"; `gap` → "faltaram dados do mercado e a posição foi fechada"; código desconhecido → o próprio código | É a lista real do motor; um contrato na raiz garante que cada valor de `EXIT_REASON` tem frase |
| O13 | **Erros e acesso** nas três rotas: `access: USER` e `documentation` (OpenAPI); execução alheia, inexistente, apagada (`deleted_at`) ou id malformado dão o MESMO `404 RUN_NOT_FOUND`; validação é `400` com todos os erros pelo `readValidatedQuery`, sem eco de valor. Sem cache no servidor: o ao vivo é invalidado pelo aviso do WebSocket sob a chave `runs` (plan D8) | ADR 0001 §e; a regra das rotas da T3.4 |

**Contratos de teste esperados.**

- `/trades`: o contrato antigo continua verde sem mudança (campos, tipos, ordem e cursor). `entryNotional` e `exitNotional` iguais aos `fills`; `entryFee` e `exitFee` iguais aos da posição e dos `fills`. `received − paid = netProfit` em decimal exato em TODA posição do conjunto real. `netProfitRate` com piso para −∞ (casos à mão, positivo e negativo, na 9ª casa). Aberta sem campos de saída, com `paid` e `fees`. Faixa: só a compra dentro, só a venda dentro, atravessando (fica fora), `from` incluído e `to` excluído. `status=open` e `status=closed`. Cursor com faixa: as páginas concatenadas são a lista filtrada inteira. `400` com todos os erros (`from` não numérico, `to <= from`, `status` inválido, parâmetro desconhecido), sem eco. `404` entre usuários, inexistente, malformado e apagada. Uma consulta de `fills` por página (contador no repositório em memória). Mutante do filtro de dono em `make api-runs-mutants`.
- `/chart`: oráculo TS igual ao SQL em 3 séries sintéticas (dízima no balde, coluna com uma vela, faixa menor que `columns`) e no conjunto real. `columns` 99, 2.001, `abc` e `1.5` dão `400`; ausente vale 800. `to <= from` e faixa fora da execução dão `400`; faixa parcial é recortada. 500 preenchimentos dão `markers`, 501 dão `clusters` (a soma dos agrupamentos é `totals`; limites pela fórmula de O9). `amount`, `netProfit` e `netProfitRate` do marcador iguais aos do `/trades`. Backtest na `period`; walk-forward só nas janelas de teste (vela do ajuste fora das colunas); ao vivo parando em `last_candle_time` (vela gravada depois dela não aparece). Execução na fila dá listas vazias. `404` e mutante de dono. Medição p95 ≤ 300 ms e ≤ 150 KB do caso de aceite em `make api-runs-test`.
- `/trade-summary`: `net = Σ net_profit` exato; `totalPaid` e `totalReceived` iguais à soma dos campos do `/trades` e do `log.csv` da mesma execução. Aberta com `openTrades`, `openPaid` e a frase dela; execução sem operação. Frase com milhar, 2 casas, direção de arredondamento e singular ou plural. Parâmetro desconhecido dá `400`. `404` e mutante de dono.
- Raiz: cada valor de `EXIT_REASON` (`@ativada/database`) tem frase em `EXIT_REASON_PLAIN_TEXT` do painel.

**Correções da revisão final (T6.3).**

- **O6, resposta do `/chart`:** ganhou `runRange: { from, to }` (ms UTC, aditivo), a faixa efetiva da execução (a de O1) à qual `from`/`to` pedidos são recortados. O painel limita atalhos, campos de data, anterior/próximo e a faixa da URL por ela; o período da execução não serve (no walk-forward só valem as janelas de teste e no ao vivo ou backtest em andamento a faixa termina na última vela processada, e fora dela a API responde `400 outside_run`). Execução sem faixa ainda (fila) devolve `runRange` vazio (`from = to`).
- **O13, limite de requisições:** `/chart` e `/trade-summary` têm política própria por usuário, `RUN_CHART` e `RUN_TRADE_SUMMARY` (30 por minuto cada, balde de fichas como as demais); o 429 já vem na documentação comum das rotas.
- **Nota, caso impossível no banco real:** se faltar o preenchimento de compra de uma posição, `total_paid` ignora a posição mas `total_fees` conta a taxa dela, e então `net` ≠ Σ `net_profit`. O motor sempre grava a compra antes da venda e a FK composta impede venda sem posição, então o caso não existe; fica registrado para quem for mexer na gravação de resultados.

## Simulação ao vivo robusta (spec 006)

Contrato da T0.1 da spec 006, fechado sobre uma reprodução real (2026-10-13, `specs/006-simulacao-ao-vivo-robusta/evidence.md`):
Postgres 18.3 descartável no WSL, `new Bun.SQL(url)` sem opções (como `openDatabase`), Drizzle 0.45.4 por cima e o escutador
próprio de `LISTEN`, nos Bun **1.4.3** (o desta máquina, no Windows e no WSL) e **1.3.14** (o citado na spec). O motor e o
`run-recording` não mudam.

**O que a reprodução mostrou.**

| Situação | O que o `Bun.SQL` faz | Volta sozinho? |
|---|---|---|
| Banco morto por `SIGKILL` (como `docker kill`) | consulta e transação em voo: `ERR_POSTGRES_CONNECTION_CLOSED`; enquanto fora: `ERR_POSTGRES_CONNECTION_REFUSED` no 1.4.3 e `ERR_POSTGRES_CONNECTION_CLOSED` no 1.3.14 | **Sim**, na primeira consulta depois de o banco aceitar conexão, sem reabrir |
| Parada limpa `fast` (como `docker stop`/`restart`) | consulta em voo: `code = ERR_POSTGRES_SERVER_ERROR`, `errno = 57P01`, `severity = FATAL`; transação parada entre comandos: `ERR_POSTGRES_EXPECTED_REQUEST`; depois, como acima | **Sim** |
| Servidor congelado (`SIGSTOP`, como `docker pause`) | consulta fica pendurada sem erro; `query.cancel()` não a solta; cliente novo com `connectionTimeout: 2` falha com `ERR_POSTGRES_CONNECTION_TIMEOUT` | **Sim**, quando o servidor descongela a consulta termina |
| Porta aceita e fecha (encaminhador sem banco atrás) | consulta espera em silêncio, sem erro | **Sim**, quando o encaminhador volta |
| **Meia conexão** (encaminhador de porta que perde as conexões antigas sem fechá-las, o caso do computador que dorme) | toda consulta fica pendurada **para sempre**, mesmo com o banco e o encaminhador de volta (69 s observados) | **Não.** Só `close()` solta: as pendentes rejeitam na hora com `ERR_POSTGRES_CONNECTION_CLOSED`, o `close({ timeout: 1 })` resolve em ~1 s e um cliente novo funciona na primeira consulta |

Em nenhum caso o Bun expôs `ECONNREFUSED`/`ECONNRESET` nem `errno` numérico: o código vem em `code` (`ERR_POSTGRES_*`) e o
SQLSTATE do servidor vem em `errno`. O Drizzle embrulha tudo em `DrizzleQueryError` (`name = "Error"`, mensagem com a consulta
**e os parâmetros**) e o erro do driver fica em `cause`. O escutador de `LISTEN` já se recupera em todos os casos com o
próprio backoff; na meia conexão ele só percebe pelo `keepAlive` (30 s de intervalo: a perda saiu em ~59 s como
`unresponsive`) e a notificação enviada nesse meio tempo se perde, o que o `resync` da API já cobre.

**Causa provável do incidente de 2026-10-13.** As milhares de falhas são as rondas batendo no banco fora (recusa e conexão
fechada); o "nunca voltou sozinho" é a meia conexão que o encaminhador de porta do Docker Desktop deixa quando o computador
dorme: o mesmo `Bun.SQL` não se recupera dela e não há teto de tempo em lugar nenhum. A reprodução não usou o Docker Desktop
(regra: não tocar nos containers do projeto); o encaminhador foi um proxy TCP de rascunho. Por isso o teto de tempo por
unidade (abaixo) é a peça central, e reabrir o cliente é o conserto, não a simples repetição.

| # | Decisão | Motivo |
|---|---|---|
| R1 | **Erro de conexão** (`isDatabaseConnectionFailure`, percorre o erro e a `cause` até 4 níveis, lendo `code` e `errno`): códigos do Bun `ERR_POSTGRES_CONNECTION_CLOSED`, `ERR_POSTGRES_CONNECTION_REFUSED`, `ERR_POSTGRES_CONNECTION_TIMEOUT`, `ERR_POSTGRES_EXPECTED_REQUEST`; SQLSTATE da classe `08` e `57P01`, `57P02`, `57P03`; o nosso `DATABASE_QUERY_TIMEOUT` (R4, só para quem trata a falha em laço; o porteiro o confirma antes de dar o banco por fora); e, por defesa (não observados no 1.4.3), `ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT`, `EPIPE`, `EHOSTUNREACH`, `ENOTFOUND`, `EAI_AGAIN` — mas SÓ quando o próprio nível do erro é do driver (`name = "PostgresError"`): o mesmo código na `cause` de um erro do Keycloak, do Telegram ou da Binance não é banco fora e a rota responde 500, não 503. Todo o resto (inclusive `ERR_POSTGRES_SERVER_ERROR` com outro SQLSTATE, `53300`, `23505` e `57014`, consulta abortada pelo `statement_timeout`) é erro da consulta e segue o caminho de hoje | São os códigos medidos em cada fase; `ERR_POSTGRES_EXPECTED_REQUEST` só apareceu na transação cortada pela parada limpa, e reabrir por engano é inofensivo |
| R2 | **Estado do porteiro** (`ResilientDatabase`, um por `DatabaseHandle`, compartilhado por todos os laços do processo): `up` → `down` na **primeira** falha de conexão. Enquanto `down`, unidade pedida antes de `nextAttemptAt` falha na hora com `DatabaseUnavailableError` (`code = DATABASE_UNAVAILABLE`, sem tocar a rede); a primeira depois do vencimento passa e é a sonda (uma por vez; as demais falham na hora). Sonda que dá certo → `up`, falhas zeradas | Um processo bate no banco uma vez por espera, não um laço por ronda; os laços não precisam de sonda própria |
| R3 | **Backoff** `computeBackoff({ attempt, baseMs: 1000, maxMs: 30000, random })` = sorteio em `[c/2, c]`, `c = min(baseMs × 2^(attempt − 1), maxMs)`, a mesma conta do escutador (`notification-listener.ts`). **Nunca desiste** (spec D6) | A reprodução confirma o plano: com o banco de volta, a próxima sonda passa; o pior caso é 30 s de espera + a ronda seguinte (5 s no ao vivo), dentro dos 60 s do RNF01 |
| R4 | **Teto de tempo por unidade** (consulta avulsa ou transação inteira): `DATABASE_QUERY_TIMEOUT_SECONDS` (5 a 300, padrão 30; vale para a API e o worker). O **perfil longo** do cron (purga LGPD numa transação só, backfill) e das threads de backtest e walk-forward usa `DATABASE_LONG_QUERY_TIMEOUT_SECONDS` (30 a 3600, padrão 600): unidade legítima de mais de 30 s não é abortada. O servidor aborta PRIMEIRO: o cliente abre com `statement_timeout` = teto − 5 s (piso de 1 s, `computeStatementTimeoutMilliseconds`), então a consulta lenta falha com SQLSTATE `57014` em `errno`, que é erro da CONSULTA (fora da lista de R1): a rota responde 500, sem reabrir nem `down`. O `statement_timeout` vale por comando, não por transação; só o teto do cliente cobre a transação inteira. Só uma conexão que não responde chega ao timer do cliente: a unidade rejeita com `DatabaseUnavailableError` (`code = DATABASE_QUERY_TIMEOUT`), o porteiro **reabre o cliente na hora** e **confirma com `SELECT 1` no cliente novo** (teto de 2 s, `QUERY_TIMEOUT_CONFIRM_SECONDS`). Respondeu: o banco está vivo, falha só a unidade e o porteiro segue `up`. Não respondeu: `down` (falha 1, backoff). O cliente também abre com `connectionTimeout: 10` (s) | A meia conexão nunca dá erro: sem teto, a ronda fica presa para sempre. `query.cancel()` não solta a consulta; só `close()` solta. Uma rota pesada acima de 30 s sob carga NÃO pode derrubar a API inteira em 503 |
| R5 | **Reabrir** = abrir um `Bun.SQL` novo com as MESMAS opções (inclusive o `statement_timeout`) e trocar o cliente corrente dentro do porteiro (o `DatabaseHandle` não muda). Gatilhos: teto do cliente vencido (R4; reabre sempre, `down` só se o `SELECT 1` falhar) ou `RECONNECT_FAILURE_THRESHOLD` = 2 falhas de conexão seguidas por código (seguro barato: o 1.4.3 se recupera sozinho delas, uma versão futura pode não se recuperar). Depois do `close()` o porteiro não admite unidade nem reabre cliente (`isClosed`): o laço atrasado do desligamento só recebe `DATABASE_UNAVAILABLE` | Reabrir funciona em todos os casos medidos; esperar só funciona nos que não são meia conexão |
| R6 | **Troca sem cortar transação viva.** Unidade nova vai sempre para o cliente novo; a que já está no velho termina nele (a transação é presa à conexão reservada). O velho é fechado com `close({ timeout: 1 })` quando não tem unidade em voo ou quando todas as que restam já venceram o teto (abandonadas: o chamador já recebeu a falha). Nenhuma transação ainda dentro do teto é fechada à força | Spec risco "transação em voo"; `close()` rejeita as pendentes com `ERR_POSTGRES_CONNECTION_CLOSED` e o servidor desfaz o que não foi confirmado |
| R7 | **Desfecho desconhecido é seguro.** Unidade que venceu o teto (ou cujo `COMMIT` perdeu a resposta) pode ter sido confirmada no servidor. Quem chama trata como falha e a próxima ronda relê o checkpoint: passo repetido é pulado (`CANDLE_ALREADY_PROCESSED`), linhas e `alerts` têm `ON CONFLICT DO NOTHING` | É a mesma idempotência que já protege a queda do worker (T4.1, T4.5); nenhuma regra nova de deduplicação |
| R8 | **Log sem PII** (`readSafeErrorFields`): `errorName`, `code` e `errno` lidos do erro mais interno que tem `code` (o `PostgresError`, não o `DrizzleQueryError`, cujo `name` é `"Error"`); nunca a mensagem, a consulta, os parâmetros, a URL nem o usuário. Quem loga é **cada laço**, não o porteiro (que não tem logger): cada laço do worker (avaliação, alertas, recuperação de lacunas) e o resumo da API e da varredura de parada têm a sua guarda (`createDatabaseOutageGuard`), e cada uma escreve `database unavailable` (`error`) na primeira falha com `{ code, errno?, failures: 1, sinceMs: 0 }`, depois no máximo uma a cada 60 s com `{ code, errno?, failures, sinceMs }` (o último código), e `database recovered` (`info`) com `{ downtimeMs, failures }`. Laço que recebe `DatabaseUnavailableError` encerra a ronda sem logar | A mensagem do `DrizzleQueryError` carrega os parâmetros da consulta; o resumo dá ≤ 1 linha por 60 s POR LAÇO (RNF01): um processo com vários laços escreve uma linha por laço por minuto |
| R9 | **Rotas com banco fora.** `DatabaseUnavailableError` vira `503` com `{ error: { code: "DATABASE_UNAVAILABLE", message } }` genérico e `Retry-After: 5` no filtro global, em vez do `500` de erro desconhecido; não vai ao Sentry como defeito | É indisponibilidade esperada e passageira, não bug; o cliente sabe tentar de novo |

**Escutador de `LISTEN` (spec risco "ritmos diferentes").** Fica como está: tem backoff próprio (1 s a 30 s, sorteio) e o
porteiro não o toca. Na meia conexão ele leva até 2 × `keepAlive` (60 s) para perceber; a perda vira `resync` para os
sockets e o REST continua sendo a fonte da verdade. O teste da queda confere um `resync` por episódio de perda do `LISTEN`.

**Parada da simulação (plan D3).** Quem detecta é a **API** (`stall-sweeper`, a cada `LIVE_STALL_SWEEP_SECONDS` = 60), porque
o worker é justamente quem pode estar parado.

| # | Decisão | Motivo |
|---|---|---|
| P1 | **Vela devida.** `d` = duração do timeframe. Próxima abertura a processar: `last_candle_time + d` ou, sem passo, `floor(started_at ÷ d) × d` (a vela em curso na criação, T4.1). `dueAt` = essa abertura + `d` (o fechamento dela) | Usa a vela esperada, não o relógio de parede: em `1d` não há alarme às 15:00, só depois de 00:00 UTC + carência |
| P2 | **Parada** quando `status = running`, `kind = live_paper`, `deleted_at IS NULL`, sem `waitingForData` (que tem texto próprio) e `now ≥ dueAt + LIVE_STALL_GRACE_MINUTES` (padrão **15**, de 5 a 240; não muda). O episódio começa em `stalled_since = dueAt + carência` (determinístico, não o instante da varredura) | Duas instâncias ou duas rondas calculam o mesmo início; cobre worker caído, banco fora e stream mudo |
| P3 | **`stalled_since` fica enquanto o episódio dura.** Gravado uma vez, não é recalculado quando o worker processa velas mas segue atrasado; só é apagado quando a fórmula diz que a execução está em dia (`now < dueAt + carência`) | Sem isso, cada vela de recuperação abriria um episódio novo e um `STALL` novo |
| P4 | **Varredura numa transação** com `pg_try_advisory_xact_lock` (uma instância por vez): `UPDATE runs SET stalled_since` para os que entram e para os que saem, e na MESMA transação a linha de `alerts` e o `pg_notify('run_events', { runId, kind: "warning", eventId: stalled_since })` | O passo do alerta nasce com a mudança de estado ou não nasce (como o passo ao vivo) |
| P5 | **Chave do alerta = a chave única que `alerts` já tem**, `(run_id, candle_time, side, channel)`, com `candle_time = stalled_since` e `side` ∈ `STALL`, `RESUME` (o CHECK de `alerts.side` ganha os dois na migration aditiva). `ON CONFLICT DO NOTHING` | "Execução + início do episódio + lado" sem índice novo: ronda repetida ou duas instâncias nunca duplicam; episódio novo tem `stalled_since` novo |
| P6 | **`RESUME` só fecha um `STALL`.** Sai quando um episódio aberto termina com a execução em dia e ainda `running`. Execução que sai de `running` parada (parada pelo dono, falha, apagada) só tem `stalled_since` apagado, sem `RESUME` | Não há "voltou" para o que não volta; o dono já vê o estado final na tela |
| P7 | **Quem recebe e quando sai.** Mesmas regras do alerta de sinal: dono ativo com Telegram vinculado e alertas ligados; o despachante respeita `ALERT_TELEGRAM_DAILY_LIMIT_PER_USER`. Texto sem dado pessoal (nome da estratégia, par, vela, hora). **Se o worker estiver morto, o `STALL` só sai quando ele voltar** (é ele quem despacha); a faixa do painel, lida da API, é o aviso imediato. Com o banco fora, nada é gravado: o `STALL` nasce na primeira varredura com o banco de volta e a parada ainda valendo | Sem mensageria nova (abaixo); o aviso que não depende do worker é a faixa |
| P8 | **Na API:** `GET /v1/runs/:id` e a lista trazem `stalledSince` (ms UTC) só quando gravado e a execução `running`; ausente nos outros casos (aditivo) | RF13 |

**Saúde (plan D5).**

| # | Decisão | Motivo |
|---|---|---|
| H1 | `GET /v1/health` (público): `SELECT 1` pelo porteiro com teto **próprio** de 1 s → `200 { status: "ok" }` ou `503 { status: "degraded" }`, `Cache-Control: no-store`, nenhum outro campo. O teto de 1 s responde `503` mas **não** conta como falha de conexão (só o teto de R4 conta); com o porteiro `down`, responde `503` sem tocar a rede | Banco lento não é banco fora; o detalhe fica no admin (spec D7) |
| H2 | `GET /v1/admin/health` ganha, sem mudar o que já existe (`checks.database`, `listener`, `runs`): `database: { state: "up" \| "down", consecutiveFailures, downSince, lastFailureCode, lastFailureAt }` (tempos em ms UTC ou `null`; o código é o de R8, nunca a mensagem) e `worker: { lastHeartbeatAt, ageSeconds, state }` | RF10 |
| H3 | `worker.state`: `alive` quando o batimento mais novo de `worker_heartbeats` tem idade ≤ 3 × `WORKER_HEARTBEAT_SECONDS` (padrão 15, logo 45 s); `stale` acima disso; `unknown` sem nenhuma linha ou sem conseguir ler o banco. Com mais de uma instância vale a mais nova. A linha guarda id da instância (sorteado no boot), `started_at`, `last_beat_at` (`now()` do banco), versão e contadores agregados das rondas, nada de usuário | Relógio do banco, não da máquina; spec D8 e RF11 |

**Sem mensageria nova: o banco é a fila (plan D4, spec RF15).** A queda de 2026-10-13 foi do **banco**. Uma mensageria nova
(Redis, RabbitMQ, BullMQ) seria mais uma peça que dorme e cai junto com o computador, e mais uma conexão para reconectar.
Com o banco como fila durável, o passo, o sinal, o alerta e o aviso de parada nascem na MESMA transação: ou tudo, ou nada.
Quando o banco volta, nada se perdeu (a transação desfeita não deixou rastro) e nada se duplica (checkpoint e chaves únicas).
`pg_notify` é só o empurrão para o painel e o despachante, que também leem por varredura. O conserto certo é o cliente
reconectar com teto de tempo, não trocar a fila.

**Ajuste ao plan D7.** `docker restart` e `docker pause` NÃO reproduzem o caso que não volta sozinho (os dois se recuperam
sem reabrir). O `make db-outage-test` precisa de um proxy TCP de teste entre os processos e o Postgres
(`packages/database/test-support/`) com os modos encaminhar, aceitar-e-fechar e **emudecer** (as conexões abertas param de
receber e enviar sem fechar), além do `docker restart`.

**Contratos de teste esperados.**

- Classificação (R1): cada código medido, solto e embrulhado em `DrizzleQueryError` (com `name = "Error"` e a mensagem com
  parâmetros), é conexão; `57P01` em `errno` com `code = ERR_POSTGRES_SERVER_ERROR` é conexão; `23505`, `53300`,
  `ERR_POSTGRES_SERVER_ERROR` com outro SQLSTATE e erro sem `code` não são; `cause` além de 4 níveis não é lida.
- Backoff (R3): contas à mão (`attempt` 1 a 7, `random` 0 e 1); propriedade: nunca acima de 30 s nem abaixo de metade do
  degrau; nunca para de devolver espera.
- Dublê `flaky-sql` (T1.2) com os modos medidos: recusa (`ERR_POSTGRES_CONNECTION_REFUSED`), fechada
  (`ERR_POSTGRES_CONNECTION_CLOSED`), parada limpa (`57P01` em `errno`, `ERR_POSTGRES_EXPECTED_REQUEST` na transação) e
  **emudecido**, em que a consulta pendura até o `close()` e então rejeita com `ERR_POSTGRES_CONNECTION_CLOSED`, e que **não
  volta** quando o banco "volta": só um cliente novo funciona.
- Porteiro (R2, R4 a R6): cai → `down` → falha rápida antes do vencimento → uma sonda por vencimento → `up`; emudecido →
  teto vencido → reabre na hora → a próxima unidade vai ao cliente novo; transação dentro do teto nunca é fechada; a
  vencida é abandonada e o velho fecha; o `DatabaseHandle` antigo continua valendo.
- Log (R8): 1.000 rondas com o banco fora dão a linha da primeira falha, uma a cada 60 s de relógio falso e a da volta; toda
  linha tem `code`; varredura sem URL, senha, usuário do banco, texto de consulta nem parâmetro.
- Rotas (R9, H1, H2): banco fora → `/v1/health` `503 { status: "degraded" }` sem outro campo e rota de usuário `503
  DATABASE_UNAVAILABLE`; banco lento além de 1 s → `503` no health sem `down` no porteiro; admin com `database` e `worker`.
- Parada (P1 a P6): `computeStalledSince` à mão em 15m, 1h, 4h e 1d, com e sem passo, no limite exato da carência, com
  `waitingForData` e com execução não `running`; varredura: um `STALL` e um `RESUME` por episódio, ronda repetida e duas
  instâncias não duplicam, recuperação parcial não abre episódio novo, parada pelo dono não manda `RESUME`.
- Integração `make db-outage-test`: `docker restart` (30 s fora) e proxy emudecido, com API e worker vivos; os dois voltam em
  ≤ 60 s depois que o banco aceita conexão, `fills`/`signals` iguais aos de uma execução contínua, `/v1/health` `503` → `200`,
  `worker.state` `stale` → `alive`, um `resync` por perda do `LISTEN`, log da queda com `code` e sem PII.
- Mutantes: limiar, teto do backoff, sorteio, classificação (um código a menos), teto por unidade, troca só sem transação
  viva, resumo de 60 s, carência, `waitingForData` excluído, `stalled_since` fixo no episódio, alerta único, `RESUME` só
  depois de `STALL`.

## Acompanhamento ao vivo (spec 008)

Contrato da T0.1 da spec 008: três leituras sobre o que a simulação ao vivo já grava (`signals`, `equity_points`,
`positions`, `candles`, `runs`), sem migration, sem índice novo e sem reexecutar o motor por pedido. O motor e o
`run-recording` não mudam. Conferido no código em 2026-10-14:

- **`signals.indicators`** é o `collectIndicators` do placar: `rule:<id>` para saída única e `rule:<id>.<saída>` (ordem
  alfabética, `flattenIndicatorValue`) para várias; `risk:atr` sempre (escalar); `regime:adx.<saída>` só com regime ADX; na
  regra Fear & Greed, `rule:<id>` é o índice da observação USADA (`null` sem observação fresca da fonte da execução).
  `sentiment_observation` é essa observação (`{ value, observedAt, source }`), gravada só quando a estratégia tem Fear &
  Greed. Há uma linha por vela processada **depois do aquecimento** (`signal` não nulo), HOLD incluído; o aquecimento não
  grava linha. No ao vivo o worker parte de `period_start − leadIn × d`, então a primeira linha é a vela
  `period_start − d`, que fecha exatamente no início do período: é a primeira decisão da simulação.
- **Índices usados** (todos já existem): `signals_run_id_candle_time_unique (run_id, candle_time)` (página decrescente e
  cursor, com `user_id` no filtro); `equity_points_run_id_candle_time_pk` (último ponto); `positions_user_id_run_id_idx`
  (as posições da execução, poucas no ao vivo); `candles_exchange_symbol_timeframe_open_time_pk` (fechamento de cada
  decisão, por igualdade na PK). Não falta índice: nenhuma migration (spec RNF02).
- **`equity_points.benchmark`** é `benchmarkValue`: o saldo inicial até o primeiro sinal e, depois, caixa + quantidade ×
  fechamento da compra feita na abertura seguinte ao primeiro sinal. `positions.stop_price` e `target_price` são NOT NULL.
- **`computeNextTriggers`** não lê `previous` (o gatilho do Donchian usa o canal ATUAL), mas chama `evaluateScoreboard`,
  cujo voto do Donchian lê o canal da vela anterior (`previous`) e lança `IndicatorError` sem ele.
- **Prazo da meta.** `decideGoalStep` vence quando `(open − period_start) ÷ d + 1 ≥ horizonDays × 86.400.000 ÷ d`: o último
  candle da meta fecha em `period_start + horizonDays × 86.400.000`. A base é `period_start` (a abertura da vela em curso na
  criação), **não** `started_at`, o que corrige o plan D5.
- **`candles.close`** é `numeric(24,8)` e volta com zeros à direita; `close_time` é a abertura + d − 1 ms (Binance). O motor
  recebeu esse `close_time` como `closeTime` (frescor de 48 h do sentimento): o gatilho tem de usar o mesmo, não
  `candle_time + d`.

**Paridade das leituras gravadas (plan D3), provada.** `test/live-stored-readings-parity.contract.test.ts` grava cada
decisão como `mapSignal` grava (`JSON.stringify`) e a lê como o Postgres devolve um `jsonb` (cada número passa pelo texto
`numeric`, sem expoente), remonta as `ScoreboardReadings` com `buildStoredReadings`
(`apps/api-ativada/src/runs/live-status/stored-readings.ts`) a partir da última linha e da anterior, e compara
`computeNextTriggers` com `computeLatestTriggers` sobre o prefixo inteiro da série (e o sinal do prefixo com o sinal
gravado) por `toStrictEqual`, nos dois estados (`awaiting_entry` e `holding`), em **todas** as velas decididas de
`btcusdt-1h-500` e `ethusdt-1d-400`, com cinco estratégias que cobrem as sete regras (Placar clássico; EMA 3×8 + RSI 7;
Donchian + Bollinger sem regime; Fear & Greed + EMA + MACD com ADX; as sete com ADX) e um sentimento sorteado com
observações ausentes, velhas (> 48 h) e de outra fonte. Resultado: **3.054 velas decididas, 6.100 comparações, 0
divergências**; as 4 restantes são a primeira decisão das duas estratégias com Donchian em cada conjunto (L2). Três
mutantes da remontagem (canal anterior trocado pelo atual, sentimento descartado, ADX descartado) são mortos.

| # | Decisão | Motivo |
|---|---|---|
| L1 | **Leituras gravadas → `ScoreboardReadings`** (`buildStoredReadings`, puro). Para cada regra que não é Fear & Greed: `current` = a remontagem de `rule:<id>` (escalar) ou de `rule:<id>.<saída>` (registro) da ÚLTIMA linha; `previous` = o mesmo da linha ANTERIOR **só no Donchian** (`undefined` nas outras, como `advanceIndicators`); Fear & Greed fica fora de `rules` (o placar o lê do sentimento). `atr` = `risk:atr`; `adx` = remontagem de `regime:adx` só com regime ADX. Sentimento = `sentiment_observation` da última linha, com o `sentimentSource` da execução (o placar refaz o frescor com o mesmo `closeTime` e chega à mesma observação). Valor que não é número finito conta como ausente: estado impossível que o placar recusa com `IndicatorError` (500). `close` e `closeTime` = `candles.close` e `candles.close_time` da vela da última linha; `state` = `holding` com posição aberta, senão `awaiting_entry` | É exatamente o que o placar viu; a paridade acima prova a igualdade. A linha "anterior" é a de maior `candle_time` abaixo da última: é a vela processada antes (lacuna não grava linha e o motor guarda em `previous` o último valor DEFINIDO do canal) |
| L2 | **Donchian sem linha anterior** (só a primeira decisão da simulação): `buildStoredReadings` devolve `needs_previous` e os gatilhos saem como indisponíveis, motivo `warming_up` ("O gatilho do rompimento precisa de duas velas decididas; aparece no próximo fechamento."). Nunca se inventa o canal | O canal da vela de aquecimento não fica gravado; reler velas seria recalcular o motor (RNF01) |
| L3 | **Gatilhos indisponíveis**, nesta precedência: `not_running` (status ≠ `running`: na fila, concluída, parada, com falha; o texto diz qual), `no_candle` (nenhuma linha em `signals`: "Aguardando a primeira vela, que fecha às HH:MM", com a hora montada no painel), `warming_up` (L2). Execução com desfecho de meta conclui e cai em `not_running` | O bloco sempre diz por que não há gatilho (RF07) |
| L4 | **`GET /v1/runs/:runId/live-status`** (sem query: qualquer parâmetro é `400`), `access: USER`, documentação OpenAPI, resposta `200 { data }` validada por Zod de saída. `data = { run, balance, buyAndHold, goal, openPosition, triggers, decisions }`, descritos em L5 a L10. Todo dinheiro, preço e taxa em **texto decimal** canônico (sem zeros à direita); todo instante em ms UTC; frases prontas em português | Uma ida ao servidor por vela (spec D1) |
| L5 | **`run`** = `{ id, status, symbol, timeframe, periodStart, lastCandleTime, lastDecisionAt, nextDecisionAt, waitingForData, stalledSince? }`. `lastDecisionAt` = `lastCandleTime + d` (o FECHAMENTO, spec D11) ou `null`; `nextDecisionAt` = o `dueAt` da regra P1 da spec 006 só com `status = running`, senão `null`; `waitingForData` (objeto ou `null`) e `stalledSince` (opcional) exatamente como em `GET /v1/runs/:id` | Uma só regra para "próxima decisão" (spec 006) |
| L6 | **`balance`** = `{ initial, current, result, resultRate, observedAt, message }`. `initial` = `runParameters.initialBalance`; `current` = `equity` do último ponto (`ORDER BY candle_time DESC LIMIT 1`) ou `initial` sem ponto; `result = current − initial` exato; `resultRate = result ÷ initial` a 12 casas para BAIXO (−∞); `observedAt` = `candle_time + d` do ponto ou `null`. Frase: "Seu saldo agora: {current} USDT (começou com {initial} USDT). Resultado: {result} USDT ({resultRate}%)." e, sem ponto, "Ainda sem vela fechada; o saldo é o inicial: {initial} USDT." | RF02; contra o usuário (RNF04) |
| L7 | **`buyAndHold`** = `{ value, resultRate, differencePoints, comparison, message }` ou `null` sem ponto. `value` = `benchmark` do MESMO ponto; `resultRate = (value − initial) ÷ initial` a 12 casas para baixo; `differencePoints = (current − value) ÷ initial × 100` a 12 casas para baixo (a estratégia menos o comprar e segurar, em pontos percentuais, calculado dos valores exatos, nunca das taxas arredondadas); `comparison` = `above` com `differencePoints ≥ 0,01`, `below` com `≤ −0,01`, senão `even`. Frases: "A estratégia está {d} pontos percentuais acima de comprar e segurar no mesmo período." (`d` para BAIXO), "… {d} pontos percentuais abaixo …" (`d` = módulo para CIMA) e "A estratégia está empatada com comprar e segurar no mesmo período (diferença menor que 0,01 ponto percentual)." ("1,00 ponto percentual" no singular) | RF03, spec D12: o mesmo número do `BalanceCard`; o arredondamento nunca favorece a estratégia |
| L8 | **`goal`** (só com `goalId`, senão `null`) = `{ targetRate, targetAmount, remainingAmount, remainingRate, deadlineAt, remainingMilliseconds, maxLossRate, floorAmount, lossRoomAmount, outcome, outcomeAt, message }`. Da fotografia `runs.request.goal` (`parseGoalSpec`) e de `computeGoalLevels` (o MESMO do worker): `targetAmount = ceil8(initial × (1 + targetRate))`, `floorAmount = ceil8(initial × (1 − maxLossRate))`; `remainingAmount = max(0, targetAmount − current)` para CIMA a 8; `remainingRate = remainingAmount ÷ initial` para CIMA a 12; `lossRoomAmount = max(0, current − floorAmount)` para BAIXO a 8; `deadlineAt = period_start + horizonDays × 86.400.000` (conferido acima); `remainingMilliseconds = max(0, deadlineAt − agora)` pelo relógio do servidor. `outcome` = `goal_outcome` (ou `null`) e `outcomeAt = goal_outcome_candle_time + d`; com desfecho a frase é a dele ("Meta alcançada.", "A simulação parou na perda máxima aceita.", "O prazo da meta acabou.") e os campos de "falta" continuam com os valores do último ponto | RF04, spec D8: um cálculo só, em decimal, no servidor |
| L9 | **Frases sem hora.** O servidor não conhece o fuso do usuário: nenhuma frase traz data ou hora; o painel monta "até 20/10 às 15:00", "faltam 5 dias e 19 horas", "termina hoje às 15:00", "prazo encerrado" e a hora de cada decisão com `formatInZone` a partir dos campos em ms. Números nas frases em pt-BR com milhar e 2 casas (`1.030,00`), arredondados na direção do campo (saldo, resultado, ganho e "ainda cabe" para baixo; perda, "falta" e taxas para cima) | RNF05; mesmo padrão de `trade-summary-message.ts` |
| L10 | **`openPosition`** = `{ entryPrice, quantity, targetPrice, stopPrice, openedCandleTime }` da posição `status = 'open'` (no máximo uma no ao vivo) ou `null`; a mesma leitura traz as posições que cruzam a página de decisões (L12) | RF08(b); uma consulta para as duas coisas |
| L11 | **`triggers`** = `{ status: "available", state, score, scoreThreshold, scoreGap, message, rules: [{ ruleId, label, kind, vote, weight, isMet, metric, direction, basis, current, threshold, distance, distanceRate, message }] }` (os campos do `NextTriggers` mais `label = ruleLabel(regra)` e a frase) ou `{ status: "unavailable", reason: "not_running" \| "no_candle" \| "warming_up", message }` (L3). Frase do placar: "Faltam {scoreGap} ponto(s) de {scoreThreshold} para comprar." / "… para vender." e, com `scoreGap ≤ 0`, "A pontuação já alcança o limiar de compra." (só acontece entre o fechamento e a ordem). Texto fixo ao fim: "Isto não é previsão: o preço pode nunca chegar lá, e outras regras podem mudar de voto antes." | RF07 |
| L12 | **Decisões** (`decisions` no `live-status` e a rota L13): `Decision = { candleTime, closedAt, close, action, outcome, score, scoreThreshold, regime, message, technicalReason, votes: [{ ruleId, label, kind, vote, weight, isMissing, reading }] }`. `closedAt = candle_time + d`; `close` = `candles.close` normalizado (junção pela PK com `exchange = 'binance'`, `symbol` e `timeframe` da execução; vela ausente é estado impossível e vira 500); `holding(t)` = existe posição com `opened_candle_time ≤ t` e (`closed_candle_time` nulo ou `> t`); `outcome` = `bought` (BUY e livre), `sold` (SELL e comprada), senão `waited`; `scoreThreshold` = `thresholds.buy` livre e `thresholds.sell` comprada; `technicalReason` = `signals.reason`; `reading` = as saídas gravadas da regra (`{ "<saída>": texto }`, `value` na saída única, número pela grafia do motor) ou `null` (Fear & Greed sem leitura). Não existe decisão "aquecendo": o aquecimento não grava linha | RF05; a regra de `holding` é a da carteira (a compra preenche na abertura seguinte e a saída no candle dela) |
| L13 | **`GET /v1/runs/:runId/decisions?cursor=&limit=`**: `limit` inteiro de 1 a 100, padrão **24**; `cursor` opaco `encodeTimeCursor(candle_time)` da última linha da página (o mesmo de `/signals`); ordem `candle_time` DECRESCENTE; leitura `LIMIT limit + 1` para saber se há próxima. Resposta `{ data: Decision[], pagination: { nextCursor, perPage } }`. O `decisions` do `live-status` é a primeira página: `{ items, nextCursor }`. Cursor inválido ou parâmetro desconhecido: `400` | Spec D2; mesmo envelope das listas |
| L14 | **Catálogo fechado de frases por decisão** (`decision-messages.ts`; `{regra}` = `ruleLabel`, `{n}` = pontos em pt-BR, "ponto" com 1 e "pontos" nos demais): **comprou** "Comprou: {k} de {m} regras a favor ({nomes})."; **vendeu** "Vendeu: {k} de {m} regras contra ({nomes})."; **esperou livre** "Faltou {n} ponto(s): {condição da regra contra ou neutra de maior peso}." (`n = thresholds.buy − score`; empate de peso fica com a primeira da configuração); **esperou comprada** "Esperou: já está comprada; a venda pede pontuação {sell} e está em {score}."; **BUY com posição** "Esperou: já está comprada; a compra não se repete."; **SELL livre** "Esperou: não há posição para vender."; **filtro de regime** (peso 0 por regime) acrescenta "O filtro de tendência (ADX) deixou {regra} de fora."; **sentimento ausente** (`isMissing`) acrescenta "Sem leitura do Fear & Greed nas últimas 48 h: a regra ficou neutra." (não é aquecimento: só o sentimento pode faltar depois do aquecimento) | RF06, spec D4 |
| L15 | **Condição da regra** (pelo voto gravado, sem limiar novo): EMA "a média rápida (EMA {f}) está abaixo da lenta (EMA {s})" / "as médias estão empatadas"; MACD "o MACD ainda está abaixo da linha de sinal" / "o MACD está igual à linha de sinal"; Donchian "o preço não fechou acima da máxima das últimas {p} velas" / "o preço fechou abaixo da mínima das últimas {p} velas"; RSI "o RSI ({x}) está entre {oversold} e {overbought}" / "o RSI ({x}) está acima de {overbought}"; Bollinger "o preço está dentro das bandas" / "o preço fechou acima da banda superior"; OBV "o volume (OBV) está abaixo da média dele" / "igual à média"; Fear & Greed "o Fear & Greed ({x}) não está em medo (até {fear})" / "está em ganância (a partir de {greed})". Gatilho por `metric` (`trigger-messages.ts`): `close_price` "o preço precisa fechar acima/abaixo de {threshold} (hoje {current}, faltam {distanceRate}%)", `rsi` "o RSI precisa ficar abaixo de {threshold}" (venda: acima), `macd_gap` "o MACD precisa passar a linha de sinal", `obv_gap` "o OBV precisa passar a média dele", `fear_greed_index` "o Fear & Greed precisa chegar a {threshold} ou menos" (venda: ou mais); `basis = indicative` acrescenta "(aproximado: o indicador se move com a próxima vela)" | Catálogo FECHADO: cada `metric` e cada voto têm frase com teste literal (T1.2) |
| L16 | **`/chart` ganha `decisions`**: `[{ candleTime, closedAt, action, outcome, score, scoreThreshold }]` em ordem crescente, da faixa efetiva `[from, to)`, só em `live_paper`; `null` em backtest e walk-forward e quando a faixa tem mais de **500** velas (`(to − from) ÷ d > 500`, conta sem consulta). Até 500: uma consulta de `signals` (`candle_time` na faixa, `LIMIT 501`) e a mesma leitura de posições de L10/L12 para `outcome` e `scoreThreshold`. Campos antigos intactos | RF15, spec D5: o painel desenha o pontinho onde `outcome = waited` e a dica "Esperou às HH:MM — pontuação {score} de {scoreThreshold}" |
| L17 | **Erros e acesso** nas três rotas: execução alheia, inexistente, apagada ou id malformado = o MESMO `404 RUN_NOT_FOUND`; dono certo e `kind ≠ live_paper` em `live-status` e `decisions` = `409 RUN_NOT_LIVE` (código novo em `RUN_ERROR_CODE`; o `/chart` continua respondendo a todos os tipos); validação `400` com todos os erros, sem eco de valor (`readValidatedQuery`) | ADR 0001 §e; spec D9 |
| L18 | **Limite** `RUN_LIVE_STATUS` (`run-live-status`): 60 por minuto por usuário, UM balde para `live-status` e `decisions`; o `/chart` mantém `RUN_CHART` (30/min) | Spec D10: um aviso do stream refaz a consulta; 60/min sobra |
| L19 | **Custo do `live-status`: 5 consultas, todas por chave e com `LIMIT`**: (1) a execução do dono (`runs`, PK + `user_id`); (2) a versão da estratégia (`strategy_versions`, PK + `user_id`) para `config` e limiares; (3) o último ponto de `equity_points` (PK, `LIMIT 1`); (4) as posições da execução por `positions_user_id_run_id_idx`, só as abertas ou que cruzam a faixa da página; (5) a página de `signals` com a junção em `candles` (`LIMIT 25`), cujas DUAS primeiras linhas são as dos gatilhos. Sem N+1, nada lido em laço. `decisions` faz (1), (2), (4) e (5). As leituras com `userId` no tipo moram em `packages/database/src/run-results/run-live-status.ts`. Agregado com `Promise.all` só DEPOIS de (1): falha em qualquer leitura é 500 (não há parte opcional que justifique `allSettled`) | ≤ 6 consultas (RNF01) |
| L20 | **Sem cache no servidor.** O aviso do WebSocket já invalida a raiz `runs` no painel; as chaves novas são `['runs', runId, 'live-status']` e `['runs', runId, 'decisions']` | RF12, spec 005 O13 |
| L21 | **Revisão final (opus): desfechos de saída e compra sem preenchimento.** O `outcome` ganhou `exited` e `buy_pending` (`waited`, `bought` e `sold` ficam). Tudo sai das posições JÁ lidas em L10/L12 (`readCandleState`, `decision-candle-state.ts`, nenhuma consulta nova): **`exited`** = existe posição com `closed_candle_time = t` e `exit_reason` diferente de `signal` (alvo, stop, lacuna ou comando); vence qualquer ação da vela. Frases fechadas: "Vendeu no alvo ({alvo}).", "Vendeu no stop ({stop}).", "Saiu pela lacuna de dados.", "Saiu porque a meta terminou." (`command`, que também cobre a parada pelo usuário: o texto fala de meta, ver pendência). **BUY livre** só é `bought` se existe posição com `opened_candle_time = t + d`; na ÚLTIMA vela decidida (`runs.last_candle_time = t`) é `buy_pending` ("Pediu compra: executa na abertura da próxima vela."); nas demais é `waited` com "Sinal de compra sem execução." (ordem recusada pelo mínimo, caixa ou volume). A faixa lida de posições passou a incluir a vela seguinte à mais nova (`to = mais nova + d`) e vem da MAIS NOVA para a mais antiga (o corte do `LIMIT` nunca descarta a aberta). No `/chart`, `readChartDecisions` roda FORA do `Promise.all` do caminho crítico: falha ao lê-las devolve `decisions: null` (sem log, sem PII) e o preço e as operações seguem | Revisão final da spec 008: "Esperou… Faltou N pontos" numa vela que vendeu no alvo e "Comprou" numa compra que não preencheu eram falsos; §15 do `code-standart.md` (consulta secundária não derruba o caminho crítico) |

**Contratos de teste esperados.**

- Paridade (T0.1, feito): `test/live-stored-readings-parity.contract.test.ts` verde; em T1.1 entra o caso da linha
  anterior com lacuna (a anterior é a de maior `candle_time` abaixo, não `t − d`) e valores não numéricos como ausência.
- Contas (T1.1): saldo, resultado, comprar e segurar e meta à mão (ganho, perda, empate exato, `|dif|` 0,009 e 0,01),
  propriedades com 2.000 sorteios (`remainingAmount ≥ 0`, `lossRoomAmount ≥ 0`, texto exibido nunca a favor do usuário,
  `targetAmount`/`floorAmount` iguais a `computeGoalLevels`); `deadlineAt` em 15m, 1h, 4h e 1d igual ao instante em que
  `decideGoalStep` devolve `expired`.
- Frases (T1.2): texto literal para cada linha de L14 e L15 e cada `metric` × estado × `basis`, singular e plural, regime
  filtrado e sentimento ausente.
- Banco (T1.3): `make database-test` com isolamento entre usuários nas quatro leituras, ordem decrescente, cursor (as
  páginas concatenadas são a lista inteira), junção com `candles` e `holding(t)` na borda (compra e venda na mesma vela).
- Rotas (T1.4, `loadApiApp()`): feliz com e sem meta, com desfecho, sem vela, aquecendo (Donchian com uma linha), comprada,
  parada e concluída; `404` entre usuários, inexistente, malformado e apagada nas três; `409 RUN_NOT_LIVE` em backtest e
  walk-forward; `400` com todos os erros sem eco (`limit` 0, 101, `abc`, cursor inválido, parâmetro desconhecido no
  `live-status`); limite padrão 24; contador de consultas ≤ 5 no repositório em memória; `api-openapi` verde.
- `/chart` (T1.5): `decisions` com 500 velas na faixa, `null` com 501, `null` em backtest; contrato antigo intacto.
- Mutantes (T1.6): filtro de dono nas quatro leituras (API e Postgres), `409`, teto de 500, cada direção de arredondamento,
  limiar de `even`, frase do limiar e a precedência de L3.

## Gráfico estilo Binance (spec 009)

Contrato da T0.1 da spec 009: duas leituras novas sobre o que backtest, walk-forward e simulação ao vivo já gravam
(`signals`, `candles`, `positions`, `walk_forward_windows`, `runs`), **sem migration, sem índice novo e sem reexecutar o
motor por pedido** (decisões do usuário em `specs/009-grafico-estilo-binance/evidence.md`: D1-A, D2-A, D3-A, D4-A, D5-A,
D6-A). O motor e o `run-recording` não mudam. Conferido no código e medido em 2026-10-15:

- **`signals` do walk-forward** só existem nas janelas de TESTE (`test-collection.ts`; a vela-âncora fica de fora), e cada
  janela usa a combinação escolhida no ajuste: limiares e períodos podem mudar de janela para janela (o catálogo inclui
  `thresholds.buy`/`thresholds.sell`). `best_params` guarda `{ combinationIndex, assignment }` só da janela `ok`; a janela
  parada (`status ≠ ok`) grava os sinais da combinação 0 da grade, que o banco não guarda.
- **`signals.indicators`** (spec 008, acima): as saídas de preço são `rule:<id>.upper/.lower` (Donchian),
  `rule:<id>.fast/.slow` (cruzamento de EMA) e `rule:<id>.upper/.middle/.lower/.width` (Bollinger); `risk:atr` é escalar.
  Os valores são `number` do indicador (ponto flutuante, permitido só ali); o `jsonb` os devolve sem expoente.
- **Índices usados**, todos existentes: `signals_user_id_run_id_idx` (resumo: todas as linhas da execução, com `user_id`),
  `signals_run_id_candle_time_unique` (páginas de camadas e de previsões, cursor) e
  `candles_exchange_symbol_timeframe_open_time_pk` (varredura de faixa do `LEAD` e igualdade da vela seguinte). **Não falta
  índice.**
- **Medição** (`packages/database/test-support/projection-summary-benchmark.ts`; Postgres 18.6 descartável com 543.120 sinais
  de 31 execuções e 140.160 velas de 15 min; a execução medida tem 17.520 sinais, um backtest de 15 min em 6 meses; 200
  rodadas depois de 10 de aquecimento, cliente no WSL): resumo pelo `LEAD` (P6) com 1 janela **p95 de 101 a 125 ms** e com
  6 janelas **p95 de 135 a 146 ms** (três execuções do script); a variante por igualdade na PK deu p95 de 152 a 242 ms. A
  página de camadas (1.000 linhas de `signals`) leva p95 3 ms, mas são 441 KB de linhas cruas em JSON: daí o teto de 1.000
  velas e o formato em colunas (P1). Tudo abaixo de 300 ms: nenhuma parada.

| # | Decisão | Motivo |
|---|---|---|
| P1 | **`GET /v1/runs/:runId/strategy-layers?from=&to=`**, query estrita, `access: USER`, documentação OpenAPI, Zod de entrada e saída, política `RUN_CHART`. Faixa `[from, to)` em ms UTC (O2); ausente, `to` = fim da faixa da execução (O1) e `from` = `max(início da faixa, to − 1.000 × d)`; recortada à faixa da execução como no `/chart`; interseção vazia é `400 from: outside_run`, `to ≤ from` é `400 to: must_be_after_from` e **mais de 1.000 velas** (`(to − from) ÷ d > 1000`, conta sem consulta) é `400 to: range_too_large`. Resposta `200 { data: { version: 'layers-1', timeframe, from, to, candleTimes, score, actions, atr, lines, thresholds } }` **em colunas**: `candleTimes` são as aberturas das velas DECIDIDAS na faixa (uma linha de `signals` por vela, crescente); `score` (texto decimal), `actions` (`BUY`/`SELL`/`HOLD`) e `atr` (texto ou `null`) vêm alinhados a ela; `lines: [{ key, ruleId, role, label, values }]` com `values` alinhado a `candleTimes` (texto decimal, ou `null` quando a chave falta ou não é número finito); `thresholds: [{ from, to, buy, sell }]` (P4). Execução na fila: listas vazias | Em objetos por ponto o payload passa de 1 MB com 5.000 velas; em colunas, 1.000 velas com as 7 linhas possíveis ficam perto de 140 KB (RNF02 ≤ 250 KB). 1.000 é a página de velas do painel (plan D1); o teto de 5.000 do plan D2 cai |
| P2 | **Linhas por papel**, só das regras de PREÇO que a versão usa (D11), na ordem das regras da configuração: Donchian → `channel_upper` (`.upper`) e `channel_lower` (`.lower`); cruzamento de EMA → `ema_fast` (`.fast`) e `ema_slow` (`.slow`); Bollinger → `band_upper`, `band_middle` e `band_lower` (`.width` não é preço e fica fora). MACD, RSI, OBV e Fear & Greed não desenham linha sobre o preço. Estratégia sem regra de preço: `lines: []` (o painel diz "Esta estratégia não usa linhas sobre o preço"). Rótulos do servidor: "Canal Donchian ({p} velas): topo" / "…: fundo", "Média rápida (EMA {f})", "Média lenta (EMA {s})", "Bollinger ({p} velas, {k} desvios): banda de cima" / "…: média" / "…: banda de baixo" (`{k}` com vírgula decimal). No walk-forward, se o período da regra muda entre janelas, o rótulo perde os números ("Canal Donchian: topo") | Mapeamento fechado e testável para as 7 regras; a linha é exatamente o que o motor viu |
| P3 | **Regra `projection-1`** (pura, `apps/api-ativada/src/runs/projections/projection-rule.ts`, `PROJECTION_RULE_VERSION = 'projection-1'`). Vela `t` decidida: `side` = `buy` (`score > 0`), `sell` (`< 0`) ou `none` (`= 0`). `strength` pela fração do limiar DO LADO, sem divisão: `2·|score| ≤ |limiar|` → `weak`; `|score| < |limiar|` → `strong`; senão `decided`. `stance`: livre + `buy` → `buy`; livre + `sell` → `stay_out`; comprada + `buy` → `hold`; comprada + `sell` → `sell` (comprada = `holding(t)` de L12). Faixa: `bandLow = floor8(close − atr)` e `bandHigh = ceil8(close + atr)` (8 casas, as do dinheiro: a faixa nunca encolhe). Vela seguinte = a de abertura **exatamente** `t + d` (sem pular lacuna) e dentro da faixa da execução (abertura antes do fim de O1): `hit` (`buy` e fechamento seguinte maior, ou `sell` e menor), `miss` (o contrário), `tie` (igual), `no_side` (`side = none`), `pending` (vela seguinte ainda fora da faixa) ou `gap` (dentro da faixa, mas ausente em `candles`). `isInside` = `bandLow ≤ fechamento seguinte ≤ bandHigh` (`null` sem ATR ou sem resultado). `moveRate = (seguinte − close) ÷ close` a 4 casas para BAIXO (−∞) | É o plan D3 com as bordas fechadas: comparação exata em `numeric`/`EngineDecimal`, nada de ponto flutuante na decisão |
| P4 | **Limiar de cada vela.** Backtest e ao vivo: `config.thresholds` da versão, num segmento `[início de O1 − d, fim de O1)` (a primeira decisão do ao vivo é a vela `period_start − d`). Walk-forward: um segmento por janela `ok`, `[test_start, test_end)`, com os limiares de `deriveStrategyConfig(config, best_params.assignment)` (função do motor, só leitura de configuração). **A janela parada fica FORA** das previsões e sem segmento de limiar nas camadas (as barras do placar aparecem, as linhas de limiar não): o banco não guarda a combinação que ela usou, e reconstruí-la pela grade seria recalcular | Nenhum número inventado: limiar e período vêm da configuração que gerou a linha |
| P5 | **Taxas e veredito.** `counted = hits + misses`; `hitRate = hits ÷ counted`; `upRate = upMoves ÷ counted` ("sempre sobe": as contadas cujo fechamento seguinte subiu); `insideRate = inside ÷ banded` (`banded` = resolvidas com lado e ATR, empates incluídos); cada uma a **4 casas para baixo** (2 em porcentagem; texto canônico; `null` com denominador 0); `byStrength` igual, por força. Veredito pelo **intervalo de Wilson de 95%**, `z = 1,96`: `too_few` com `counted < 30`; `above` se o limite inferior > 0,5; `below` se o superior < 0,5; senão `even`. A decisão é a desigualdade **inteira exata** (`z² = 2401/625`, `k = hits`, `n = counted`): inferior > ½ ⇔ `2k > n` e `625²·n·(2k − n)² > 2401·(625·4k(n − k) + 2401·n)`; superior < ½ ⇔ `2k < n` e a mesma desigualdade. Os limites exibidos saem em `EngineDecimal` a 12 casas, o inferior para baixo e o superior para cima, presos a `[0, 1]` | Nenhum arredondamento muda o veredito; o oráculo usa a mesma desigualdade em `bigint` |
| P6 | **Resumo em UMA consulta** (`summarizeProjections({ userId, runId, … })` em `packages/database/src/run-results/run-projections.ts`, `userId` no tipo): `series` = `candles` da faixa `[menor início dos segmentos, fim de O1)` com `lead(open_time)` e `lead(close)` `OVER (ORDER BY open_time)` (varredura de faixa da PK, `exchange = 'binance'`); `signals` do dono e da execução por `signals_user_id_run_id_idx`; junção com os segmentos de P4 passados por `jsonb_to_recordset($::text::jsonb)` (parametrizado, sem `sql.raw`); `LEFT JOIN series ON open_time = candle_time AND next_open = candle_time + d` (vela seguinte contígua; lacuna ou fim da faixa = sem resultado); `count(*) FILTER (…)` para `noSide`, `pending` (com lado e sem resultado), `hits`, `misses`, `ties`, `upMoves`, `banded`, `inside` e acertos e erros por força (a força pela comparação de P3, em `numeric`). A faixa sai em SQL, com `floor((close − atr) × 10⁸) ÷ 10⁸` e `ceil(…)` sobre `(indicators->>'risk:atr')::numeric`. Taxas, Wilson e frases em TS a partir das contagens | É o `LEAD` do plan D2 com a contiguidade conferida; medido acima (p95 ≤ 146 ms). Nunca um laço por vela no Node (RNF01) |
| P7 | **`GET /v1/runs/:runId/projections?cursor=&limit=`**, `access: USER`, documentação, Zod, política `RUN_LIVE_STATUS` (o balde de 60/min de L18, agora com três rotas). `limit` de 1 a 100, padrão **24**; `cursor` = `encodeTimeCursor(candle_time)` (L13), ordem decrescente, leitura `LIMIT limit + 1`. Resposta `200 { data: { version: 'projection-1', timeframe, current, summary, items, nextCursor } }`. **`items`**: `[{ candleTime, closedAt, side, strength, score, base, bandLow, bandHigh, nextClose, moveRate, result, isInside }]` (`strength`, faixa, `nextClose`, `moveRate` e `isInside` são `null` quando não se aplicam); a vela seguinte de cada item vem por igualdade na PK (no máximo 101 linhas). **`summary`**: `{ counted, hits, misses, ties, noSide, pending, upMoves, banded, inside, hitRate, upRate, insideRate, byStrength: [{ strength, counted, hits, hitRate }], wilson: { lower, upper } ou null, verdict, message, verdictMessage }`, da execução inteira (P6). **`current`**: `{ status: 'available', candleTime, closedAt, horizonEndsAt, side, stance, strength, score, threshold, base, bandLow, bandHigh, atr, label, message }` (`closedAt = t + d`; `horizonEndsAt = t + 2d`, o fechamento da vela prevista) ou `{ status: 'unavailable', reason, message }`, nesta precedência: `not_running` (não é `live_paper` ou `status ≠ running`), `no_candle` (nenhuma linha em `signals` e `last_candle_time` nulo), `warming_up` (nenhuma linha, mas já processou vela: aquecimento) e `neutral` (placar da última linha = 0). `other_timeframe` e "preço parado" são do painel. Consultas: execução, versão, janelas (só walk-forward), resumo, página e posições (só para o `stance` do ao vivo rodando): no máximo 6, sem N+1, `Promise.all` só depois da execução; falha de qualquer uma é 500 | Plan D2 com os campos fechados; backtest e walk-forward trazem `summary` e `items`, com `current` `not_running` |
| P8 | **`live-status` não ganha `projection`.** O resumo (até ~150 ms) iria para toda resposta do `live-status` (5 consultas, L19) só para a tela que mostra o gráfico; a previsão tem chave própria, `['runs', runId, 'projections']`, refeita pelo mesmo aviso do stream | A T0.1 não achou ida a poupar: o cartão do gráfico já busca camadas e velas por conta própria |
| P9 | **Frases** (catálogo fechado em `projection-messages.ts`, sem data nem hora, L9). `label` = postura + força: "Tende a COMPRAR", "Tende a SEGURAR", "Tende a VENDER" ou "Tende a FICAR DE FORA", mais " · fraco", " · forte" ou " · decidiu". `message` com lado `buy`: "Placar {score} de {threshold} para comprar."; com `sell`: "Placar {score} de {threshold} para vender." Números com sinal explícito (`+1`, `−1` com U+2212, `0` sem sinal), vírgula decimal e sem zeros à direita ("+1,5 de +2"). Indisponível: `neutral` "O placar está em 0: nenhuma regra puxa para um lado."; `warming_up` "A estratégia ainda está juntando velas para calcular as regras."; `no_candle` "Aguardando a primeira vela fechar."; `not_running` "A simulação não está rodando: não há próxima decisão." (ao vivo) ou "Este é um teste no histórico: não há próxima decisão. O histórico de acertos está abaixo." (backtest e walk-forward). Resumo, `message`: "Acertou o lado em {hitRate}% ({hits} de {counted}). Moeda ao ar: 50%. 'Sempre sobe': {upRate}%. Dentro da faixa: {insideRate}%." (porcentagens pt-BR com 2 casas, exatas porque a taxa já tem 4; sem faixa, a última frase sai) ou, sem contadas, "Nenhuma previsão com resultado ainda."; `verdictMessage`: `above` "Até aqui, a tendência acertou o lado mais vezes que uma moeda ao ar."; `even` "Até aqui, a tendência acertou o lado tanto quanto uma moeda ao ar. Ela serve para ler o placar, não para adivinhar o preço."; `below` "Até aqui, a tendência errou o lado mais vezes que uma moeda ao ar."; `too_few` "Ainda há poucas previsões para dizer se acerta mais que o acaso." O "o que falta" é o de `trigger-messages.ts` (spec 008), lido do `live-status`: nada duplicado. Do painel: `other_timeframe` "A estratégia decide em velas de {tf}; troque para {tf} para ver a previsão." e "O preço ao vivo parou de chegar; a previsão volta quando ele voltar." | Plan D4 com o acerto em porcentagem que o usuário pediu ("acertou 49%" ao lado dos 50%) |
| P10 | **Wilson num lugar só: `packages/statistics/src/wilson-interval.ts`** (pacote novo `@ativada/statistics`, puro, sem relógio nem I/O; depende só de `@ativada/strategy-engine`, para importar `EngineDecimal` sem mudá-lo). Exporta `WILSON_Z_SQUARED` (`{ numerator: 2401n, denominator: 625n }`), `COIN_FLIP_MINIMUM_COUNTED = 30`, `COIN_FLIP_VERDICT` (`above`, `even`, `below`, `too_few`), `computeWilsonInterval({ successes, total })` → `{ lower, upper }` (P5) e `judgeAgainstCoinFlip({ hits, counted })` → `{ verdict, lower, upper }` (`lower` e `upper` `null` com `counted = 0`). Quem chegar primeiro cria (a T1.1 desta spec ou a T1.1 da spec 007); o outro importa. A spec 007 usa o mesmo veredito e o `lower` para o peso (`lower − 0,5` só em `above`) | O Wilson não pode morar na API (a 007 é um pacote) nem no motor (RNF08); um pacote neutro evita duas regras de acerto (risco listado na spec 007) |
| P11 | **Erros e acesso** nas duas rotas: alheia, inexistente, apagada ou id malformado = o MESMO `404 RUN_NOT_FOUND`; `400` com todos os erros, sem eco (`readValidatedQuery`); qualquer tipo de execução responde (sem `409`). Sem cache no servidor; as chaves do painel são `['runs', runId, 'strategy-layers', from, to]` e `['runs', runId, 'projections']` (o aviso `runs` as refaz); velas públicas sob `['markets', …]` | ADR 0001 §e; L17 e O13 |

**Oráculo e dourado (feitos na T0.1).** `test/fixtures/projections/projection-summary-oracle.fixture.ts` (só `bigint`, sem
importar `src` nem `decimal.js`) conta como P3, P5 e P6; `test/projection-summary-oracle.contract.test.ts` roda o
`signalStep` nos dois conjuntos reais e confere o dourado `projection-summary-golden.fixture.ts`:

| Conjunto · estratégia | Decididas | Sem lado | Contadas | Acertos | Acerto | "Sempre sobe" | Dentro da faixa | Veredito |
|---|---|---|---|---|---|---|---|---|
| BTCUSDT 1h × 500 · Placar clássico | 307 | 21 | 285 | 134 | 47,01% | 53,68% | 86,31% (246 de 285) | `even` |
| BTCUSDT 1h × 500 · Donchian 20 + MACD 12/26/9 (±2) | 372 | 1 | 370 | 180 | 48,64% | 51,35% | 86,75% (321 de 370) | `even` |
| ETHUSDT 1d × 400 · Placar clássico | 207 | 14 | 192 | 84 | 43,75% | 51,04% | 87,50% (168 de 192) | `even` |
| ETHUSDT 1d × 400 · Donchian 20 + MACD 12/26/9 (±2) | 272 | 0 | 271 | 123 | 45,38% | 51,66% | 87,45% (237 de 271) | `even` |

Nenhum empate nos quatro e uma vela pendente em cada (a última). Como no preview (LINK 1h, 49,42%), a tendência do placar
não supera a moeda ao ar em nenhum conjunto; a faixa de ±1 ATR contém o fechamento seguinte em cerca de 87% das velas.
Bordas do Wilson à mão: 29 de 29 dá `too_few`; 30 de 30, `above`; com 30 contadas, 21 acertos é o primeiro `above`
(inferior 0,5212) e 20 é `even` (0,4878); 9 é o primeiro `below`; 171 de 346 é `even` (44,2% a 54,7%).

**Contratos de teste esperados.**

- Puros (T1.1): `projection-rule` com contas à mão (cada força na borda, cada postura, faixa na 9ª casa, `moveRate` negativo
  para baixo) e propriedades com 2.000 sorteios (faixa nunca encolhe, `counted = hits + misses`, taxas em `[0, 1]` e nunca
  acima da fração exata); `wilson-interval` nas bordas de P5 e `lower ≤ p ≤ upper`; frases literais de P9 (sinal, vírgula,
  cada motivo).
- Banco (T1.2): `make database-test` com o resumo SQL igual ao oráculo nos quatro casos do dourado (velas e sinais gravados
  como o backtest grava), lacuna de vela (`gap`), fim da faixa (`pending`), walk-forward com dois limiares e janela parada
  fora; isolamento entre usuários nas três leituras; páginas concatenadas = lista inteira.
- Rotas (T1.3, T1.4, `loadApiApp()`): os casos de P1, P7 e P11, mais `lines: []`, rótulo sem período no walk-forward,
  `range_too_large` com 1.001 velas, cada motivo de `current` e a precedência; `api-openapi` verde.
- Mutantes (T1.6): filtro de dono (API e Postgres), `LEAD` trocado por `LAG`, contiguidade removida, empate contado como
  acerto, limiar do lado errado, `≤` → `<` na força, faixa arredondada para dentro, taxa para cima, `30` → `29`, janela parada
  contada.

**Biblioteca de gráfico (spike da T0.2).** `lightweight-charts@5.2.1` (Apache-2.0, dependência única `fancy-canvas@2.1.0`,
MIT) instalada exata no painel, com o `bun.lock` mudando só as três linhas dela.

| # | Decisão | Motivo |
|---|---|---|
| P12 | **`layout.attributionLogo: false`, sempre.** Com o logotipo ligado (o padrão da v5) a biblioteca cria um `<style>` em linha para posicioná-lo, e a CSP do painel (`style-src 'self'`) o bloqueia: 4 violações `style-src-elem` no spike e o logotipo sem posição. Sem ele, **zero** violação: o resto do estilo é por CSSOM (`element.style.x = …`, que a CSP não bloqueia); não há `eval`, `new Function` nem `setAttribute('style')`. **A CSP não muda.** | O `README` da biblioteca exige o aviso do `NOTICE` e um link para tradingview.com na página; o logotipo é só UMA das formas de cumprir o link |
| P13 | **Crédito no rodapé do cartão do gráfico** (RF22, T3.1), texto do `NOTICE` da tag `v5.2.1` (o pacote npm não traz o arquivo): "TradingView Lightweight Charts™ — Copyright (c) 2025 TradingView, Inc." com link `https://www.tradingview.com/` (`rel="noreferrer"`, `target="_blank"`). Um contrato do painel prende o texto e o link | Cumpre a licença sem afrouxar a CSP |
| P14 | **Um só arquivo importa a biblioteca**: `src/runs/candle-chart/lightweight-surface.ts`, atrás da porta `ChartSurface` (`chart-surface.types.ts`); os contratos usam `test/support/fake-chart-surface.ts`. `test/chart-surface.contract.tsx` prova o padrão (StrictMode monta duas vezes e só a última superfície fica viva) e reprova outro arquivo de `src` que importe `lightweight-charts`. A T3.1 carrega o adaptador por `import()` dinâmico (pedaço próprio do build): a biblioteca soma ~58 KB gzip a um painel de ~207 KB gzip e só a tela de detalhe precisa dela | happy-dom não tem canvas (`getContext('2d')` é `null`); o resto do painel não paga o peso do gráfico |

### Correções da revisão final (spec 009)

A revisão final (opus) da spec 009 mudou o contrato só de forma ADITIVA; o que ficou de fora está marcado como desvio.

| # | Decisão | Motivo |
|---|---|---|
| R1 | **P7 ganha três motivos em `current.reason`**, todos aditivos: `stalled` (a varredura marcou `stalled_since`), `waiting_for_data` (`waiting_since`: buraco de velas à espera de recuperação) e `read_failed` (a leitura das posições, que só refina a postura, falhou). Nova precedência: `not_running`, `stalled`, `waiting_for_data`, `no_candle`, `warming_up`, `neutral`, e `read_failed` quando há tendência a refinar. Parada vence espera, e as duas vencem a tendência da última vela: uma simulação que não anda não mostra uma previsão que ficou velha. | O painel desenhava a tendência da última vela como se o worker estivesse em dia (M6). A falha de uma leitura secundária não pode derrubar o resumo e as previsões (§15, `Promise.all`; baixo 11). |
| R2 | **`current` e `summary` só vão na PRIMEIRA página** (sem `cursor`); a página por cursor traz `version`, `timeframe`, `items` e `nextCursor`. No esquema os dois viram opcionais (resposta mais frouxa, nenhum campo renomeado ou removido da primeira página). A página por cursor faz 3 consultas (execução, versão, página), não refaz o `LEAD` do resumo nem lê a "linha mais nova". | O resumo era recalculado (p95 de 101 a 146 ms) a cada "Ver mais" e jogado fora (M7). O painel usa esquema e consulta próprios para as páginas por cursor e trata as chaves delas como as das decisões: `refetchType: 'none'` no aviso do stream. |
| R3 | **`summary.pending` junta duas situações que `items[].result` distingue**: `pending` (a vela seguinte ainda está fora da faixa da execução) e `gap` (a vela seguinte está dentro da faixa e ausente em `candles`). O SQL do resumo conta as duas em `pending` (`next_close IS NULL` com lado) e nenhuma entra em `counted`, `hits` ou `misses`. Sem mudar o contrato; o painel não promete que "pendente" é "ainda vai chegar". | Registro do baixo 8: a diferença só existe por item. |
| R4 | **A previsão do painel envelhece**: com o relógio do navegador `now > horizonEndsAt + 2 min` (`STALE_FORECAST_GRACE_MILLISECONDS`) e nenhuma previsão nova, o painel diz "A previsão ficou velha" e não desenha o cone. É regra de tela, sem campo novo; o servidor continua dono dos motivos de R1. | Defesa em profundidade: a API pode ainda não ter marcado a parada (carência de 15 min) e a tela já não deve parecer em dia. |
| R5 | **Limites e bordas arredondados para FORA na tela**: os limites de Wilson mostrados (`formatIntervalLimitPercent`) descem o de baixo e sobem o de cima na segunda casa; a faixa da previsão (`formatPriceEdge`) desce a borda de baixo e sobe a de cima na escala do preço. O servidor já entrega os números; só a exibição era arredondada para o lado errado. | Mesma regra de dinheiro e taxas: o intervalo mostrado nunca é mais estreito do que o do servidor (M4, baixo 2). |
| R6 | **A vela escolhida na barra do gráfico NÃO é lembrada**: só as camadas vão ao `localStorage`. A vela escolhida vale para a execução aberta (RF05: cada execução abre marcada na própria vela). O painel só oferece as velas do ambiente (`VITE_MARKET_TIMEFRAMES`, que o `dev-up` copia de `MARKET_TIMEFRAMES`; a da execução vem sempre), e uma vela que a API recusa (400) leva ao gráfico simples com "Tentar de novo" e "Voltar para a vela da execução". | Uma preferência guardada valia para todas as execuções e para ambientes com outras velas, e prendia a pessoa no gráfico simples (M1). |
| R7 | **Desvio: RF02 (faixa visível na URL ao arrastar ou dar zoom) NÃO foi feito.** Gravar `?de=&ate=` a cada arrasto muda `view.range`, que hoje define a janela de velas, a consulta de `/chart` (balde `RUN_CHART`, 30/min por usuário) e o "acompanhar o fim" (a vela em formação some com faixa na URL). Separar a faixa "mostrada" da faixa "pedida" exige tocar essas três peças ao mesmo tempo. A URL continua guardando a faixa que a PESSOA escolhe nos controles de período, na tabela e nos botões de grupo; o arrasto livre não entra nela. | Risco de reenquadrar e recarregar a série a cada gesto, e de estourar o limite de `/chart`, maior que o ganho do link compartilhável. Fica como pendência da próxima spec do gráfico. |
| R8 | **`useLiveCandle` lê por chave** (`CandleStore.candleAt` e `MarketStore.priceAt`, referência estável por par e vela), e sem kline o "preço parado" sai do último tick do par (`isPriceFresh`). `TICKER_KLINE_ENABLED` só vale com `TICKER_STREAM_ENABLED=true`: o `env.dev` agora liga os dois (o ticker lê só preços públicos da Binance) e o runbook diz isso. | M2 e M3: mensagem de outro par re-renderizava o gráfico; com o kline desligado o selo nunca avisava que o preço parou. |
| R9 | **Paginação à esquerda pelo limite, não pelo tamanho da página**: `hasMore = page.from > earliestTime`; página vazia ou curta avança (`reachedFrom`) e falha de página não zera `hasMore`. O teclado guarda a vela apontada pelo `openTime` e deriva o índice a cada render. | M8 e o ALTO: a página anterior entrava à esquerda e o teclado passava a apontar outra vela. |

**Pendências registradas, sem mudar o comportamento** (decisões abertas da revisão): (a) `candle-window` usa o relógio para escolher a primeira página; (b) a mensagem de `kline` de fechamento (`closed: true`) é descartada pelo painel e a vela fechada chega só pelo REST depois do aviso `runs`; (c) as camadas da estratégia dividem o balde `RUN_CHART` com o gráfico (30/min), e o arrasto longo as pede em blocos de 150 velas; (d) o contêiner do canvas tem `role="img"` com descrição longa, e um `role="application"` daria ao leitor de tela o modo de teclado direto, ao custo de a pessoa perder a navegação por texto; (e) na desmontagem o gráfico limpa a superfície antes de cancelar as assinaturas, e a ordem inversa é a mais segura; (f) as caixas de stop e alvo só existem para as operações carregadas na tabela, não para todas as da execução.

## Analista de risco (spec 007)

Contrato da T0.1 da spec 007: a regra `analyst-1` fechada, o auditor de acertos com o Wilson ÚNICO, o passo sombra/governar,
o registro, as rotas e o catálogo de frases. Sem resposta do usuário às decisões do `spec.md` §9, valem os padrões A,
**exceto o que exige autorização e ainda não foi dada**: a tabela `analyst_decisions` (D3-A, T2.1), o modo governar com a
mudança no motor e a migration de `run_commands` (D1, D2-A, Fase 4), as colunas novas em `candles` (T5.2), as fotos do livro
de ofertas (T5.3) e as fontes externas (T5.4). Esses pontos estão **só desenhados** abaixo (A19, A21, A22) e a execução para
e pergunta antes de cada um. **A Fase 1 fecha sem mudar o motor nem o `run-recording`** (conferido item a item abaixo).
Conferido no código e medido em 2026-10-15:

- **Especialista cabe no esquema do motor.** `STRATEGY_CONFIG_SCHEMA` aceita uma regra só, `regime: { kind: 'none' }`,
  limiar `buy: '1'` (> 0) e `sell: '-1'` (< 0) e o risco padrão; `createStrategySignalState` dá o aquecimento: **129** velas
  na Tendência (MACD 26/9 e EMA 21 com a convergência de `computeEmaConvergenceCandles`) e **97** nas outras três (ATR 14
  de Wilder). Todos ≤ 200 (plan D2).
- **O ATR já sai do `signalStep`.** Toda configuração tem `risk.atrPeriod`, e o sinal grava `risk:atr` (escalar) em
  `indicators`; o cruzamento para decimal é `decimalFromIndicator` (exportado pelo motor). O analista não reimplementa
  indicador nenhum: ATR, votos e aquecimento são do motor; volume relativo, momentum, percentis e custo são aritmética
  decimal sobre texto exato da vela.
- **Sentimento**: o especialista lê o Fear & Greed como o passo lê (`sentiment-picker.ts` do `run-recording`:
  `selectAvailableSentiment` com `insertionCutoff = closeTime` e a fonte da execução); sem leitura fresca (> 48 h) o motor
  vota 0 com `isMissing`.
- **Lacuna**: o motor só aceita vela não contígua com `confirmedGapCandles` exato; a série do analista é histórico e
  declara a contagem exata de cada buraco.
- **`halt` não tem dono no motor**: a carteira guarda só `isHalted` e qualquer `resume` o desfaz (`wallet/signal-policy.ts`).
  Em sombra isso não importa; no governar o dono do `halt` é resolvido fora do motor (A15).
- **`run_commands`** tem `reason varchar(16)`, `command_id varchar(64)` e único `(run_id, command_id)`. O plan D8 previa
  `analyst_time_exit` (17 caracteres, não cabe) e `commandId = analyst:<runId>:<candleTime>:<kind>` (até 72): ficam
  `analyst_timeout` (15) e `analyst:<candleTime>:<kind>` (até 35), único dentro da execução.
- **Os "padrões do editor" da spec D9 não existem** (o editor só deriva campos da configuração): Donchian 20, Bollinger
  20/2 e Fear & Greed 25/75 são fixados AQUI como o catálogo `analyst-1` (valores usuais, os mesmos dos fixtures da spec 009 e do contrato da avaliação de metas).
- **Última migration: `0023_run_stall`**; a próxima livre hoje é `0024` (conferir na hora da T2.1).
- **Custo medido** (WSL, `bun` 1.4.3): os 4 especialistas sobre 500 velas levam mediana 15,7 ms e p95 18,5 ms; sobre as
  ~3.081 velas da janela, ~100 ms por PAR por ronda. Daí a âncora diária da série (A3), que deixa o passo de cada ronda em
  4 `signalStep` por par.
- **Oráculo nos conjuntos reais** (tabela abaixo): **nenhum especialista provou valor** em `btcusdt-1h-500` nem em
  `ethusdt-1d-400` (todos `even`, `below` ou `too_few`; peso 0 em todos). Com os conjuntos reais, o analista viveria em "sem
  previsão" (CAUTELA, ¼) ou PAUSA. É a resposta honesta prevista no risco da spec §8; a T0.2 mede os pares reais em 15 min e
  para e pergunta se nenhum especialista provar valor em nenhum par.

| # | Decisão | Motivo |
|---|---|---|
| A1 | **Pacote `packages/risk-analyst`** (`@ativada/risk-analyst`), puro (sem relógio, aleatoriedade, locale, I/O nem `console`; teste de fronteira que varre o `src` como no motor). Depende só de `@ativada/strategy-engine` (`signalStep`, `createStrategySignalState`, `createStrategyVersion`, `selectAvailableSentiment`, `EngineDecimal`, `decimalFromIndicator`) e de `@ativada/statistics` (Wilson); **nenhuma dependência nova** (o decimal é o `EngineDecimal` do motor). Arquivos do plan D1, menos `wilson-interval.ts` (importado de `@ativada/statistics`). `ANALYST_VERSION = 'analyst-1'` e todos os números em `ANALYST_RULES` (`analyst.constant.ts`, tabela A9) | O mesmo código no worker (ao vivo) e no contrafactual (RNF03); o Wilson tem um lugar só (P10) |
| A2 | **Catálogo dos especialistas** (`SPECIALIST_CATALOG`, fechado; igual campo a campo a `test/fixtures/risk-analyst/specialist-catalog.fixture.ts`): **Tendência** (`trend`) = `ema-9-21` (EMA 9 × 21) + `macd-12-26-9` (MACD 12/26/9) + `donchian-20` (Donchian 20); **Reversão** (`reversion`) = `rsi-14` (RSI 14, 30/70) + `bollinger-20` (Bollinger 20, 2 desvios); **Volume** (`volume`) = `obv-ema-20` (OBV com EMA 20); **Sentimento** (`sentiment`) = `fear-greed-25-75` (Fear & Greed, medo ≤ 25, ganância ≥ 75). Cada um: `schemaVersion: 1`, `regime: none`, `thresholds: { buy: '1', sell: '-1' }`, `entry: market`, risco do Placar clássico (ATR 14, stop 2, alvo 3, `riskPerTrade` 0,01, exposição 1). **Voto** = sinal do placar do `signalStep` (`score > 0` → +1, `< 0` → −1, `0` → 0); `signal = null` (aquecimento) = **sem leitura**; o Sentimento com `isMissing` aparece como "sem leitura" na tela e conta como voto 0 | RF03 e D9: "todos os algoritmos da casa" pelas 7 regras, sem parâmetro otimizado; o limiar ±1 não muda o voto (o voto é o sinal do placar), só a ação, que o analista ignora |
| A3 | **Série do par por ronda, com âncora diária.** Para decidir a vela `t` (abertura, 15 min, `d = 900.000`): a série são as velas de 15 min do par com abertura em `[âncora, t]`, `âncora = ⌊(t − 3.080·d) ÷ 86.400.000⌋ × 86.400.000` (00:00 UTC; de 3.081 a 3.176 velas, ≤ 2.880 da janela + 200 de aquecimento + 95 da âncora). Cada especialista roda do `createStrategySignalState` na âncora, vela a vela, com `confirmedGapCandles` exato em cada buraco. A decisão em `t` é função só das velas `≤ t` e do sentimento disponível até o fechamento de `t`: cortar a série no meio dá a mesma decisão. **Uma leitura por par por ronda**, compartilhada pelas simulações do par (os votos não dependem da simulação). O worker PODE guardar em memória `(par, âncora) → estado e votos` e só avançar as velas novas: o resultado é IGUAL ao recálculo desde a âncora (prova obrigatória na T2.3: memo × do zero em toda vela); reinício ou âncora nova = recálculo. Não é estado da simulação (que continua só no checkpoint) | ~100 ms por par por ronda do zero (medido acima) não cabe nos 50 ms p95 (RNF06) com uma simulação só; a âncora fixa por dia deixa o avanço incremental idêntico ao recálculo (o EMA começa sempre no mesmo lugar no mesmo dia) |
| A4 | **Tendência da estratégia** (o quinto item do auditor, `key: 'strategy'`): o lado é o sinal de `signals.score` **da própria simulação** (a `projection-1` da spec 009) nas velas da janela; no contrafactual, o `signalStep` da execução em memória. Só existe desde o início da simulação (nas primeiras ~8 h é `too_few`). **Não vota nem pesa** na equipe: ela é quem pede a entrada; o analista só decide se deixa | Mesma regra de lado da 009; o oráculo com a janela inteira repete o dourado da `projection-1` nos dois conjuntos (provado) |
| A5 | **Contagem do auditor** (`accuracy-auditor.ts`, oráculo `test/fixtures/risk-analyst/auditor-oracle.fixture.ts`). Previsões = velas `p` da série com `t − (W + 1)·d < p ≤ t − d`, `W = 2.880` (as W mais novas cujo resultado já fechou até `t`; a vela `t` nunca conta, RNF02). Cada `p`: **sem leitura** (`null`), **sem lado** (voto 0), **lacuna** (a vela `p + d` não existe: resultado nunca chega), **empate** (fechamento igual), **acerto** (andou para o lado do voto) ou **erro**. `counted = hits + misses`; só elas entram no Wilson. `hitRate = hits ÷ counted` e `upRate` ("sempre sobe") `= subidas ÷ counted`, a **4 casas para baixo** (`null` com 0), como a 009 (P5). Horizonte de 1 vela (D13) | RF04 com as bordas fechadas; o oráculo conta em `bigint` sem importar o `src` |
| A6 | **Veredito e limites pelo Wilson único**: `judgeAgainstCoinFlip({ hits, counted })` de `@ativada/statistics` (`too_few` < `COIN_FLIP_MINIMUM_COUNTED` = 30, `above`, `below`, `even` pela desigualdade inteira; limites a 12 casas, o de baixo para baixo e o de cima para cima). `COIN_FLIP_MINIMUM_COUNTED` é importado, nunca redeclarado em `ANALYST_RULES` | Um só lugar do Wilson (P10). O oráculo (raiz inteira em `bigint`, escala 10⁴⁰) bate com `computeWilsonInterval` e `judgeAgainstCoinFlip` em TODA contagem `0 ≤ k ≤ n ≤ 120` no contrato e em `n ≤ 400` (80.600 pares) na medição |
| A7 | **Peso** = `lower − 0,5` (texto, 12 casas, subtração exata) só em `above`; `'0'` em `even`, `below` e `too_few` (D4-A). Situação na tela: `above` "provou valor", `even` "rebaixado: igual à moeda", `below` "rebaixado: errou mais que a moeda", `too_few` "em observação: menos de 30". D4-B (meio peso em observação) NÃO é implementado; se escolhido, vira `analyst-2` | RF05; o limite inferior já desconta a incerteza da amostra |
| A8 | **Leituras** (`market-readings.ts`, todas da vela `t` e de velas `< t`, decimal exato, divisão a 12 casas para BAIXO): `relativeVolume = volume(t) × 96 ÷ Σ volume(t − 96·d … t − d)` (a vela `t` NÃO entra na média); `atrRate = ATR(t) ÷ close(t)` com `ATR(t) = decimalFromIndicator(risk:atr)` do especialista Tendência; `atrPercentile90/95` = percentil **nearest-rank** (posição `⌈p·N ÷ 100⌉`, base 1, em ordem crescente) dos `atrRate` das velas com leitura em `(t − 2.880·d, t]`; `momentumShort/Long = (close(t) − close(t − k·d)) ÷ close(t − k·d)` com k = 4 e 16 (só leitura exibida: não entra na regra); `roundTripCost = 2 × (feeRate + slippageRate)` dos `RunParameters` (exato); `moveToCost = atrRate ÷ roundTripCost` (exibido; a trava compara sem dividir, A10) | RF02 sem lookahead; o mutante "vela atual na média" morre aqui |
| A9 | **`ANALYST_RULES`** (`as const`, texto decimal onde for número não inteiro): `version: 'analyst-1'`, `baseTimeframe: '15m'`, `auditWindowCandles: 2880`, `seriesLeadInCandles: 200`, `seriesAnchorMilliseconds: 86400000`, `weightBase: '0.5'`, `volumeAverageCandles: 96`, `percentileWindowCandles: 2880`, `percentileMinimumSamples: 96`, `momentumShortCandles: 4`, `momentumLongCandles: 16`, `quietVolumeBelow: '0.4'`, `fourHourCadenceVolumeBelow: '0.7'`, `hourCadenceVolumeBelow: '1.5'`, `cadenceMinutes: { fast: 15, hour: 60, fourHours: 240 }`, `confidentMinimumVolume: '1'`, `confidentMaximumAtrPercentile: 90`, `tooVolatileAtrPercentile: 95`, `teamShare: { numerator: 2, denominator: 3 }` (lado vencedor e força firme), `dailyLossRate: '0.01'`, `lossWindowCandles: 96`, `lossStreakLimit: 3`, `lossStreakPauseCandles: 4`, `tradeCountLimit: 8`, `goalRoomTradeMultiple: '2'`, `minimumMoveToCost: '2'`, `maxTradeCandles: 4`, `riskScale: { pause: '0', caution: '0.25', normal: '0.5', confident: '1' }`, `decimalPlaces: 12`. O mínimo de 30 do auditor vem de `@ativada/statistics` (A6) | D10: cada número num lugar; o dourado e os mutantes (plan D11) prendem cada um |
| A10 | **Etapa 1 — dado** (`no_data`, nesta ordem de detalhe): `waiting_for_data` (a execução tem `waitingForData`), `late_candle` (o worker passa `isCatchingUp`: a vela `t` não é a última fechada do par; o relógio fica no worker, nunca no pacote), `missing_candles` (falta alguma vela em `[t − 96·d, t]`: sem a média de volume completa) e `warming_up` (menos de 96 `atrRate` na janela, ou o especialista Tendência sem leitura em `t`). Qualquer um → `pause`. **Etapa 2 — travas** (todas calculadas e mostradas; a PRIMEIRA ativa nesta ordem dá o motivo): (1) `daily_loss`: `referência − patrimônio(t) ≥ 0,01 × saldo inicial`, com `referência` = patrimônio do ponto de `t − 96·d` (ou o saldo inicial se a simulação começou depois) — realizado + não realizado em 24 h; (2) `loss_streak`: as 3 últimas posições fechadas tiveram `net_profit < 0` e `t − closed_candle_time(última) < 4·d` (pausa das decisões `c … c + 3·d`: as entradas de `c + d` a `c + 4·d` ficam barradas, 1 h); (3) `trade_count`: posições com `opened_candle_time` em `(t − 96·d, t]` ≥ 8; (4) `goal_room` (só com meta; sem meta "não se aplica"): `patrimônio(t) − floorAmount < 2 × riskPerTrade × patrimônio(t)`, com `floorAmount = ceil8(inicial × (1 − maxLossRate))` de `computeGoalLevels` (o mesmo da spec 008 L8); (5) `move_cost`: `atrRate < 2 × roundTripCost` | RF07 e D7-A; nenhuma trava olha o futuro, e nenhuma bloqueia saída (o analista nunca emite comando que barre saída) |
| A11 | **Etapa 3 — ritmo** pelo `relativeVolume`: `< 0,4` → `pause` (`quiet_market`; soma de volume zero também); `< 0,7` → 240 min; `< 1,5` → 60 min; senão 15 min. **Janela de entrada**: `(t + d) mod (ritmo × 60.000) = 0` (a vela FECHA na hora cheia ou no múltiplo de 4 h, UTC). **Desvio do RF08 e do plan D4**: a postura é recalculada em TODA vela (não só na janela) e a regra NÃO recebe `lastPosture`; fora da janela a porta de entrada fica fechada com a postura do momento. A decisão é função só do mercado `≤ t`, da carteira em `t` e da meta | Fora da janela nada entra, então recalcular nunca acrescenta risco; sem depender da decisão anterior o corte da série é trivial (RNF02) e a decisão continua recalculável sob D3-B (sem tabela) |
| A12 | **Etapa 4 — equipe** (`team-forecast.ts`). `W` = soma dos pesos (A7) dos quatro especialistas; `a favor` = soma dos pesos com voto +1; `contra` = com −1. "Sem previsão", nesta precedência: `no_data` (etapa 1), `too_volatile` (`atrRate > percentil 95`), `no_proven_specialist` (`W = 0`), `proven_neutral` (`a favor = contra = 0`), `split_team` (os dois > 0 e `3 × max(a favor, contra) < 2 × (a favor + contra)`). Senão: lado `up` (a favor vence) ou `down` (contra vence) e força `firm` com `3 × vencedor ≥ 2 × W` (W inclui os neutros que provaram), senão `weak`. Comparações em decimal exato, sem dividir | RF06 com as bordas fechadas; "dividir" é entre quem votou e "força" é sobre todo o peso aprovado |
| A13 | **Etapa 5 — postura e tamanho** (`posture-policy.ts`): `down` → `pause` (`team_against`); sem previsão → `caution` ¼ (`no_forecast`, com o motivo da A12); `up` + `weak` → `normal` ½ (`weak_forecast`); `up` + `firm` + `relativeVolume ≥ 1` + `atrRate ≤ percentil 90` → `confident` 1 (`firm_forecast`); `up` + `firm` sem as duas → `normal` ½ (`firm_forecast_capped`, com o que faltou). Etapas 1 a 3 → `pause`. `riskScale` = `ANALYST_RULES.riskScale[postura]`, **nunca acima de 1** | RF08 e RNF01 |
| A14 | **Etapa 6 — saída por tempo**: posição aberta com `opened_candle_time ≤ t − 3·d` (4 velas de 15 min, 60 min) → `timeExitDue`; a saída executa na abertura de `t + d` (a 5ª vela). Avaliada em toda vela, inclusive em pausa; stop e alvo da estratégia continuam valendo dentro da vela. `maxTradeMinutes = 60` | RF08; a saída nunca é barrada |
| A15 | **Etapa 7 — porta e comandos.** A regra devolve `entryGate: 'open' \| 'closed'` (`closed` com `pause` ou fora da janela de ritmo), `timeExitDue` e `riskScale`; **nunca** um comando de entrada. A tradução para `EngineCommand` é uma função pura à parte, `toAnalystCommands({ decision, wallet: { isHalted, lastHaltReason, hasPosition }, closeTime })`: porta fechada e `!isHalted` → `halt`; porta aberta, `isHalted` e `lastHaltReason` do analista → `resume` (um `halt` de meta, usuário ou kill switch NUNCA é desfeito pelo analista); `timeExitDue` com posição → `exit_position`; com D2-A, `scale_risk` quando o tamanho muda. `commandId = analyst:<candleTime>:<kind>`, `issuedAt = closeTime` de `t`. **Sombra**: `wouldCommands` = a mesma tradução contra a carteira REAL (que o analista nunca parou), então "daria `halt`" aparece em cada vela de porta fechada e "daria `resume`" nunca | RNF01; a tradução existe desde a Fase 1 para a sombra mostrar o que faria, mas só vai ao `advanceCandle` no governar (Fase 4) |
| A16 | **`AnalystDecision`** (saída da regra, o que se grava e se mostra): `{ version, candleTime, posture, reason, reasonDetail, cadenceMinutes, isOnCadence, entryGate, riskScale, maxTradeMinutes, timeExitDue, forecast: { side: 'up' \| 'down' \| null, strength: 'weak' \| 'firm' \| null, noForecastReason \| null, forWeight, againstWeight, provenWeight }, readings: { relativeVolume, atrRate, atrPercentile90, atrPercentile95, momentumShort, momentumLong, roundTripCost, moveToCost }, specialists: [{ key, vote, isUnread, predictions, counted, hits, misses, ties, upMoves, hitRate, upRate, verdict, lower, upper, weight }]` (os quatro e `strategy`, nesta ordem), `locks: [{ key, current, limit, isActive, isApplicable }]` (as cinco, na ordem da A10), `wouldCommands` / `commands: [{ commandId, kind, reason }]` }. Decimais em texto canônico, instantes em ms UTC, nada de dado pessoal (só números da simulação e ids) | RF11; uma forma só para a tabela, a rota e o contrafactual |
| A17 | **Catálogo fechado de frases** (`analyst-messages.ts`, pt-BR, sem data nem hora (spec 008 L9), números com vírgula e 2 casas, arredondados na direção do campo: perda e custo para CIMA, folga, acerto e volume para BAIXO). Texto literal na tabela "Frases do analista" abaixo. Nenhuma frase diz "vai subir", "garantido", "recomendamos", "compre" ou "venda"; toda postura termina com o aviso fixo | RNF11; contrato de texto literal por chave (T1.3) e um contrato que varre o catálogo atrás das palavras proibidas |
| A18 | **Passo ao vivo** (plan D5). No `live-step`, ANTES do `advanceCandle` da vela `t` de uma simulação com `runs.request.analyst`: a série do par (A3, uma por ronda), os pontos de patrimônio de `t − 96·d` e `t`, as posições fechadas das últimas 24 h mais as 3 últimas e a aberta, a meta (`runs.request.goal`) e `waitingForData`; calcula `AnalystDecision` e grava a linha (A19) **na mesma transação** do passo, com `pg_notify('run_events', { runId, kind: 'analyst', eventId })` (kind novo em `RUN_EVENT_KIND`; a API o entrega como o aviso `runs` que já existe). Retomada: `(run_id, candle_time)` único, a vela já decidida é lida e não recalculada. **Sombra**: nada vai ao `advanceCandle`; falha do analista grava `status: failed` com `failure_code` (`ANALYST_SERIES_UNAVAILABLE`, `ANALYST_INPUT_INVALID`, `ANALYST_ENGINE_REFUSED` + o `EngineInputError.code`) e o passo SEGUE; a falha nunca derruba a simulação nem o passo de outra simulação (`allSettled` por simulação, §15). **Governar** (Fase 4): comandos no `advanceCandle({ commands })`; falha → porta fechada com motivo `analyst_failed` (falha segura: só `halt`, nunca `resume` nem `scale_risk`) e o passo segue. Sem D3-A autorizada a sombra NÃO grava: a T2.1 para e pergunta e, com D3-B, a T2.3 só calcula para o aviso e a rota recalcula pelo pacote puro (A3 permite: tudo vem de velas, sentimento, `equity_points` e `positions`) | RF10, RNF01, RNF02 |
| A19 | **`analyst_decisions` — migration `0024` autorizada (D3-A) e pronta (T2.1, 2026-10-15); o repositório ficou em `analyst-decision.repository.ts`.** `0024_analyst_decisions.sql` (+ `.rollback.sql` com `DROP TABLE`; conferir o número na hora): `id uuid PK`, `user_id uuid NOT NULL`, `run_id uuid NOT NULL` com FK composta `(run_id, user_id) → runs (id, user_id) ON DELETE RESTRICT`, `candle_time bigint NOT NULL`, `version varchar(16) NOT NULL CHECK (version in ('analyst-1'))`, `mode varchar(8) NOT NULL CHECK (in ('shadow','govern'))`, `status varchar(8) NOT NULL CHECK (in ('decided','failed'))`, `posture varchar(16) NULL CHECK (in ('pause','caution','normal','confident'))`, `reason varchar(32) NULL`, `cadence_minutes smallint NULL CHECK (in (15, 60, 240))`, `entry_gate varchar(8) NULL CHECK (in ('open','closed'))`, `risk_scale numeric NULL CHECK (risk_scale in (0, 0.25, 0.5, 1))`, `time_exit_due boolean NULL`, `forecast jsonb`, `readings jsonb`, `specialists jsonb`, `locks jsonb`, `commands jsonb` (os dados no governar ou os que daria na sombra; A16), `message text NULL`, `failure_code varchar(64) NULL`, `created_at timestamptz NOT NULL DEFAULT now()`; `CHECK` de coerência (`decided` ⇒ postura, ritmo, porta e tamanho NOT NULL; `failed` ⇒ `failure_code` NOT NULL); sem ENUM nativo. Único `(run_id, candle_time)`; índice `(user_id, run_id, candle_time DESC)`. Repositório `packages/database/src/analyst/analyst-decisions.ts` com `OwnerScope` no tipo; entra no `ownership-registry`, na exportação NDJSON (sem nada além das colunas) e na purga LGPD **antes** de `runs`. `jsonb` só objeto/lista (`sql.param(valor)::jsonb`) | RF11, RNF05, RNF08; mesmo padrão das tabelas da 0008 |
| A20 | **Rotas** (plan D7, `apps/api-ativada/src/runs/analyst/`). **`GET /v1/runs/:runId/analyst`** (sem query; parâmetro = `400`) → `200 { data: { version, mode, current, goalProgress, locks } }`: `current` = `AnalystDecisionView` da linha mais nova ou `{ status: 'unavailable', reason, message }` nesta precedência: `not_running` (status ≠ `running`), `stalled`, `waiting_for_data`, `no_candle` (nenhuma decisão e `last_candle_time` nulo), `warming_up` (nenhuma decisão ainda), `failed` (a última linha falhou: a frase de falha da A17, sem o texto do erro); `goalProgress` = `{ targetRate, summedRate, remainingRate, trades, message }` com `summedRate` = o `resultRate` do saldo e `remainingRate` = o `remainingRate` da meta da spec 008 (L6, L8: nenhum cálculo novo), `trades` = posições fechadas, `null` sem meta; `locks` = as cinco da A10 da última decisão. **`GET /v1/runs/:runId/analyst/decisions?cursor=&limit=`** → `{ data: AnalystDecisionView[], pagination: { nextCursor, perPage } }`, `limit` 1 a 100 (padrão 24), cursor `encodeTimeCursor(candle_time)`, ordem decrescente, `LIMIT limit + 1`. `AnalystDecisionView = { candleTime, closedAt, status, posture, postureLabel, cadenceMinutes, isOnCadence, entryGate, riskScale, maxTradeMinutes, timeExitDue, forecast, specialists, readings, commands, isShadow, message, reasonMessage, lockMessages, disclaimer }` (`closedAt = candleTime + d`). Erros: `404 RUN_NOT_FOUND` (alheia, inexistente, apagada, malformada, o MESMO); `409 RUN_NOT_LIVE` (outro tipo); `409 ANALYST_NOT_ENABLED` (`live_paper` sem `runs.request.analyst`, código novo em `RUN_ERROR_CODE`); `400` com todos os erros, sem eco. Política `RUN_LIVE_STATUS` (o balde de 60/min de L18, agora com cinco rotas). `access: USER`, `documentation`, Zod de entrada e saída. Consultas: execução (PK + `user_id`), a página de `analyst_decisions` e, no `/analyst`, o último ponto e a meta (as leituras da spec 008): ≤ 4, `Promise.all` só depois da execução. Sem cache; chaves do painel `['runs', runId, 'analyst']` e `['runs', runId, 'analyst-decisions']` | RF13, RNF08; mesmo padrão de L13, L17 e P7 |
| A21 | **Governar: a mudança no motor — SÓ DESENHO, pendente de autorização (D1, D2-A; T4.1).** `COMMAND_REASON` ganha `analyst_pause`, `analyst_resume` e `analyst_timeout`; com D2-A, `COMMAND_KIND` ganha `scale_risk` e `EngineCommand` o campo opcional `riskScale` (texto ∈ {`0.25`, `0.5`, `1`}; `0` não existe: pausa é `halt`). O `WalletState` ganha `riskScale` (padrão `'1'`, no estado canônico) e `entry-order.ts` usa `cash × riskPerTrade × riskScale`; o hash da configuração NÃO muda (o tamanho é do comando, não da estratégia). Versão nova do motor (`ENGINE_VERSION`, `ENGINE_STATE_VERSION` pelo campo novo), dourado regravado, harness de 21 verificações, diferencial contra a referência, mutantes. O dono do `halt` fica FORA do motor: `lastHaltReason` vem de `run_commands` (o último `halt` aplicado da execução) e o worker só traduz `resume` quando ele é `analyst_pause` (A15). Migration aditiva `00NN_run_commands_analyst` (+ rollback): os dois `CHECK` recriados com os valores novos (`varchar(16)` comporta todos). Sem D2-A (D2-B): só os três motivos, sem `scale_risk` nem campo novo no estado | RNF04; deixar o dono do `halt` fora do motor evita um campo de estado a mais e cobre o único caso real (no ao vivo, `user_stop` e meta encerram a simulação) |
| A22 | **Fase 2 — SÓ DESENHO onde exige autorização** (spec D6): "Horário" e "Andando com o BTC" sem fonte nova (`analyst-2`, peso 0 até o auditor aprovar); `candles.trade_count integer NULL` e `candles.taker_buy_base_volume numeric(32,8) NULL` (migration aditiva + parser de `V` + gravação de `n` + backfill só do que falta; vela antiga `NULL` = voto neutro "sem leitura"); fotos do livro `order_book_snapshots` (migration + retenção a decidir); funding/OI, dominância e notícias só com fonte autorizada, por fonte, como placar numérico e nunca texto livre | Cada passo traz dado sem abrir dependência antes da hora |

**Frases do analista** (`analyst-messages.ts`, catálogo FECHADO; `{x}` = número pt-BR com 2 casas):

| Chave | Texto |
|---|---|
| Postura (rótulo) | `pause` "PAUSA" · `caution` "CAUTELA" · `normal` "MODERADA" · `confident` "LIBERADA" (o analista não corta o tamanho; nunca "confiante", que soa como promessa) |
| Postura (linha) | "Postura agora: {rótulo} · olha o mercado a cada {15 min \| 1 hora \| 4 horas} · arrisca {¼ \| ½ \| o mesmo} do que a estratégia arriscaria ({x}% do saldo por operação) · cada operação dura no máximo 60 min." · pausa: "Postura agora: PAUSA · nenhuma entrada nova; as saídas da estratégia continuam valendo." |
| Fora da janela | "Fora da janela de entrada: com o ritmo de 1 hora, só a vela que fecha na hora cheia pode abrir operação." · "… com o ritmo de 4 horas, só a vela que fecha num múltiplo de 4 horas (UTC) pode abrir operação." |
| `no_data` | `waiting_for_data` "Faltam velas recentes: o analista espera os dados chegarem." · `late_candle` "A simulação está atrasada em relação ao mercado: o analista não libera entrada até ela alcançar." · `missing_candles` "Falta vela nas últimas 24 horas: sem a média de volume completa, o analista não libera entrada." · `warming_up` "O analista ainda está juntando histórico do par (pelo menos 24 horas de velas de 15 min)." |
| Travas | `daily_loss` "A perda das últimas 24 horas chegou a {x}% do saldo inicial (o limite é 1%): pausa até a janela de 24 horas liberar." · `loss_streak` "{n} operações seguidas terminaram em perda: pausa de 1 hora depois da última." · `trade_count` "Já foram {n} operações nas últimas 24 horas (o teto é 8): pausa até a janela liberar." · `goal_room` "Falta pouco para a perda máxima da meta: cabem {x}% do saldo, menos que o risco de 2 operações." · `move_cost` "O movimento típico de 15 min ({x}%) não paga com folga a ida e volta das taxas ({x}%): precisa ser pelo menos o dobro." |
| Linhas das travas | "Perda das últimas 24 h: {x}% de 1% permitido" · "Perdas seguidas: {n} de 3" · "Operações nas últimas 24 h: {n} de 8" · "Folga até a perda máxima da meta: {x}% (mínimo: {x}%)" / "Folga até a perda máxima: sem meta, não se aplica" · "Movimento ÷ custo: {x} (mínimo: 2)" |
| Ritmo | `quiet_market` "Mercado parado: o volume está em {x}× o normal das últimas 24 horas (abaixo de 0,4×)." · linha "Volume {x}× o normal das últimas 24 horas: olha o mercado a cada {ritmo}." |
| Equipe | `team_against` "Os especialistas que provaram acertar apontam para baixo: o analista não deixa abrir operação contra eles." · `too_volatile` "Mercado agitado demais para ler: a oscilação ({x}%) está acima de 95% das velas dos últimos 30 dias. Sem previsão." · `no_proven_specialist` "Nenhum especialista acertou o lado mais vezes que uma moeda ao ar nos últimos 30 dias. Sem previsão." · `proven_neutral` "Os especialistas que provaram valor estão neutros nesta vela. Sem previsão." · `split_team` "Os especialistas que provaram valor se dividem: nenhum lado tem 2/3 do peso. Sem previsão." · `weak_forecast` "Tendência para cima, fraca: menos de 2/3 do peso aprovado a favor." · `firm_forecast` "Tendência para cima, firme, com volume normal ou acima e oscilação dentro do comum." · `firm_forecast_capped` "Tendência para cima, firme, mas {com volume abaixo do normal \| com oscilação acima de 90% das velas dos últimos 30 dias}: tamanho pela metade." |
| Especialista | voto "a favor" / "contra" / "neutro" / "sem leitura"; acerto "{x}% ({hits} de {counted})" ou "— ({counted} contadas)" abaixo de 30; situação da A7; peso "{x}" ou "0"; a linha da estratégia: "Tendência da estratégia" com peso "não vota" |
| Saída por tempo | "A operação aberta completou 60 min sem alvo nem stop: o analista manda sair na abertura da próxima vela." (sombra: "… o analista mandaria sair …") |
| Meta somada | "Meta: +{x}% no prazo. Somado até aqui: {±x}% em {n} operação(ões). Falta {x}%." · desfecho: as frases da spec 008 L8 · sem meta: "Sem meta: o resultado das operações soma no saldo." |
| Modo | sombra "Modo sombra: o analista só observa e mostra o que faria; a simulação segue a estratégia sem mudança." · governar "O analista está decidindo o ritmo e o tamanho desta simulação." |
| Falha | "O analista não conseguiu decidir nesta vela; a simulação seguiu sem ele." (código só no campo `failureCode`) |
| Indisponível | `not_running` "A simulação não está rodando: o analista não decide." · `stalled` "A simulação parou de avançar; o analista volta quando ela voltar." · `waiting_for_data` "A simulação espera velas que faltam; o analista volta quando elas chegarem." · `no_candle` "Aguardando a primeira vela de 15 min fechar." · `warming_up` "O analista ainda está juntando histórico do par." |
| Aviso fixo | "O analista é uma regra automática sobre dados passados; não é recomendação. Tendência, não promessa. Tudo simulado, com dinheiro fictício." |

**Oráculo e dourado (feitos na T0.1).** `test/fixtures/risk-analyst/auditor-oracle.fixture.ts` (só `bigint`, sem importar
`src` nem `decimal.js`) conta como A5 e decide como A6/A7; `specialist-catalog.fixture.ts` é o catálogo A2 escrito à mão;
`specialist-dataset.fixture.ts` roda o `signalStep` de produção de cada especialista e do Placar clássico nos dois conjuntos
reais (a vela deles como base, plan D11; Fear & Greed sintético e determinístico, um por dia UTC, `(37·dia + 11) mod 101`,
porque os conjuntos não trazem sentimento); `test/risk-analyst-auditor-oracle.contract.test.ts` confere o dourado
`auditor-golden.fixture.ts`, a igualdade com a `projection-1` e o oráculo × `@ativada/statistics`. Decisão na última vela,
janela de 2.880 (o conjunto inteiro):

| Conjunto · item | Previsões | Sem leitura | Sem lado | Contadas | Acertos | Acerto | "Sempre sobe" | Wilson 95% | Veredito |
|---|---|---|---|---|---|---|---|---|---|
| BTCUSDT 1h × 500 · Tendência | 499 | 128 | 130 | 241 | 112 | 46,47% | 52,28% | 40,28% a 52,78% | `even` |
| BTCUSDT 1h × 500 · Reversão | 499 | 96 | 327 | 76 | 36 | 47,36% | 44,73% | 36,54% a 58,45% | `even` |
| BTCUSDT 1h × 500 · Volume | 499 | 96 | 0 | 403 | 202 | 50,12% | 52,10% | 45,26% a 54,99% | `even` |
| BTCUSDT 1h × 500 · Sentimento | 499 | 96 | 192 | 211 | 97 | 45,97% | 54,02% | 39,37% a 52,71% | `even` |
| BTCUSDT 1h × 500 · Placar clássico | 499 | 193 | 21 | 285 | 134 | 47,01% | 53,68% | 41,30% a 52,82% | `even` |
| ETHUSDT 1d × 400 · Tendência | 399 | 128 | 77 | 194 | 86 | 44,32% | 54,63% | 37,51% a 51,37% | `even` |
| ETHUSDT 1d × 400 · Reversão | 399 | 96 | 262 | 41 | 24 | 58,53% | 56,09% | 43,36% a 72,25% | `even` |
| ETHUSDT 1d × 400 · Volume | 399 | 96 | 0 | 303 | 134 | 44,22% | 51,15% | 38,73% a 49,86% | `below` |
| ETHUSDT 1d × 400 · Sentimento | 399 | 96 | 147 | 156 | 72 | 46,15% | 50,00% | 38,51% a 53,98% | `even` |
| ETHUSDT 1d × 400 · Placar clássico | 399 | 193 | 14 | 192 | 84 | 43,75% | 51,04% | 36,92% a 50,83% | `even` |

Nenhuma lacuna e nenhum empate nos dois conjuntos; peso 0 em todos (nenhum `above`). Com a janela de 96 o dourado também
traz `too_few` (Reversão: 11 e 16 contadas) e `below` (Volume e Placar clássico em ETH). A linha do Placar clássico com a
janela inteira repete a `projection-1` (285/134 e 192/84, `even`). Limites exibidos com 2 casas para fora (R5). O Sentimento
sintético não mede o Fear & Greed real: a T0.2 mede com as observações do banco.

**Contratos de teste esperados.**

- Puros (T1.1 a T1.3, `packages/risk-analyst`): `SPECIALIST_CATALOG` igual ao fixture; auditor = oráculo nos dois conjuntos
  (o dourado acima) e no recorte de 15 min da T0.2; leituras, travas, ritmo, equipe e postura com contas à mão por etapa
  (cada borda: volume 0,4/0,7/1,5 e 1, percentil 90/95 na posição exata, 2/3 do peso exato, perda de 1% exata, 3ª perda
  na 4ª vela, 8ª entrada, folga igual a 2 operações, movimento = 2 × custo); frases literais de toda chave e a varredura de
  palavras proibidas; propriedades com 2.000 sorteios (`riskScale ≤ 1`; trava ativa ⇒ `pause`; `down` ⇒ `pause`; nenhum
  comando de entrada; `exit_position` nunca suprimido; `resume` só sobre `halt` do analista; corte da série no meio = mesma
  decisão; mesma entrada = mesma saída, byte a byte); âncora: memo incremental = recálculo desde a âncora em toda vela.
- Mutantes (T1.4, ≥ 20, `test/risk-analyst-mutants.contract.test.ts`): os do plan D11 mais `analyst_timeout` na 4ª vela,
  `resume` sem conferir o dono do `halt`, porta aberta fora da janela de ritmo, `W` sem os neutros na força, âncora que
  desliza com `t`, `percentil 95` trocado por 90 na volatilidade.
- Banco, worker, rotas e painel: como no plan D11, com os casos de A18 a A20 (único por vela, `failed` não para o passo,
  `409 ANALYST_NOT_ENABLED`, `failed` como motivo de `current`, ≤ 4 consultas).

**Pendências que pedem resposta do usuário** (nada disso é feito sem ela): (a) D3 — migration `analyst_decisions` (A19) ou
recalcular sob demanda (D3-B); (b) D1/D2 — governar e o comando de tamanho no motor (A21), só depois do contrafactual; (c)
colunas em `candles`, livro de ofertas e fontes externas (A22); (d) o desvio da A11 (postura recalculada em toda vela, sem
`lastPosture`) — se preferir a postura presa entre as janelas de ritmo, é `analyst-2`; (e) os rótulos "MODERADA" e
"LIBERADA" no lugar de "NORMAL" e "CONFIANTE".

**T2.3 — como a sombra entrou no worker (registro de desvios da A18; o contrato da regra não mudou).**

- **Ordem no passo.** A decisão da vela `t` sai DEPOIS do passo puro do motor de `t` (o patrimônio e as posições "em `t`" só existem
  nele) e ANTES da gravação, como o passo da meta: `settleCandle` → `decideShadowStep` → `commitStep`. Em sombra nada volta ao
  motor; no governar (Fase 4) os comandos refazem o MESMO candle com `commands`, como a saída por meta.
- **Uma leitura por par por ronda.** `createAnalystSeriesCache` (um por avaliador) guarda por `(par, fonte do sentimento, âncora)`
  o estado dos quatro `signalStep` e os votos, e só avança as velas novas (`advanceVote`, o mesmo passo da série inteira): o
  resultado é IGUAL ao recálculo desde a âncora em toda vela (prova em `test/live-analyst-series.contract.test.ts`). Ele
  estende até a última vela da ronda numa leitura só; âncora nova (todo dia) ou reinício recomeça do zero. Um buraco que o
  banco preencher depois de a cópia já tê-lo atravessado só é visto no recálculo (reinício); a linha já gravada não muda.
- **`isCatchingUp`** = a vela decidida é mais velha que a última vela da ronda (o relógio fica no worker e a regra não o lê); a
  ronda que ainda alcança o mercado decide `no_data` ("atrasada") e não libera entrada, como a A10 manda.
- **Dono do `halt`.** Em sombra o analista nunca fecha a porta da carteira: `lastHaltReason` é nulo, então `wouldCommands` mostra
  "daria `halt`" em toda vela de porta fechada e nunca "daria `resume`" (A15). O contrafactual governa uma carteira em memória e
  informa o dono do `halt` pelo mesmo gancho (`haltReason`).
- **Falha.** Qualquer erro do analista vira a linha `failed` com SÓ o código (`ANALYST_SERIES_UNAVAILABLE`, `ANALYST_INPUT_INVALID`
  ou `ANALYST_ENGINE_REFUSED:<código do motor>`): nem a linha nem o log levam o texto do erro. O pedido só vale para `analyst-1`,
  `shadow` e vela de 15 min; qualquer outro deixa a simulação sem analista.
- **Desempenho (RNF06).** Para o passo caber em 50 ms o pacote puro ganhou três atalhos que não mudam nenhum número da regra:
  comparação de preço por dígitos (`compareDecimalTexts`), ordenação dos percentis por inteiro exato (`sortDecimalTexts`) e o
  `atrRate` de cada leitura memorizado pelo próprio objeto (`WeakMap`). Cada um tem paridade com o decimal em sorteios
  (`test/risk-analyst-decimal-texts.contract.test.ts`) e o dourado e os 52 mutantes seguem iguais.
