# ADR 0002 — Contrato do motor de estratégias

**Status:** proposto (T2.1; aguardando revisão do `architect`) · **Data:** 2026-10-09

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
  uma posição por par), RF06 (corretora simulada), RF07 (determinismo), RF09 (retomar sem duplicar).

O pacote `packages/strategy-engine` estava vazio (só `WORKSPACE_NAME`). Este ADR fecha o contrato e a
T2.1 entrega os tipos, o schema, o estado, as interfaces, uma implementação de **referência** e o
**harness** que todas as implementações seguintes precisam passar.

## Decisão

### a) Pureza, estado e o laço único

O motor é uma função pura:

```ts
type Engine = {
  engineVersion: string;
  createInitialState(strategy: StrategyVersion): EngineState;
  step(input: StepInput): StepResult; // sem I/O, sem relógio, sem aleatoriedade
};
type StepInput = {
  strategy: StrategyVersion;            // { config, configHash } — configuração já validada (§d)
  state: EngineState;                   // estado depois do candle anterior
  candle: EngineCandle;                 // candle FECHADO t (§g)
  sentiment?: SentimentObservation;     // Fear & Greed publicado até o fechamento de t (§e)
  commands?: readonly EngineCommand[];  // meta, parada do usuário, kill switch (§h)
};
type StepResult = { state: EngineState; decisions: StepDecisions };
```

**Pureza.** `step` não lê relógio (`Date.now`, `new Date`, `performance.now`), não sorteia
(`Math.random`), não faz rede, disco, log nem console, e não muta a entrada (o harness congela a entrada
com `Object.freeze` profundo e qualquer escrita falha). O código-fonte do pacote é varrido por teste
(`test/strategy-engine-boundary.contract.test.ts`) atrás dessas chamadas. Os únicos imports permitidos
são arquivos relativos, `@cryptoada/environment` (o `z` do Zod), `decimal.js` e `node:crypto` (o hash,
§d). O tempo de tudo vem do `candle`.

**Estado (`EngineState`, versão 1).** Imutável, só tipos JSON, com versão:

| Campo | Significado |
|---|---|
| `version` | `1`. Outra versão ⇒ `EngineStateError(unsupported_version)`; a execução é **replicada desde o início**, nunca "convertida" |
| `engineVersion` | versão da semântica do motor que gravou o estado. Motor diferente ⇒ `engine_mismatch` ⇒ replicar |
| `configHash` | hash da versão da estratégia (§d). `step` recusa estado de outra versão |
| `leadInCandles` | candles de pré-aquecimento (§b), fixados na criação |
| `processedCandles`, `lastCandleOpenTime` | contador e abertura do último candle processado (`null` ⇔ zero) |
| `sequence` | contador das chaves determinísticas (`order-N`, `position-N`) |
| `isHalted` | `true` depois de um comando `halt` (§h): não abre mais entrada |
| `cash` | saldo em USDT (texto decimal) |
| `position` | a posição aberta (no máximo uma, §c) com `entryPrice`, `quantity`, `stopPrice`, `targetPrice`, `entryFee` |
| `pendingOrder` | a ordem pendente (no máximo uma): entrada só com carteira zerada, saída só com posição aberta |
| `benchmark` | "comprar e segurar" (quantidade e sobra de caixa), comprado na primeira abertura depois do pré-aquecimento |
| `indicators` | snapshot JSON de cada indicador, por id (§b) |

O schema Zod do estado é estrito (`.strict()` em todo nível) e cobra os invariantes de posição única
(entrada pendente com posição aberta é inválido; saída pendente sem posição é inválido).
`serializeEngineState` valida e escreve **JSON canônico** (chaves ordenadas, sem espaço): o mesmo estado
dá os mesmos bytes. Número não finito, `undefined`, `Map`, `Set`, instância de classe (inclusive um
`Decimal`) recusam a serialização. `deserializeEngineState` confere a versão, valida e devolve o estado;
falha com código (`invalid_json`, `unsupported_version`, `invalid_state`).

**O que entra em `decisions` (`StepDecisions`).** Tudo tem `candleOpenTime` igual ao do candle
corrente — nenhuma decisão é carimbada no passado:

| Campo | Conteúdo | Tabela (plan §3) |
|---|---|---|
| `signal` | `null` no aquecimento; depois, um por candle: `action` (`BUY`/`SELL`/`HOLD`), `score`, `regime`, `votes[]` (`ruleId`, `family`, `vote`, `weight`, `isMissing`), `indicators` (valores), `reason` | `signals` (único por `run_id, candle_time`) |
| `orders[]` | eventos do ciclo de vida: `created`, `filled`, `cancelled`, `expired`, `rejected` (com `reason`), por `orderKey` | `orders` (upsert por chave, status atualizado) |
| `fills[]` | `orderKey`, `positionKey`, lado, `price`, `quantity`, `notional`, `fee` | `fills` |
| `openedPositions[]` / `closedPositions[]` | abertura (preço, quantidade, stop, alvo, taxa) e fechamento (preço de saída, taxas, `netProfit`, `exitReason`) | `positions` (insert na abertura, update no fechamento) |
| `equityPoint` | `equity` e `benchmark` a valor de liquidação no fechamento (§c) | `equity_points` |

