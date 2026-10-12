# Evidência — Spec 003

## Contexto (2026-10-12, teste local no Windows)

- 45 backtests em 15 min (5 estratégias × 9 moedas, 01/04 a 01/10/2026): média de −0,06% (Sentimento contrário,
  57 operações) a −90,43% (Momentum rápido, 10.566 operações). Comprar e segurar positivo em 8 de 9 moedas.
- Meta +3% em 7 dias: melhor combinação "4 Momentum rápido" × BNBUSDT, alvo em 15,3% das 530 janelas, parada em
  23,6%, veredito SEGURAR. Todas as demais EVITAR.
- Mudanças sem commit que a Fase 0 legaliza: plan D5.

## T0.1 e T0.2 — Filtros de preço e quantidade por par (2026-10-12)

**T0.1 (decisão, ADR 0002 "Filtros de preço e quantidade por par").** Tabela em `packages/market-data-crypto/src/symbol-filters.constant.ts`
(`BINANCE_SYMBOL_FILTERS`, `ENGINE_DEFAULT_FILTER_SYMBOLS`, `resolveSymbolFilters`, `hasKnownSymbolFilters`); BTCUSDT e ETHUSDT fora dela.
`resolveSymbolFilters` devolve `undefined` para BTC/ETH e lança `SymbolFiltersNotFoundError` para par desconhecido. `MARKET_SYMBOLS` reprova o boot
com o par sem filtro, nomeando-o. Na API, `runSetupInput` e `setupFor` usam `resolveSymbolFilters` (o valor do usuário continua por último);
`POST /v1/runs` com par sem filtro é 400 em `symbol` (`not_enabled`), sem eco. A constante saiu de `runs.constant.ts`; `goals` não importa mais de `runs` para isso.

**T0.2 (contratos).** `runHash` dourado calculado ANTES da mudança, com o código em que BTC/ETH não passavam pela tabela
(`createRunSetup` com os parâmetros padrão, 1h): BTCUSDT `da96318e…7b079`, ETHUSDT `61a88391…54062`.

| Arquivo | Prova |
|---|---|
| `test/symbol-filters.contract.test.ts` | cada linha passa pelo esquema de incremento do motor; BTC/ETH fora da tabela; par desconhecido lança; boot com `FOOUSDT` reprova, `PEPEUSDT,SHIBUSDT` passa |
| `test/cron-market-environment.contract.test.ts` | mesmo boot, pelo esquema do cron (mensagem cita `MARKET_SYMBOLS` e `FOOUSDT`) |
| `test/api-run-symbol-filters.contract.test.ts` | PEPE grava `0.00000001`/`1`; hash dourado de BTC e ETH; tickSize do usuário vence; par sem filtro 400 sem eco |
| `test/goal-evaluation-series-filters.contract.test.ts` | `setupFor('PEPEUSDT')` usa a tabela; BTC/ETH no padrão; preço PEPE (~0,000004) arredondado > 0 (e 0 com o tick padrão) |
| `test/symbol-filters-mutants.contract.test.ts` | 7 mutantes (sem o espalhamento em `runSetupInput`; sem ele em `setupFor`; ordem invertida; par sem filtro aceito na API; boot sem checagem; BTC na tabela; par desconhecido cai no padrão) |

Mutantes: a API é copiada por `SYMBOL_FILTERS_API_MUTANT_TARGET` (`API_ROUTES_APP_SOURCE`) e o pacote por `SYMBOL_FILTERS_PACKAGE_MUTANT_TARGET`
(`SYMBOL_FILTERS_SOURCE`, que `symbol-filters.contract.test.ts` lê para carregar o pacote copiado).
`test/api-assets-summary`, `api-goal-evaluation` e `api-goal-plan` usavam `ADAUSDT` como "par habilitado sem candles"; passou a ser `LINKUSDT`, porque um par
sem filtro não chega mais a ficar habilitado (reprova o boot).

## T1.1 — Extração do caminho da janela (2026-10-12)

