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
| `signal` | `null` no aquecimento; depois, um por candle: `action`, `score`, `regime`, `votes[]` (`ruleId`, `family`, `vote`, `weight`, `isMissing`), `indicators` (ids com espaço de nome, achatados), `sentiment` (a observação usada, nula se ausente/velha), `reason` | `signals` (único por `run_id, candle_time`) |
| `commands[]` | comandos do passo: `commandId`, `kind`, `reason`, `issuedAt` e `status` (`applied`, ou `ignored_duplicate` quando o `commandId` já foi processado) | `run_commands` (T3.1) |
| `orders[]` | eventos do ciclo de vida: `created`, `filled`, `cancelled`, `expired`, `rejected` (com `reason`), por `orderKey`; `price`/`quantity` só no `filled`; `triggerPrice` (stop/alvo) só nas saídas protetoras; `riskAmount`, `stopDistance`, `targetDistance`, `limitPrice`, `eligibleCandles` na entrada | `orders` (status monotônico) |
| `fills[]` | `orderKey`, `positionKey`, lado, `price`, `quantity`, `notional`, `fee` | `fills` |
| `openedPositions[]` / `closedPositions[]` | abertura (preço, quantidade, stop, alvo, taxa) e fechamento (preço de saída, taxas, `netProfit`, `exitReason`) | `positions` |
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
bun run scripts/export-metrics-input.ts "BTCUSDT 1h × 500" > tmp/metrics-btc.json
python3 -I test/fixtures/strategy-engine/oracle/metrics_reference.py tmp/metrics-btc.json \
  test/fixtures/strategy-engine/golden/classic-scoreboard-metrics.metrics-1.engine-2.json "BTCUSDT 1h × 500"
```

O script imprime cada métrica do Python ao lado da do dourado e sai com código 1 se alguma diferir mais que 1e-9. Não
roda na CI (Python não é dependência do repositório); o resultado conferido fica registrado nos números do dourado e na
seção "Prova" abaixo.

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
| Saída sem teto de participação no volume; EMA/RSI do mesmo candle variam ~0,1% com a janela do backtest (ε = 1e-3) | Riscos aceitos na T2.6 (seção "Revisão da Fase 2") |
| Semântica de `executionReports` sem implementação | Tipos fixados; a spec 002 implementa e acrescenta cenários ao harness |
| Formato exato do texto de motivo | Fixado em §f; a T2.3 implementa e prende por tabela |