**Como o chamador persiste.** Uma transação por passo: grava as decisões com chave natural e
`ON CONFLICT DO NOTHING` (sinal por `run_id + candle_time`; ordem e posição por `run_id + engine_key`)
**e** atualiza `runs.engine_state` (o JSON canônico) e `runs.last_candle_time`. Se o processo cair antes
do `COMMIT`, nada foi gravado e o passo é refeito com a mesma entrada, dando a mesma saída. Se cair
depois, o estado gravado já inclui o candle e `step` recusa o candle repetido
(`EngineInputError`). É isso que torna a retomada de RF09 livre de operação duplicada.

**O laço é o mesmo.** O backtest chama `step` para cada candle lido do banco; o ao vivo chama `step`
para cada candle fechado que chega. Não existe `runBacktest` com outra lógica: o use case do backtest
é um `for` sobre `step` (Fase 3) e o do ao vivo é um `step` por mensagem (Fase 4).

**Guarda de entrada (`assertStepInput`, já implementada).** Recusa em voz alta: estado de outro motor ou
de outra versão da estratégia; candle de outro par ou timeframe; candle fora da grade
(`openTime % duração ≠ 0` ou `closeTime ≠ openTime + duração − 1`); candle com `openTime ≤
lastCandleOpenTime` (repetido ou fora de ordem); sentimento com `observedAt > candle.closeTime`. Lacuna
para a frente (candle que a Binance não tem) é aceita: indicadores contam candles, não horas.

### b) Indicadores

```ts
type Indicator<TValue extends number | Record<string, number>> = {
  warmupCandles: number;
  update(candle: IndicatorCandle): TValue | undefined;
  snapshot(): JsonValue;
};
type IndicatorDefinition<TParams, TValue> = {
  name: string;
  create(params: TParams): Indicator<TValue>;
  restore({ params, snapshot }): Indicator<TValue>;
};
```

- **Aquecimento explícito.** `update` devolve `undefined` exatamente nas `warmupCandles − 1` primeiras
  chamadas e um valor finito a partir da `warmupCandles`-ésima. Indicador nunca devolve `NaN` nem
  `Infinity` (RSI sem perdas é 100, desvio-padrão zero é zero — a T2.2 documenta cada borda).
- **Sem repintura.** O valor devolvido no candle `t` é final; nenhum `update` posterior o altera. A
  interface não oferece "recalcular a série".
- **Lote = incremental.** Não existe implementação vetorizada paralela: `computeIndicatorSeries` é um
  laço sobre `update` (já implementado). Mesmo histórico ⇒ mesmos valores, no backtest e no ao vivo.
- **Precisão.** `number` só dentro do cálculo do indicador e na comparação do voto. `IndicatorCandle`
  recebe `Number(candle.close)` etc. (`toIndicatorCandle`). Para reprodução byte a byte entre runtimes,
  indicador usa só `+ − × ÷` e `Math.sqrt` (exatos pelo IEEE 754); `Math.exp`/`log`/`pow` têm precisão
  dependente de implementação e ficam fora. Um valor de indicador só cruza para dinheiro por
  `decimalFromIndicator` (15 algarismos significativos via `toPrecision`, exato pela especificação do
  ECMAScript; não finito lança erro) — é o caso do ATR que vira distância de stop.
- **Retomada = snapshot.** O estado de cada indicador vai em `EngineState.indicators[id]` como JSON (o
  `JSON.stringify` de um `number` finito é reversível sem perda). `restore(snapshot)` seguido de N
  updates é idêntico a N updates no original. Dentro de `step` o indicador é restaurado, atualizado e
  fotografado; o objeto mutável nunca escapa do passo. (Cache de instâncias por identidade de estado é
  otimização permitida, desde que o harness continue verde.)
- **Reaquecer com N candles NÃO é retomada.** Média exponencial tem memória infinita: reaquecer com os
  últimos N candles dá valores diferentes da execução contínua, o que violaria §f. Por isso a migração
  (estado ilegível, versão de estado ou de motor diferente) **replica a execução desde o primeiro candle
  dela** (candles fechados são imutáveis no banco, e as decisões têm chave natural: a réplica não
  duplica nada).