**O que mudou.** `packages/strategy-engine/src/goal/goal-window-path.ts` (novo) recebeu, sem mudar o texto, `indexNextBuys`,
`findFirstDecidedIndex` e a leitura da trajetória por janela (`createGoalWindowPath(params)(start)(offset)`). `simulateGoalWindows`
manteve o laço `for (let start = first; start <= last; start += 1)` e troca as linhas da trajetória por `const pointAt = pathAt(start);`.
`goal-input.ts` exporta `assertGoalSeries({ run, candles, sentiments })` (mesmas mensagens e mesma ordem: candles, depois sentimento).

**Prova de que o resultado das metas não mudou.**

| Arquivo | Prova |
|---|---|
| `test/goal-characterization.contract.test.ts` + `test/fixtures/strategy-engine/goal/goal-characterization.json` | `canonicalJson(evaluateGoal(...))` de 21 casos (os 19 de `goal-differential` mais os dois conjuntos reais com +5% em 14 dias) comparado byte a byte. O dourado foi gravado ANTES da refatoração (passou antes e depois). Para regravar: `GOAL_CHARACTERIZATION_REWRITE=1`. |
| `test/fixtures/strategy-engine/goal/goal-cases.fixture.ts` | `CASES` de `goal-differential` movidos para cá (sem mudar), para os dois testes usarem a mesma lista. |
| `test/goal-mutants.contract.test.ts` | Os mutantes `NEXT_BUY_*`, `TRAJECTORY_SHIFTED_BY_ONE` e `TRAJECTORY_ONLY_WHEN_THE_BUY_IS_AFTER_THE_START` apontam para `WINDOW_PATH = 'goal/goal-window-path.ts'`; os textos `find` não mudaram. Controle e todos os mutantes reprovam como antes. |

**Gates (WSL).** `bun run typecheck` limpo; `bun run lint` limpo; `prettier --check .` limpo. Testes: goal-characterization,
goal-differential, goal-evaluation, goal-hand-values, goal-ranking, api-goal-evaluation, strategy-engine-boundary, code-size-limits,
live-goal-step, goal-evaluation-pool, goal-cold-gate: 227 pass, 0 fail; `goal-mutants` (com controle): 273 pass, 0 fail na rodada
conjunta de 10 arquivos (906 s).

## T1.2 — Janelas e resumo por prazo (2026-10-12)

**O que há.** `packages/strategy-engine/src/horizon/`: `horizon.constant.ts` (`HORIZON_DAYS`, `HORIZON_RECOMMENDATION_RULES`,
`HORIZON_RATE_DECIMAL_PLACES`, `INTRADAY_VERDICT`), `horizon.types.ts`, `computeHorizonWindows` (janelas exatas: retorno = patrimônio no último
candle do prazo ÷ saldo inicial − 1; a estratégia lê `createGoalWindowPath(params)(start)(H − 1)` e o comprar e segurar
`createBenchmarkReader`; janela sem compra vale exatamente 0, que não conta como positiva) e `summarizeHorizon` (mediana: média dos dois do
meio no par; pior 10%: posto `ceil(n ÷ 10)`; mediana, pior 10% e fração positiva arredondados para BAIXO a 8 casas só no fim;
`isShortHistory = windowCount < 60`). Os sinais entram prontos (`computeGoalSignals` uma vez, reaproveitados nos três prazos).
`positiveRate` é fração (0.4 = 40%), como as taxas das metas.

| Arquivo | Prova |
|---|---|
| `test/horizon-hand-values.contract.test.ts` | contas à mão em quatro séries de retornos (5 ímpar, 4 par, 11 para o posto do pior 10%, 3 com arredondamento de negativos), 59 x 60 janelas, série vazia; estratégia que nunca compra (janelas = candles − prazo − primeiro decidido + 1, todas 0); prazo maior que a série |
| `test/horizon-properties.contract.test.ts` | 300 séries sorteadas: mín ≤ p10 ≤ mediana ≤ máx; 0 ≤ positivas ≤ janelas; permutar não muda a saída; estratégia que nunca compra dá 0 e 0% positivas (BTC 1h, ETH 1d, sintética); sem lookahead (série cortada = prefixo das janelas; cauda trocada não muda as janelas já existentes) |
| `test/horizon-differential.contract.test.ts` + `fixtures/strategy-engine/horizon/horizon-oracle.fixture.ts` | oráculo que NÃO importa `src/goal` nem `src/horizon`: refaz cada janela do zero com `createEngine`/`step`/`walletStep` e BigInt; 12 casos (reais, gaps, sentimento, sintéticas, 7/15/30 dias), janela a janela, estratégia e comprar e segurar |

