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