- **Pré-aquecimento (`leadInCandles`).** `computeLeadInCandles(maior warmup) = 3 × maior warmup` (mínimo
  3), gravado no estado na criação. O chamador entrega exatamente `leadInCandles` candles anteriores ao
  início do período (por contagem, não por data) e o motor não decide nada até processá-los. Backtest de
  `[S, E)` e simulação ao vivo iniciada em `S` carregam os mesmos candles anteriores a `S` e por isso dão
  os mesmos valores (teste de paridade, T4.2). O multiplicador 3 faz a média exponencial convergir (peso
  residual do primeiro candle abaixo de ~1% para `α = 2/(n+1)`); mudar o fator é nova `engineVersion`.

### c) Modelo de preenchimento (D6)

Ordem dos acontecimentos dentro de um passo sobre o candle `k`:

1. **Abertura de `k`**: a ordem pendente decidida no fechamento de `k−1` executa (mercado na abertura;
   limitada se o candle cruzar). Entrada nunca preenche no candle em que foi decidida.
2. **Durante `k`**: stop e alvo da posição aberta (inclusive a que acabou de abrir) contra máxima e mínima.
3. **Abertura de `k`**, uma vez: "comprar e segurar" compra se o pré-aquecimento terminou no candle anterior.
4. **Fechamento de `k`**: indicadores atualizam com `k`; se o pré-aquecimento terminou, o placar decide
   (`signal`) e cria no máximo uma ordem para `k+1`; o ponto de patrimônio é calculado.

**Arredondamento — sempre contra o usuário.** Preço de compra para cima no tick; preço de venda para
baixo; preço limite de compra para baixo; stop para baixo (mais longe, perda maior); alvo para cima (mais
difícil); quantidade para baixo no passo; dinheiro com 8 casas (`numeric(24,8)`): débito para cima,
crédito para baixo; taxa para cima. `tickSize`, `quantityStep` e `minNotional` vêm da configuração (§d).

| Item | Regra |
|---|---|
| Compra a mercado | `tickUp(abertura(k) × (1 + slippage))` |
| Venda a mercado (sinal, comando) | `tickDown(abertura(k) × (1 − slippage))` |
| Limitada de compra | Limite `L = tickDown(fechamento(t) × (1 − offsetRate))`, válida por `expiryCandles = N` candles (`t+1 … t+N`). Se `abertura ≤ L`: preenche na abertura, a `min(L, tickUp(abertura × (1 + slippage)))`. Senão, se `mínima < L` (cruzar; tocar não basta, a fila é desconhecida): preenche a `L`, sem slippage. Senão, consome um candle de validade; ao zerar, evento `expired` naquele candle |
| Taxa | `ceil8(preço × quantidade × feeRate)`, nas duas pontas, em USDT |
| Caixa | compra debita `ceil8(valor) + taxa`; venda credita `floor8(valor) − taxa` |
| Tamanho | No fechamento de `t`: `distância_stop = ATR(t) × stopAtrMultiple`; `orçamento = floor8(min(saldo × riskPerTrade ÷ distância_stop × fechamento(t), saldo × maxExposureRate, saldo ÷ (1 + feeRate)))`. No preenchimento: `quantidade = stepDown(orçamento ÷ preço)`, reduzida passo a passo se o débito passar do caixa |
| Valor mínimo | `quantidade × preço < minNotional` ⇒ evento `rejected` (`below_min_notional`); ATR ausente ou ≤ 0 ⇒ `rejected` (`zero_atr`) sem ordem pendente; stop ≤ 0 ⇒ `rejected` (`invalid_stop`) |
| Stop e alvo | Calculados **no preenchimento**: `stop = tickDown(preço − distância_stop)`, `alvo = tickUp(preço + ATR(t) × targetAtrMultiple)`. O ATR é o de `t` (conhecido na decisão); o preço é o de `t+1` (conhecido no preenchimento). Nenhum dado do futuro |
| Gap abaixo do stop | Posição vinda de antes e `abertura ≤ stop`: sai **na abertura**, `tickDown(abertura × (1 − slippage))`, pior que o stop |
| Gap acima do alvo | `abertura > alvo`: sai **ao preço do alvo** (nunca melhor — conservador) |
| Stop intra-candle | `mínima ≤ stop` (no toque): sai a `tickDown(stop × (1 − slippage))` (stop vira ordem a mercado) |
| Alvo intra-candle | `máxima > alvo` (precisa passar): sai ao preço do alvo, sem slippage (ordem limitada) |
| Stop e alvo no mesmo candle | **Vale o stop** (constituição §3) |
| Candle de entrada | A posição aberta na abertura (mercado, ou limitada por gap) é avaliada contra stop e alvo no próprio candle — o candle inteiro é posterior à abertura. A limitada preenchida **no meio** do candle é avaliada só contra o stop: a máxima pode ter acontecido antes do preenchimento |
| Patrimônio | `caixa + valor de liquidação` da posição no fechamento (`floor8(q × tickDown(fechamento × (1 − slippage))) − taxa`); a régua "comprar e segurar" usa a mesma fórmula, comprada com todo o saldo na primeira abertura depois do pré-aquecimento |