**Gates (WSL, espelho próprio `~/gates/ativada-spec3`).** typecheck, lint e prettier limpos. Testes: horizon-hand-values, horizon-properties,
horizon-differential, strategy-engine-boundary, code-size-limits, goal-differential, goal-characterization, goal-evaluation, goal-hand-values:
173 pass, 0 fail.

## T1.3 — Recomendação do prazo (2026-10-12)

**O que há.** `recommendHorizon(rows): number | undefined` em `horizon/recommend-horizon.ts`, com os limiares do spec §5 em `horizon.constant.ts` (60 janelas,
55% de positivas, pior 10% ≥ −0.1; não alterados). Elegível: sem histórico curto, mediana > 0, `positiveCount × 100 ≥ 55 × windowCount` (contagens
exatas) e pior 10% ≥ −0.1. Ordem: mediana ÷ N arredondada para BAIXO a 8 casas; empate vence o MAIOR N.

**Decisão de arredondamento (registrada no ADR 0002, "Prazos (spec 003, Fase 1)").** Mediana e pior 10% são comparados pelo TEXTO PUBLICADO (a mediana
que aparece como `0` não é elegível); positivas pelas contagens exatas. **Correção do spec RF03:** as taxas passam de 50% do ganho BRUTO antes das
taxas (líquido + taxas pagas), não do `grossProfit` das métricas, que já vem depois das taxas.

| Arquivo | Prova |
|---|---|
| `test/horizon-recommendation.contract.test.ts` | um teste por regra: mediana > 0 (zero e negativa), 55% exatos x 54 de 100, a fração publicada `0.55` com 32 de 60 não passa, pior 10% em −0.1 / −0.10000001 / −0.09999999, histórico curto, linha vazia, nenhuma elegível, a inelegível não vence; ordem por mediana POR DIA, empate vence o mais longo (nas duas ordens de entrada), arredondamento da mediana por dia para baixo (exata, para cima e meio-arredondada dariam outro vencedor) |
| `test/horizon-mutants.contract.test.ts` | controle + 27 mutantes, todos reprovados: `>` ↔ `≥` (mediana, positivas, pior 10%), histórico curto elegível, desempate invertido, ordem crescente, sem ÷ N, mediana por dia sem arredondar / meio-arredondada / para cima, constantes 60→59/61, 55→54/56, −0.1→−0.11/−0.09, pior 10% com `floor` e com `round` no lugar de `ceil`, mediana par pegando o do meio de cima, zero contado como positivo, resumo meio-arredondado, janelas (última descartada, primeira pulada, retorno sem `− 1`, prazo terminando um candle antes, comprar e segurar um candle atrasado ou igual à estratégia) |

**Gates (WSL, `~/gates/ativada-spec3`).** typecheck, lint e prettier limpos. Testes: horizon-recommendation, horizon-hand-values, strategy-engine-boundary,
code-size-limits: 46 pass, 0 fail. `horizon-mutants` (com controle): 28 pass, 0 fail (335 s).

## T1.4 — Veredito de 15 minutos (2026-10-12)

**O que há.** `summarizeIntraday(metrics)` em `horizon/summarize-intraday.ts` devolve `{ netReturn, tradeCount, feesPaid, feeShareOfGross, verdict }`
a partir do que o veredito lê de `RunMetrics` (`initialBalance`, `finalEquity`, `feesPaid`, `trades`; `RunMetrics` serve). **Armadilha corrigida:** o
`grossProfit` das métricas já vem DEPOIS das taxas (`trade-totals.ts`), então o bruto é `líquido + feesPaid`, com líquido = `finalEquity − initialBalance`
(inclui a posição aberta). `NAO_COMPENSA` quando líquido ≤ 0 OU `feesPaid > 0.5 × bruto`; 50% exatos ainda compensam. `netReturn` (fração do saldo) é
arredondado para baixo e `feeShareOfGross` para CIMA (nunca esconde taxa); a fatia é `null` com bruto ≤ 0. O slippage está embutido no preço da ordem e NÃO
aparece em `feesPaid` (comentário e frase não dizem "taxa + slippage"). `horizon/index.ts` e `src/index.ts` exportam o módulo.

