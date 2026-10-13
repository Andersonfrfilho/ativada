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

## T2.2 — `GET /v1/horizons` (2026-10-12)

**O que há.** `apps/api-ativada/src/horizons/`: `horizons.routes.ts` (rota `GET /v1/horizons?symbol=&strategyId=`, `access: USER`, limite de taxa
`RATE_LIMIT_POLICY.GOAL_EVALUATION`, como as rotas de meta), `horizons.docs.ts` + `horizon-view.schema.ts` (documentação e esquema da resposta no OpenAPI),
`horizon-requests.ts` (esquema Zod da consulta: `symbol` obrigatório e habilitado em `MARKET_SYMBOLS` — senão 400 com `{ field: 'symbol', reason: 'not_enabled' }`
e sem eco do valor —, `strategyId` opcional como texto cru), `horizon-messages.ts` (as frases, RF06) e `horizon-view.ts` (`toHorizonsView`). A fiação está em
`routes/create-horizon-route-dependencies.ts` (o mesmo limitador e o mesmo `computeHorizon` do pool; `create-application.ts` passa `goalPool.computeHorizon`).

**Resposta.** `rows` na ordem do spec (`intraday`, depois `daily` de 7, 15 e 30 dias), cada linha com `strategy` (a melhor da linha), os números do motor em texto
decimal e `message`; `isRecommended` só nas linhas de dias e só no prazo de `recommendedHorizonDays`; `recommendationMessage` ("Nenhum prazo compensou no histórico desta
moeda." quando nenhum passa); `unavailable` lista a estratégia cuja configuração o motor recusa. Percentuais saem do texto decimal com `EngineDecimal`, nunca `Number`:
mediana e líquido para BAIXO a 1 casa (`-0.0041` vira `-0,5%`), acertos para BAIXO sem casa, fatia das taxas para CIMA; vírgula decimal; sinal `+` só no ganho.
Exemplos reais do teste: "Por 7 dias: em geral +0,4%, positivo em 52% das vezes." e "Operar de 15 em 15 minutos: não compensa (as taxas comem o ganho).".

| Contrato | Arquivo |
|---|---|
| 401 sem token; 400 par desabilitado, ausente, repetido ou vazio (sem eco, nada calculado); 400 parâmetro desconhecido | `test/api-horizons.contract.test.ts` |
| estratégia de outro usuário, inexistente e id malformado (e UUID em maiúsculas) = o MESMO 404 (`expectIndistinguishableNotFound`) | idem |
| ordem das linhas, frases, no máximo um selo e só em linha de dias; strategyId do dono; segunda chamada do cache; a 21ª chamada no minuto é 429; a quarta moeda a frio no minuto é 429 com `Retry-After` e `RATE_LIMITED` | idem |
| frases: arredondamento contra o usuário, vírgula, sem `-0,0%`, selo e histórico curto, motivos da linha de 15 min | `test/horizon-messages.contract.test.ts` |
| caso do spec §2 e §7.2: só o prazo de 30 dias recomendado, ou "nenhum prazo"; 15 min nunca com selo; sem estratégia e sem candles de 15 min | `test/horizon-view.contract.test.ts` |
| `api-openapi` verde: a rota aparece no documento gerado e todo caminho do documento é rota real (`buildApiRouteDependencies` ganhou `horizons`) | `test/api-openapi.contract.test.ts` |
| mutantes: +20 (sem `access`, sem limite de taxa, sem `documentation`, id malformado deixa de ser 404, qualquer par aceito, consulta aceita campo desconhecido, os 4 arredondamentos trocados, sinal `+` em tudo, vírgula virando ponto, selo nunca escrito, aviso de histórico curto, motivo das taxas, singular, todas as linhas com selo, "sem recomendação" virando `0`) | `test/api-horizons-mutants.contract.test.ts` (controle + 38) |

Dois mutantes sobreviveram na primeira rodada e foram tratados: `EVERY_DAILY_ROW_STAMPED` (o harness real não tem prazo recomendado, então nenhuma linha leva o selo em nenhuma das duas
versões: nasceu `horizon-view.contract.test.ts`, com a avaliação sintética do spec) e `NEGATIVE_ZERO_SHOWN` (o guarda de `-0` era código morto, `toFixed` já devolve `0,0`: o guarda saiu e o teste do `-0` ficou).

**Desvios.**
1. `symbol` aceita só par habilitado e `strategyId` malformado é 404 (não 400), por isso a consulta valida `strategyId` como texto e a rota o confere com `parseResourceId`; a documentação OpenAPI o descreve como UUID.
2. A rota usa a política `GOAL_EVALUATION` (20/min) em vez de uma política nova: o limite é o mesmo e o balde também.
3. `routes/create-domain-route-dependencies.ts` já estava no teto de 200 linhas; a fiação dos prazos mora em arquivo próprio (`create-horizon-route-dependencies.ts`).

**Gates (WSL, `~/gates/ativada-spec3`).** typecheck, lint e prettier limpos. Testes: horizon-view, horizon-messages, api-horizons, api-openapi, api-docs-page, health-routes,
admin-boundary-routes, horizon-evaluation, horizon-best, horizon-pool, api-horizons-mutants (controle + 38), api-goal-evaluation, api-goals, api-goal-plan, goal-evaluation-pool,
goal-cold-gate, code-size-limits, strategy-engine-boundary, app-import-boundary e ownership-registry: 282 pass numa rodada e 111 pass, 0 fail na rodada final
(view, messages, api-horizons, api-openapi, horizon-evaluation, horizon-best, mutantes e code-size-limits) depois da correção dos dois mutantes.

## T2.3 — Linha de 15 minutos em memória (2026-10-12)

**O que há.** `horizons/horizon-intraday-run.ts`: `computeIntradayMetrics({ strategy, run, candles, sentiments })` roda o `advanceCandle` de `@ativada/run-recording` (o passo do backtest e do
ao vivo, com a lacuna declarada pela contagem exata e o sentimento do candle) sobre a série e junta, na memória, os pontos de patrimônio e as operações fechadas; as métricas saem do
mesmo `computeRunMetrics` do backtest (com `computeOpenPositionMetrics` para a posição aberta no último fechamento). `runIntradayInMemory` aplica `summarizeIntraday` a elas. Nada
de carteira nova, nada de `runs`: o módulo `horizons/` não importa repositório de execução, lote, despachante nem o caso de uso do backtest. A série vem de
`findCandles` dos últimos 90 dias de 15 min (sem aquecimento extra: o aquecimento da estratégia consome o começo da janela, como num backtest que começa no primeiro candle lido).

| Contrato | Arquivo |
|---|---|
| **Paridade com o backtest gravado**: nos dois conjuntos reais (BTC 1 h, ETH 1 d) as métricas INTEIRAS (`toStrictEqual`: operações, `finalEquity`, `feesPaid`, drawdowns, Sharpe…) da memória são as de `runBacktest` do harness do backtest (`runGolden`), e o resumo é `summarizeIntraday` dessas métricas | `test/horizon-intraday-run.contract.test.ts` |
| Com um buraco nos candles que faz a carteira sair por lacuna (achado pelo motor direto), a memória continua igual ao backtest, e o resultado difere do da série inteira | idem |
| Com regra de sentimento (Placar clássico + `fear_greed`, leituras alternando medo e ganância a cada 24 candles) a memória continua igual ao backtest, e difere da corrida sem sentimento | idem |
| Sem candle algum não há resultado (`undefined` nas métricas, `null` no resumo) | idem |
| **Nenhuma linha nova em `runs`** depois da avaliação completa pelo harness (`runs.all()` igual ao de antes, nada despachado, nenhuma leitura de resultado) | idem |
| O módulo `horizons/` não referencia escritor de execução (`createRunRepository`, `createRunResultRepository`, `createRunBatchRepository`, `appendDecisions`, `createBatchBuffer`, `toRunResultRows`, `RunDispatcher`, `runBacktest`) | idem |
| mutantes: +9 (candle anterior não rastreado, estado do motor não carregado, pontos de patrimônio ou operações fechadas não coletados, posição aberta avaliada na abertura, sentimento não escolhido ou do candle anterior, sem candle e com resultado, saldo inicial trocado), todos reprovados | `test/api-horizons-mutants.contract.test.ts` (controle + 47) |

**Desvios.** (1) O harness do backtest roda `runBacktest` com um banco em memória, não Postgres; a paridade é, portanto, com o MESMO caminho de código do backtest gravado, e o `make backtest-test`
(Postgres) continua sendo a prova do lado do banco. (2) A API busca 90 dias de 15 min sem o aquecimento antes deles (o plano D4 fala em ~8.640 velas); a estratégia clássica leva ~50 candles
para decidir, e a janela efetiva tem então 89,5 dias.

**Gates (WSL, `~/gates/ativada-spec3`).** typecheck, lint e prettier limpos. Testes: horizon-intraday-run, api-horizons-mutants (controle + 47), horizon-evaluation, api-horizons, horizon-pool,
horizon-intraday, backtest-use-case, backtest-continuity, api-openapi, code-size-limits, strategy-engine-boundary, app-import-boundary, ownership-registry e test-support-boundary:
219 pass, 0 fail.

## T3.1 — Rota `/prazos`, menu e consulta (2026-10-12)

**O que há.** `ROUTE_PATH.HORIZONS` (`/prazos`) e `API_PATH.HORIZONS`; item "Prazos" no `MainNav` com o ícone novo `horizons` (relógio, em `ICON_PATHS`); `src/horizons/`: `horizon.constant.ts`, `horizon.validation.ts` (espelha `HORIZONS_VIEW_SCHEMA` da API: linha `intraday` e `daily` numa união discriminada, taxas em texto decimal), `horizon.query.ts` (`useHorizonsQuery`, chave por moeda e estratégia, `staleTime` de 60 s por causa do limite de 20/min), `useHorizonFilters.hook.ts` (moeda e estratégia moram em `?symbol=&strategyId=`; moeda desconhecida cai na primeira de `marketSymbols`), `HorizonFilters.component.tsx` ("Melhor por prazo" é o padrão, depois as estratégias do usuário) e `HorizonsPage.page.tsx` (por enquanto: aviso do histórico, filtros, carregando, erro e a frase da recomendação; as linhas vêm na T3.2).

| Contrato | Arquivo |
|---|---|
| O menu traz "Prazos" apontando para `/prazos` e o clique abre a tela | `test/horizons.contract.tsx` |
| Sem parâmetro: primeira moeda e sem `strategyId` na consulta; com `?symbol=ETHUSDT&strategyId=…`: a consulta e os seletores seguem a URL; moeda não habilitada cai na primeira | idem |
| Trocar um seletor reescreve a URL e consulta de novo; voltar a "Melhor por prazo" tira o `strategyId` | idem |
| Esquema: aceita os dois casos do spec §7.2; recusa `rows` que não é lista, frase ausente, `kind` desconhecido, `recommendedHorizonDays` texto e taxa `NaN` | idem |
| Resposta inválida não renderiza (estado de erro padrão, sem a frase de recomendação); 500 mostra o mesmo erro | idem |

**Gates (WSL, `~/gates/ativada-spec3`).** typecheck, lint e prettier limpos; `panel-test`: 365 pass, 0 fail (31 arquivos).

## T3.2 — Linhas por prazo, selo e estados (2026-10-12)

**O que há.** `HorizonResults` (frase de recomendação do servidor + "Como ler" recolhível + linhas + aviso de lista cortada) dentro de um `Card`; `HorizonRows` (lista ordenada na ordem do servidor: 15 minutos, 7, 15 e 30 dias), `DailyHorizonRow` e `IntradayHorizonRow` (título do prazo, a frase do servidor exibida como veio, estratégia e versão, números), `DistributionFigures`/`HorizonFigure` (rótulos "Em geral", "Em quantas vezes deu positivo", "No pior caso", e o mesmo trio para "comprar e segurar"), `RecommendedBadge` (selo "✓ Recomendável": forma, texto e borda de 2 px, não só cor), `horizon-format.ts` (taxa em texto vira porcentagem por `BigInt` de `src/format/decimal.ts`, 1 casa, sem `Number`; dado ausente vira "—"), `Horizons.module.css` (só tokens). O aviso `HistoryNote` (RF07) já estava na página. Histórico curto aparece como etiqueta "Histórico curto" na linha (a frase do servidor continua sendo a explicação). Sem estratégia ou sem candles não há lista: só a frase do servidor.

| Contrato | Arquivo |
|---|---|
| Spec §7.2 caso 1 (só 30 dias recomendado): ordem 15 min, 7, 15, 30; frases do servidor presentes tal como vieram; UM selo, na linha de 30 dias; frase "O prazo mais recomendável… 30 dias" | `test/horizons.contract.tsx` |
| Números exatos: 30 dias `+0,4%`, `58,0% (232 de 400)`, `-7,0%`; comprar e segurar `+0,2%`, `51,0%`, `-12,0%` | idem |
| Linha de 15 min "não compensa": texto e forma (✕), resultado `-1,2%`, 41 operações, `31,50 USDT` de taxas, `—` quando a fatia é nula; e a variante "Compensa" | idem |
| Spec §7.2 caso 2 (nenhum recomendado): frase "Nenhum prazo compensou…", nenhum selo, as 4 linhas continuam | idem |
| Histórico curto na linha; taxa nula é `—`; sem estratégia: só a frase do servidor, sem lista nem "Como ler" | idem |
| Aviso fixo do `HistoryNote`; "Como ler" fechado por padrão; carregando em `role="status"`; aviso de lista cortada | idem |
| Contraste (≥ 4,5:1, claro e escuro) do texto do selo e das etiquetas: `ink` sobre `buy-soft`, `sell-soft`, `warn-soft`, `surface-2`, e `ink-2` sobre `surface-2` | `test/contrast.contract.ts` |

**Gates (WSL, `~/gates/ativada-spec3`).** typecheck, lint e prettier limpos; `panel-test` completo verde.

## T3.3 — Link "Comparar prazos desta moeda" na meta (2026-10-12)

**O que há.** `goals/CompareHorizonsLink.component.tsx`, usado na `GoalDetailPage` logo abaixo da perda máxima: leva a `/prazos?symbol=<par da meta>` (o parâmetro vem de `HORIZON_PARAM.SYMBOL`, montado com `URLSearchParams`). Enquanto a meta não carregou, não há link.

| Contrato | Arquivo |
|---|---|
| Meta em ETHUSDT: o link tem `href="/prazos?symbol=ETHUSDT"`; o clique abre `/prazos`, o seletor de moeda mostra ETHUSDT e a consulta de prazos sai com `symbol=ETHUSDT` | `test/horizons.contract.tsx` |
| Meta ainda carregando: sem link | idem |

**Gates (WSL, `~/gates/ativada-spec3`).** typecheck, lint e prettier limpos; `panel-test` completo verde.