**Posição e sinais.** Só posição comprada (à vista, sem venda a descoberto, sem alavancagem). No máximo
uma posição e uma ordem pendente por estratégia — e cada execução é de um par só, então "uma posição por
par por estratégia" (RF05) é invariante do estado. Exposição total entre execuções não existe na etapa
1: cada execução tem a própria carteira (o teto entre execuções é da spec 002).

| No fechamento de `t` | Sem posição, sem pendente | Entrada limitada pendente | Posição aberta |
|---|---|---|---|
| `BUY` | cria entrada (mercado ou limitada) | mantém a pendente (não substitui) | ignora (sinal gravado, nada mais) |
| `SELL` | nada (sem venda a descoberto) | **cancela** a pendente (`cancelled`, `opposite_signal`) | cria venda a mercado para `t+1` (`exitReason: signal`) |
| `HOLD` | nada | segue até preencher ou expirar | nada; stop e alvo seguem valendo |

Uma ordem a mercado nunca fica pendente além de um candle. Saída por stop ou alvo é registrada como
ordem (`type: stop | target`) criada e preenchida no mesmo candle, com o preenchimento — na spec 002 ela
corresponde à OCO enviada à corretora no preenchimento da entrada. Se a posição saiu por stop no candle
`k`, um `BUY` no fechamento de `k` pode criar nova entrada para `k+1` (nunca no mesmo candle).

### d) Configuração da estratégia (RF03)

`STRATEGY_CONFIG_SCHEMA` (Zod, `.strict()` em todo nível; todos os problemas devolvidos de uma vez em
`StrategyConfigError.issues`, com caminho e mensagem):

| Bloco | Campos | Defaults e limites |
|---|---|---|
| `schemaVersion` | `1` literal, obrigatório | outra versão é recusada |
| `market` | `symbol` (`^[A-Z0-9]{2,16}USDT$`, saldo em USDT — D7), `timeframe` (`15m`/`1h`/`4h`/`1d`) | obrigatórios |
| `rules[]` | 1 a 12 regras com `id` único (`^[a-z0-9][a-z0-9-]{0,39}$`) e `kind` (§e) | obrigatório |
| `regime` | `{ kind: 'none' }` ou `{ kind: 'adx', period, trendThreshold, weights: { trending, ranging } }` com peso por família | `none`; ADX 14, limiar 25, pesos do plan §4 |
| `thresholds` | `buy` em `(0, 100]`, `sell` em `[−100, 0)` | obrigatórios (nunca se sobrepõem) |
| `entry` | `{ orderType: 'market' }` ou `{ orderType: 'limit', offsetRate (0, 0.2], expiryCandles 1..100 }` | mercado |
| `risk` | `atrPeriod`, `stopAtrMultiple` (0, 20], `targetAtrMultiple` (0, 50], `riskPerTrade` (0, 0.1], `maxExposureRate` (0, 1] | 14, 2, 3, 1%, 100% |
| `execution` | `initialBalance` [10, 10¹²], `feeRate` [0, 1%], `slippageRate` [0, 5%], `tickSize`, `quantityStep`, `minNotional` | 10 000, 0,1%, 0,05%, 0,01, 0,00001, 5 (filtros do BTCUSDT) |

- **Tipos.** Todo valor não inteiro que entra em conta de dinheiro ou de pontuação (taxas, saldo,
  múltiplos, pesos, limiares) é **texto decimal** (`"0.001"`, sem expoente nem vírgula; até 18 dígitos
  inteiros e 12 decimais). Parâmetros de indicador (períodos, níveis de RSI, desvios do Bollinger) são
  `number`: eles alimentam float. O parse devolve o decimal canônico (`"0.0010"` vira `"0.001"`).
- **Versão e hash.** `hashStrategyConfig(config)` = SHA-256 hexadecimal do JSON canônico da configuração
  **reparseada** (defaults preenchidos, decimais canônicos, chaves ordenadas). Grafias equivalentes,
  ordem de chaves e defaults omitidos dão o mesmo hash; qualquer mudança de significado — inclusive a
  ordem das regras, que muda o texto do motivo — dá outro. `strategy_versions` ganha uma linha nova
  (`version + 1`) só quando o hash difere do da última versão daquela estratégia; salvar sem mudar é
  idempotente. Execuções (`runs`) apontam para a versão e o estado guarda o hash: resultado fica preso à
  versão que o produziu (RF03).