**Métricas reais gravadas** (banco de desenvolvimento, `kind='backtest'`, 15 min, 01/04 a 01/10/2026) em `test/fixtures/strategy-engine/horizon/intraday-metrics-{bnbusdt,linkusdt}-15m.json`:
BNBUSDT 10 operações, final 9712.12930111, taxas 151.89196889 → líquido −287.87069889 (`-0.02878707`), bruto −135.97873 → `NAO_COMPENSA`;
LINKUSDT 371 operações, final 7115.51208745, taxas 2310.68264255 → líquido −2884.48791255 (`-0.2884488`), bruto −573.80527 → `NAO_COMPENSA`.

| Arquivo | Prova |
|---|---|
| `test/horizon-intraday.contract.test.ts` | os dois contratos reais (veredito e números, conferidos à mão no comentário); regras à mão: compensa (300 de líquido, 100 de taxa, fatia 25%), 50% exatos compensam, 0.50000001 não, taxa comendo o ganho, líquido zero, líquido negativo com bruto positivo (fatia 150%), sem taxa, arredondamentos (1 ÷ 3 para cima, líquido para baixo), sem operar, sem patrimônio final |
| `test/horizon-mutants.contract.test.ts` | +10 mutantes do veredito (líquido zero compensa, taxa no limite reprova, bruto sem taxa, bruto subtraindo taxa, arredondamentos trocados, limite 0.6 e 0.4, sem patrimônio compensa, fatia mostrada sem bruto positivo): controle + 37 mutantes dos prazos, todos reprovados. Um mutante sobreviveu na primeira rodada (líquido 0 com taxa 0 = estratégia que não operou); virou o teste "sem operar" |

**Gates (WSL, `~/gates/ativada-spec3`).** typecheck, lint e prettier limpos. Testes: horizon-intraday, horizon-mutants (controle + 37), strategy-engine-boundary,
code-size-limits: 71 pass, 0 fail; depois da última edição do loader, horizon-intraday, hand-values, recommendation, properties, goal-characterization e
goal-hand-values: 126 pass, 0 fail.

## T2.1 — Tarefa de prazos no pool, portão a frio e cache (2026-10-12)

**O que há.**
- Motor: `horizonCandlesOf(horizonDays, timeframe)` (`horizon/horizon-candles.ts`, pura, exportada) saiu dos testes para a produção, e os testes da Fase 1
  (`horizon-run.fixture.ts`) agora a chamam; `computeGoalSignals` e `assertGoalSeries` passaram a ser exportados do pacote.
- Pool: o mesmo `goal-evaluation-pool.ts` ganhou `computeHorizon(request, signal)` ao lado de `compute`. A tarefa vira `PoolRequest`
  (`goal` | `horizon`) e o resultado `PoolResult`; as mensagens novas são `compute-horizon` e `horizon-result` (o `failed` é comum), e uma resposta de
  tipo diferente do pedido é falha da thread. O worker (`goal-evaluation.worker.ts`) passa os dois cálculos a `serveGoalEvaluationWorker`; um worker
  que só sabe metas (o roteirizado dos testes) responde `failed` ao pedido de prazos, e o formato das mensagens de meta não mudou.
- `apps/api-ativada/src/horizons/`: `computeHorizonLine` (puro, o que a thread roda: sinais diários UMA vez, `computeHorizonWindows` +
  `summarizeHorizon` para 7/15/30 dias, e a linha de 15 minutos por `runIntradayInMemory`), `horizon-series.ts` (730 dias diários, trecho contíguo mais
  recente; 90 dias de 15 min como estão, porque `advanceCandle` declara a lacuna), `horizon-cache.ts` (chave `(versão da estratégia, par, último candle
  diário, último candle de 15 min)`), `horizon-best.ts` (melhor estratégia por linha), `horizon-strategies.ts` e
  `horizon-evaluation.use-case.ts`. Só a avaliação que erra o cache passa por `createColdEvaluationGate` (mesmo `createGoalColdBudget`, mesma política
  `GOAL_EVALUATION_COLD`: 3 por minuto por usuário, uma em voo por usuário, teto global → 503).