- **Evolução do schema.** `schemaVersion: 2` nascerá como outro membro aceito, com uma função pura
  `upgrade(v1) → v2`; versões antigas continuam parseáveis para sempre (as execuções antigas precisam
  ser reproduzíveis). Nova regra (`kind`) entra como nova versão do schema.
- **Teto do walk-forward.** `MAX_WALK_FORWARD_COMBINATIONS = 200` (RNF02). A grade não faz parte da
  versão da estratégia: é parâmetro da execução de walk-forward (T3.3), validada contra esse teto.
- **Exemplo.** O "Placar clássico" do plan §4 está em
  `test/fixtures/strategy-engine/classic-scoreboard.strategy.json` e é válido (teste); a T3.5 o copia
  para cada usuário a partir do mesmo JSON.

### e) Regime e placar

**Voto por regra** (`+1`/`0`/`−1`; comparações estritas em `number`, empate é `0`):

| `kind` | Família | `+1` | `−1` |
|---|---|---|---|
| `ema_cross` (`fastPeriod < slowPeriod`) | tendência | EMA rápida > lenta | EMA rápida < lenta |
| `macd` (`fast < slow`, `signal`) | tendência | MACD > linha de sinal | MACD < linha de sinal |
| `donchian_breakout` (`period`) | tendência | fechamento > máxima dos `period` candles **anteriores** (sem o atual) | fechamento < mínima dos anteriores |
| `rsi` (`oversold < overbought`) | reversão | RSI < `oversold` | RSI > `overbought` |
| `bollinger` (`period`, `deviations`) | reversão | fechamento < banda inferior | fechamento > banda superior |
| `obv_trend` (`emaPeriod`) | volume | OBV > EMA do OBV | OBV < EMA do OBV |
| `fear_greed` (`fearAtOrBelow < greedAtOrAbove`) | sentimento | índice ≤ `fearAtOrBelow` (contrário) | índice ≥ `greedAtOrAbove` |

A família é da regra (`RULE_FAMILY`), não da configuração. RF02 lista ainda SMA, z-score e VWAP: entram
como indicadores na T2.2 e como regra numa versão futura do schema.

**Regime.** `adx`: ADX(`period`) ≥ `trendThreshold` ⇒ `trending`; senão `ranging`. `none` ⇒ regime
`none` e peso `1` para toda família. O ADX entra no aquecimento como qualquer indicador.

**Pontuação.** `score = Σ voto × peso(família, regime)`, em decimal (pesos e limiares são texto decimal).
`score ≥ thresholds.buy` ⇒ `BUY`; `score ≤ thresholds.sell` ⇒ `SELL`; senão `HOLD`.

**Aquecimento e dado ausente.** Nenhum sinal (nem `HOLD`) antes de `leadInCandles` candles: `signal` é
`null` e não há ordem nem ponto de patrimônio. Depois do aquecimento, todo indicador tem valor por
contrato; valor ausente ou não finito de indicador de candle é **erro** (falha em voz alta, nunca voto
`0` silencioso). O único dado que pode faltar é o sentimento: sem observação, ou observação mais velha
que 48 h (`SENTIMENT_STALE_AFTER_MILLISECONDS`) ⇒ voto `0` com `isMissing: true`. Observação posterior ao
fechamento é recusada pela guarda (lookahead).

**Motivo (formato fixo, determinístico).** Segmentos separados por ` · `, regras na ordem da configuração,
rótulo gerado do `kind` e dos parâmetros, decimais no formato canônico com sinal explícito no score:

```
<Ação> · pontuação <score> · <regime> · compra: <regras +1> · venda: <regras −1> · neutras: <regras 0>[ · sem dado: <regras ausentes>]
```

- Ação: `Compra`, `Venda` ou `Neutro`. Regime: `tendência (ADX 31.2)`, `lateral (ADX 18.4)` ou `sem filtro
  de regime` (ADX com 1 casa, arredondado meio para cima). Lista vazia: `nenhuma`. Itens separados por `, `.
- Rótulos: `EMA 9×21`, `MACD 12/26/9`, `Donchian 20`, `RSI 14`, `Bollinger 20/2`, `OBV×EMA 20`,
  `Fear & Greed`.
- Exemplo (Placar clássico, tendência): `Compra · pontuação +4 · tendência (ADX 31.2) · compra: EMA 9×21,
  MACD 12/26/9, OBV×EMA 20 · venda: nenhuma · neutras: RSI 14`.

A T2.3 implementa o formato e o prende por tabela de cenários (entrada → votos, score e texto exatos).

### f) Não-lookahead e determinismo como contrato

"Provado por teste" quer dizer passar `runEngineContract` (§ harness abaixo) em cada cenário:

| Verificação | O que prova |
|---|---|
| `determinism` | Duas execuções do zero dão o mesmo `JSON.stringify` dos resultados, byte a byte — inclusive com `Date.now`, `Math.random` e `performance.now` trocados |
| `immutability` | Com toda entrada congelada (`Object.freeze` profundo) o motor roda e dá o mesmo resultado |
| `serialization` | Todo estado (inicial e depois de cada passo) volta igual de `deserialize(serialize(estado))` |
| `timing` | Toda decisão de um passo tem o `candleOpenTime` do candle corrente; entrada nunca preenche no candle em que foi decidida; nada é decidido no aquecimento |
| `no-lookahead` | Para **cada** índice de corte `i`, adulterar todos os candles depois de `i` (preços × 1,37, volume + 1) não muda nenhuma decisão carimbada até `i` nem o estado em `i` |
| `resume` | Para cada corte, serializar o estado, desserializar, criar um motor **novo** e continuar dá exatamente a execução contínua |
| `batches` | Rodar em lotes de 2, 3, 5 e 7 candles, com motor novo a cada lote, dá a execução contínua |
| `single-position` | Nunca abre posição com outra aberta, nem cria entrada com posição aberta |
| `fees-and-slippage` | Valor = preço × quantidade; taxa pela fórmula; preço a mercado com slippage na abertura; o patrimônio reconcilia com o caixa reconstruído dos preenchimentos |
| `stop-before-target` | Posição viva num candle com `mínima ≤ stop` sai pelo stop; saída no alvo só com o stop intacto e o preço acima do alvo (e nunca no candle de uma limitada preenchida no meio) |
| `gap-beyond-stop` | Saída no stop a `tickDown(stop × (1−s))`, ou na abertura quando ela abre além do stop; alvo ao preço do alvo |
| `limit-orders` | Limitada preenche só dentro da validade, pelo preço da regra (abertura em gap, ou o limite com o candle cruzando), e expira exatamente no N-ésimo candle |
| `required-events` | O cenário de fato exercitou o que promete (stop com alvo tocado, gap, alvo, expiração, …): cenário que não dispara o evento reprova, em vez de passar sem testar nada |

### g) Fronteira de domínio

- `strategy-engine` **não depende** de `@cryptoada/market-data` nem de `@cryptoada/database`. Define
  `EngineCandle` (`symbol`, `timeframe`, `openTime`, `closeTime`, `open`, `high`, `low`, `close`,
  `volume`, preços em texto decimal), estruturalmente compatível com o `Candle` do market-data (um
  `Candle` é atribuível a `EngineCandle`, provado em teste), e a própria tabela de timeframes, cuja
  igualdade com a do market-data é contrato.
- **Decimal.** `decimal.js` 10.6.0 (versão exata, plan D3), só neste pacote, num clone isolado
  (`EngineDecimal`: precisão 40, sem notação exponencial) — mexer no `Decimal` global afetaria outros
  consumidores. Entra em preço, quantidade, caixa, taxa, orçamento, pontuação, pesos e limiares. **Nunca
  aparece no estado nem nas decisões**: tudo cruza a borda como texto canônico (`formatEngineDecimal`:
  notação comum, sem zeros à direita, `-0` vira `0`), que o banco guarda em `numeric`. Primitivas já
  implementadas: `roundToIncrement` (tick e passo, com direção), `roundMoney` (8 casas, com direção),
  `decimalFromIndicator`.
- **Mapeamento para as tabelas do plan §3** (sem criar tabela agora; ajustes para a T3.1):
  - `runs` ganha `engine_version varchar` e `engine_state jsonb` (o estado canônico) além de
    `last_candle_time`; `fee_rate`/`slippage_rate`/`initial_balance` duplicam a configuração da versão
    para consulta, mas a fonte é a versão.
  - `signals`: `candle_time` = `signal.candleOpenTime`, `action`, `score`, `votes` (jsonb, inclui peso e
    `isMissing`), `indicators`, `reason`; ganha `regime varchar`.
  - `orders` e `positions` ganham `engine_key varchar` com `UNIQUE (run_id, engine_key)` (as chaves
    `order-N`/`position-N` do motor), para o upsert idempotente; `orders` guarda `purpose`, `limit_price`,
    `quote_budget`, `eligible_candles` e o `reason` da recusa.
  - `fills`: `price`, `quantity`, `fee`, `filled_at` = `candleOpenTime` do preenchimento; ganha
    `notional` e `side`.
  - `positions`: `exit_reason` (`stop`/`target`/`signal`/`command`), `entry_fee`/`exit_fee`, `net_profit`.
  - `equity_points`: `time` = `candleOpenTime`, `equity`, `benchmark`.

### h) Futuro: o que cabe sem retrabalho