- Refatorações mínimas das metas: `loadStrategyEntry` extraído de `loadGoalStrategies`, `buildSymbolSeries` extraído de `loadSymbolSeries` e `setupFor`
  com o timeframe como segundo parâmetro (padrão: o diário das metas). Resultado das metas inalterado.

**Regra de "melhor por linha".** Na linha de N dias vence a estratégia que passa na regra de recomendação, depois a de maior mediana, depois o menor id; na de
15 minutos vence a que compensa, depois o maior líquido, depois o menor id. O prazo recomendado sai de `recommendHorizon` sobre essas três linhas.

| Arquivo | Prova |
|---|---|
| `test/horizon-candles.contract.test.ts` | contas à mão (7/15/30 dias em 1d, 15m, 1h, 4h) e número inteiro de candles em todo timeframe do motor |
| `test/horizon-evaluation.contract.test.ts` | resultado por linha; as janelas conferem com a composição independente do motor; séries e `RunSetup` por timeframe; 5 mais novas x `strategyId`; estratégia alheia, inexistente e sem versão = mesmo erro 404; **segunda chamada não recalcula**; candle novo diário OU de 15 min recalcula; **a quarta avaliação a frio no minuto é 429** (a do cache não gasta) e o orçamento é por usuário; uma em voo por usuário (mesma moeda divide, outra é 429); teto global 503; falha de uma estratégia cancela as outras |
| `test/horizon-best.contract.test.ts` | escolha da melhor por linha, em qualquer ordem de chegada |
| `test/horizon-pool.contract.test.ts` | a thread real devolve EXATAMENTE o cálculo da thread principal; a mesma thread atende metas e prazos; indisponível com o código do motor; worker só de metas = falha; cancelamento |
| `test/api-horizons-mutants.contract.test.ts` | controle + 20 mutantes (chave do cache sem par, versão, candle diário ou de 15 min; cache que nunca guarda; portão pulado; aviso pago a quente; assinatura do portão sem a moeda; falha que não cancela; `strategyId` ignorado; 404 virando outro erro; melhor invertida; regra de recomendação ignorada; desempates; ausente na frente), todos reprovados |

**Desvios.**
1. A spec dizia "quinta a frio no minuto → 429", mas o orçamento `GOAL_EVALUATION_COLD` é de 3 por minuto (RNF01 manda usar o mesmo): a **quarta** é a recusada. A política não mudou.
2. Os prazos têm um segundo `ColdEvaluationGate` (o tipo do resultado é outro), mas dividem o orçamento por minuto com as metas (mesmo limitador e mesma política). O teto global
   `GOAL_EVALUATION_MAX_CONCURRENT` vale por portão: no pior caso há o dobro dele em voo (metas + prazos), cada um com no máximo uma por usuário.
3. As mensagens do canal do pool seguem `z.object` (como as de meta já eram), não `z.strictObject`.
4. A série diária dos prazos tem 730 dias (a das metas, 1.100): uma avaliação a frio custa ~730 velas diárias + até 8.640 de 15 min por estratégia.
5. Teste que compara classe de erro por `instanceof` não vale para o arnês dos mutantes (a cópia do `src` tem as suas classes): os contratos conferem `status` e `code`.

**Gates (WSL, `~/gates/ativada-spec3`).** typecheck, lint e prettier limpos. Testes: horizon-evaluation, horizon-best, horizon-pool, horizon-candles,
api-horizons-mutants (controle + 20), goal-evaluation-pool, goal-cold-gate, api-goal-evaluation, api-goal-plan, api-goals, code-size-limits,
strategy-engine-boundary, app-import-boundary, api-openapi, ownership-registry e os cinco contratos da Fase 1: 281 pass, 0 fail.