- **Metas (`evaluateGoal`, RF13).** É um laço sobre o mesmo `step` por janela (estado inicial novo por
  janela, mesmos candles, mesmo modelo de preenchimento). A política da meta é uma função pura sobre o
  `equityPoint` de cada passo; ao atingir alvo, perda máxima ou prazo, ela injeta no passo seguinte um
  `EngineCommand` (`exit_position` ou `halt`, com `reason: goal_reached | goal_max_loss | goal_expired`),
  que age **no fechamento** daquele candle e executa na abertura do seguinte (mesma regra `t+1`, sem
  saída "mágica" no preço do alvo). O mesmo canal serve à parada pelo usuário (`user_stop`) e ao kill
  switch da spec 002 (`kill_switch`). O tipo existe; a semântica fica com a T2.5/T4b.1 (a referência
  recusa comandos em voz alta).
- **Walk-forward (RF08).** Cada combinação da grade é uma configuração derivada (outro hash, não
  persistida como versão até ser escolhida), rodada pelo mesmo `step` nas janelas de ajuste e de teste;
  o teto é `MAX_WALK_FORWARD_COMBINATIONS`. Pureza permite rodar combinações em paralelo sem
  coordenação.
- **Execução real (spec 002).** O mesmo `step` decide. O preenchimento é a costura `FillModel`
  (`(state, candle, config) → state' + ordens, preenchimentos, posições`): o simulado preenche pelo OHLC
  (§c); o real aplica os preenchimentos **reportados pela corretora**, recebidos como dado — o passo
  continua puro. "Sombra" (constituição, glossário) é rodar os dois `FillModel` sobre as mesmas decisões
  e comparar. Tetos por ordem, por dia e de perda (constituição §7) entram como validação antes do envio,
  fora do motor.
- **Voto de ML (fase posterior).** Novo `kind` numa versão futura do schema, com o hash do artefato do
  modelo dentro da configuração (o hash da versão muda junto com o modelo). A previsão entra como o
  sentimento: dado externo com `observedAt ≤ closeTime`, ou função pura do histórico de features
  disponível no fechamento. Mesma regra de dado ausente (`isMissing`, voto 0).

### Harness, referência e motores defeituosos (entregues na T2.1)

- `test/fixtures/strategy-engine/engine-contract.fixture.ts` — `runEngineContract({ createEngine,
  scenarios })` roda as 13 verificações de §f em cada cenário; `runEngineCheck` roda uma só. Cada falha é
  um `EngineContractViolation` com o nome da verificação e do cenário.
- `reference-engine.fixture.ts` — motor de referência "sempre comprado" (compra em todo fechamento sem
  posição) com o modelo de preenchimento completo de §c e um ATR simples (média do true range; o de
  Wilder é da T2.2). Passa o harness nos dois cenários (`market-entries-with-stop-gap-and-target`,
  `limit-entries-with-expiry-and-gap`) e tem valores conferidos à mão (compra a 100,05 × 24,9875 com taxa
  2,49999938; stop a 96 com alvo tocado; gap a 84,95; alvo a 115,05; limitada a 99 e, em gap, a 101,06).
- Doze motores defeituosos (`REFERENCE_ENGINE_DEFECT`), cada um reprovado **pela verificação certa**:
  lê o relógio → `determinism`; muta a entrada → `immutability`; estado com `Map` → `serialization`;
  carimba no passado com o fechamento seguinte → `timing` (e `no-lookahead` sozinho também reprova);
  preenche no fechamento da decisão → `timing`; estado escondido em closure → `resume`; segunda posição →
  `single-position`; sem taxa e sem slippage → `fees-and-slippage`; alvo antes do stop →
  `stop-before-target`; preço do stop no gap → `gap-beyond-stop`; limitada que não expira →
  `limit-orders`.
- `indicator-contract.fixture.ts` — `expectIndicatorContract` (aquecimento exato, lote = incremental,
  determinismo, retomada do snapshot via JSON em todo ponto), provado com uma média simples e dois
  indicadores defeituosos (aquecimento errado, snapshot com perda). A T2.2 roda cada indicador real nele.

## Alternativas rejeitadas

| Alternativa | Por que não |
|---|---|
| Motor orientado a objeto com estado interno mutável (`engine.onCandle(c)`) | Retomada depende de serializar o objeto inteiro; estado escondido em closure é exatamente o defeito `HIDDEN_STATE` que o harness pega. Função pura com estado explícito torna retomada e paridade triviais |
| Calcular os indicadores em lote (vetorizado) no backtest e incremental no ao vivo | Duas implementações divergem; constituição §5. O lote é o laço do incremental |
| Retomar reaquecendo os indicadores com os últimos N candles | EMA tem memória infinita: o valor difere da execução contínua e quebra a paridade (§b). Snapshot no estado; migração replica do início |
| Preencher a mercado no fechamento de `t` (o preço "que se viu") | Lookahead clássico (constituição §4) |
| Alvo antes do stop, ou "o que veio primeiro" estimado pelo formato do candle | Sem dado intra-candle não se sabe a ordem; constituição §3 manda o lado pior |
| Gap abaixo do stop preenchendo no preço do stop | Otimista: a corretora executa o stop a mercado depois do gap |
| Limitada preenchendo no toque (`mínima ≤ L`) | Otimista: a fila no preço é desconhecida; exigir cruzar é o lado pior |
| Quantidade calculada na decisão (com o fechamento de `t`) | O preço de `t+1` é outro; com gap, a quantidade fixa estoura o caixa ou o risco. Orçamento na decisão, quantidade no preenchimento |
| `number` para dinheiro com arredondamento "no fim" | Constituição §6; erro de float acumula em 17,5 mil candles e a reconciliação de caixa deixa de fechar |
| `Decimal` dentro do estado e das decisões | Não é JSON: o estado não volta igual do banco (defeito `NON_SERIALIZABLE_STATE`) |
| Hash da configuração sobre o JSON como o usuário enviou | `"0.0010"` e `"0.001"`, chaves em outra ordem ou default omitido virariam versões diferentes da mesma estratégia |
| Configuração com todos os não inteiros como `number` | Peso `0.1 + 0.2` e taxa `0.001` em float entram no hash e na conta com erro binário; texto decimal é exato |
| Venda a descoberto e várias posições por par | Fora do escopo (spot, RF05); simplifica o estado a uma posição e uma pendente, com invariante cobrado pelo schema |
| Teste de contrato vermelho como entrega da T2.1 (texto original do `tasks.md`) | Teste vermelho não é commitado; a T2.1 entrega o harness verde com uma referência que passa e doze mutantes que reprovam — prova mais forte de que o harness pega o que promete |

## Consequências

- T2.2 implementa cada indicador como `IndicatorDefinition` e o roda em `expectIndicatorContract`; T2.3 o
  voto, o regime e o texto do motivo no formato de §e; T2.4 o tamanho e os tetos de §c; T2.5 a corretora
  simulada (o `FillModel` de §c) e o motor completo, que **precisa passar `runEngineContract`** nos
  cenários da referência e em cenários próprios com o Placar clássico. A referência de teste não vira
  código de produção: a T2.5 reimplementa em `src` respeitando os limites do lint.
- T3.1 cria as colunas de §g (`runs.engine_state`, `runs.engine_version`, `engine_key` em `orders` e
  `positions`, `signals.regime`, `fills.notional`/`side`, taxas e lucro em `positions`).
- T3.2 (backtest) e T4.1 (ao vivo) são laços sobre `step` com a persistência transacional de §a; T4.2
  (paridade) compara as duas execuções com os mesmos `leadInCandles`.
- Mudar a semântica do motor exige nova `engineVersion`; execuções ao vivo em curso replicam do início.
- `@cryptoada/strategy-engine` depende só de `@cryptoada/environment` e `decimal.js@10.6.0`; o teste de
  fronteira reprova import de outro pacote, relógio, aleatoriedade, rede, disco ou processo no `src`.

## Riscos e o que ficou para depois

| Risco / pendência | Tratamento |
|---|---|
| Restaurar indicadores do snapshot a cada passo custa (17,5 mil candles × regras) | Snapshots pequenos (janelas de até 500 números); medir no RNF01 (T3.2). Se precisar, cache de instâncias por identidade de estado, com o harness verde |
| Fórmula do pré-aquecimento (3 × maior warmup) pode ser curta para MACD/ADX encadeados | A T2.2 mede a convergência contra a referência externa; mudar o fator é nova `engineVersion` |
| Filtros da corretora (`tickSize`, `quantityStep`, `minNotional`) mudam com o tempo | Ficam na configuração da versão; a spec 002 confere contra o `exchangeInfo` antes de operar de verdade |
| Taxa em BNB ou cobrada no ativo comprado (Binance) | Modelada em USDT nas duas pontas (conservador e simples); a spec 002 reconcilia com a taxa real reportada |
| Gap acima do alvo preenchendo ao preço do alvo é pessimista demais para métrica | Escolhido o lado pior (constituição §3); reavaliar com dado real de sombra na spec 002 |
| Sentimento diário alinhado a candles intradiários | O chamador entrega a última observação com `observedAt ≤ closeTime`; a guarda recusa a do futuro |
| Candles faltando no histórico (lacuna da Binance) | Aceitos para a frente; validade de limitada e aquecimento contam candles, não horas |
| Semântica de `EngineCommand` ainda sem implementação | Tipo fixado aqui; a T2.5/T4b.1 implementa e acrescenta cenários ao harness (a referência recusa comandos) |
| Formato exato do texto de motivo | Fixado em §e; a T2.3 implementa e prende por tabela |
