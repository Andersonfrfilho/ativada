# Evidência — Spec 008

## T0.1 🧠 — Contrato e paridade das leituras gravadas (opus, 2026-10-14)

Decisões registradas no ADR 0002, seção "Acompanhamento ao vivo (spec 008)" (L1 a L20, mais os contratos de teste por
rota). Motor (`packages/strategy-engine`) e `packages/run-recording` intocados (RNF03).

**Conferido no código (lido, não suposto).**

- `signals`: `indicators` = `collectIndicators` do placar (`rule:<id>`, `rule:<id>.<saída>` em ordem alfabética,
  `risk:atr`, `regime:adx.<saída>` só com ADX; Fear & Greed = índice da observação usada ou `null`);
  `sentiment_observation` = `{ value, observedAt, source }` usada, só com Fear & Greed. Uma linha por vela processada
  depois do aquecimento; o aquecimento não grava linha. No ao vivo a primeira linha é a vela `period_start − d`.
- Índices: `signals_run_id_candle_time_unique`, `signals_user_id_run_id_idx`, `equity_points_run_id_candle_time_pk`,
  `equity_points_user_id_run_id_idx`, `positions_run_id_engine_key_unique`, `positions_user_id_run_id_idx`,
  `candles_exchange_symbol_timeframe_open_time_pk`. **Nenhum índice faltando; nenhuma migration.**
- `equity_points.benchmark` = `benchmarkValue` (saldo inicial até o primeiro sinal); `positions.stop_price`/`target_price`
  NOT NULL.
- `computeNextTriggers` chama `evaluateScoreboard`, cujo voto do Donchian lê `previous` e lança sem ele.
- Prazo da meta: `decideGoalStep` vence no candle que fecha em `period_start + horizonDays × 86.400.000`. **Correção do
  plan D5:** a base é `period_start`, não `startedAt`.
- `candles.close` volta com zeros à direita (`numeric(24,8)`) e `close_time` = abertura + d − 1; o gatilho usa esse
  `close_time` (o mesmo que o motor recebeu), não `candle_time + d`.
- O servidor não sabe o fuso: frases sem data/hora (L9); o painel monta as horas.

**Paridade (plan D3) — passou.**

- Código: `apps/api-ativada/src/runs/live-status/stored-readings.ts` (`buildStoredReadings`, puro, 117 linhas) e
  `test/live-stored-readings-parity.contract.test.ts`.
- Método: cada decisão gravada como `mapSignal` grava e lida como o Postgres devolve `jsonb` (número pelo texto `numeric`,
  sem expoente); `computeNextTriggers` sobre as leituras da última linha + anterior × `computeLatestTriggers` sobre o
  prefixo inteiro da série, `toStrictEqual`, estados `awaiting_entry` e `holding`, em TODAS as velas decididas.
- Conjuntos: `btcusdt-1h-500` e `ethusdt-1d-400`. Estratégias (5, cobrindo as 7 regras): Placar clássico (EMA, MACD, RSI,
  OBV, ADX); EMA 3×8 + RSI 7; Donchian 20 + Bollinger 20 sem regime; Fear & Greed + EMA 5×13 + MACD com ADX; as sete com
  ADX. Sentimento sorteado (semente 2026) com observações ausentes, velhas (> 48 h) e de outra fonte.
- **Resultado: 3.054 velas decididas, 6.100 comparações, 0 divergências.** As 4 velas restantes são a primeira decisão
  das duas estratégias com Donchian em cada conjunto: sem a linha anterior o canal anterior não existe gravado, e o
  contrato responde `warming_up` (ADR L2) em vez de inventar.
- Mutantes da remontagem, aplicados à mão no espelho e revertidos: canal anterior trocado pelo atual (morto), sentimento
  descartado (morto), ADX descartado (morto).

```text
bun test ./test/live-stored-readings-parity.contract.test.ts   (WSL, ~/gates/ativada-spec8)
paridade: 3054 velas decididas, 6100 comparações, 4 sem a linha anterior
 12 pass, 0 fail, 12228 expect() calls, 18.04s
```

**Gates (WSL, espelho `~/gates/ativada-spec8`).** `bun run typecheck` verde; `bun run lint` verde; `prettier --check`
verde nos arquivos desta task (o único aviso é `apps/frontend-ativada/e2e/flows/goals.flow.ts`, alterado por outra
sessão e fora deste commit); `bun test` da paridade, `strategy-engine-boundary`, `code-size-limits`,
`app-import-boundary` e `next-trigger-latest`: 73 pass, 0 fail.

**[NEEDS CLARIFICATION]:** nenhum. A paridade bateu e não falta índice: o plano D3 vale, sem pool de threads nem cache.

## T1.1 — Contas puras do acompanhamento (sonnet, 2026-10-14)

- `apps/api-ativada/src/runs/live-status/live-balance.ts` (`computeLiveBalance`, `computeBuyAndHold`),
  `live-goal-progress.ts` (`computeLiveGoalProgress`), `live-status.constant.ts` e a conclusão de `stored-readings.ts`
  (`computeStoredTriggers`: remonta as leituras gravadas e chama `computeNextTriggers`; `needs_previous` na primeira decisão
  com Donchian). Motor e `run-recording` intocados.
- Contas à mão (ganho, perda, sem vela, 1/3 e −1/3 arredondados contra o usuário, empate em ±0,009 e ±0,01, o exemplo da spec
  de 1.023,40) e propriedades de 2.000 sorteios contra um oráculo `bigint` independente (`test/fixtures/live-status/scaled-decimal.fixture.ts`):
  taxa e diferença sempre o piso de 12 casas, `remainingAmount ≥ 0` (para cima), `lossRoomAmount ≥ 0` (para baixo),
  `targetAmount`/`floorAmount` iguais a `computeGoalLevels`.
- Prazo da meta: em 15m, 1h, 4h e 1d o candle em que `decideGoalStep` (worker) devolve `expired` fecha exatamente em
  `deadlineAt = period_start + horizonDays × 86.400.000`.
- Testes novos (carregam o módulo por `loadApiApp()`, então os mutantes entram): `test/live-balance.contract.test.ts`,
  `test/live-goal-progress.contract.test.ts`, `test/live-stored-readings.contract.test.ts` (linha anterior entregue pelo
  chamador mesmo com lacuna, valores não numéricos como ausência).

```text
WSL ~/gates/ativada-spec8: typecheck verde · lint verde · format:check verde
bun test (3 arquivos novos): 38 pass, 0 fail
vizinhos (live-stored-readings-parity, api-openapi, ownership-registry, strategy-engine-boundary, code-size-limits,
app-import-boundary, api-run-trade-summary, api-runs): 193 pass, 0 fail
```

## T1.2 — Catálogo de frases (sonnet, 2026-10-14)

- `decision-messages.ts` (motivo por vela, L14, mais `resolveDecisionOutcome`, L12), `decision-condition.ts` (condição de cada
  tipo de regra por voto, L15), `trigger-messages.ts` (o que falta por `metric`, o placar que falta, o aviso fixo e os três
  motivos de "sem gatilho", L3/L11), `live-status-messages.ts` (saldo, comprar e segurar, meta; L6 a L9) e
  `live-number-format.ts` (pt-BR sem `Intl`: vírgula, milhar com ponto, menos tipográfico, direção do arredondamento).
  Nenhuma frase do servidor leva data ou hora (L9).
- Texto literal conferido para: esperou (singular, plural e decimal, regra de maior peso, empate, regra de peso zero pelo filtro
  ADX, sentimento sem leitura em 48 h, "todas a favor mas abaixo do limiar"), comprou (2 de 2, 2 de 3, 3 de 3, regra única),
  vendeu, comprada esperando, a compra que não se repete, a venda sem posição, cada um dos 7 tipos de regra × voto contra/neutro,
  cada `metric` × sentido × `basis`, regra que já vota a favor, sem limiar, placar que falta (compra e venda, singular, plural,
  decimal, já alcançado), os quatro estados de `not_running`, `no_candle`, aquecendo (Donchian), saldo (ganho, perda, milhar,
  menos 0,01, sem vela), acima/abaixo/empatada (singular em 1,00, módulo para cima) e a meta (1 dia, taxas digitadas, desfechos).
- Desvios do texto do ADR: (a) "aquecendo" é só a frase dos gatilhos (L2); o ADR L12 já diz que decisão aquecendo não existe, então
  `decision-messages` não tem essa frase; (b) o ADR não dá frase para "regra já vota a favor" nem "sem limiar": acrescentadas
  ("{regra}: já vota para comprar/vender." e "{regra}: ainda não há leitura para dizer o que falta.").

```text
WSL ~/gates/ativada-spec8: typecheck verde · lint verde · format:check verde
bun test (frases + T1.1 + paridade + api-openapi + ownership-registry + strategy-engine-boundary + code-size-limits +
app-import-boundary): 215 pass, 0 fail
```

## T1.3 — Leituras do acompanhamento ao vivo (sonnet, 2026-10-14)

- `packages/database/src/run-results/run-live-status.ts` (+ `run-live-status.types.ts`, exportados em `@ativada/database` como
  `createRunLiveStatusRepository`): `readLatestEquityPoint` (PK, uma linha), `listDecisionRows` (decrescente, `before` exclusivo,
  `LIMIT limit + 1`, junção `LEFT JOIN candles` pela PK com a corretora/par/timeframe da execução; vela ausente lança, nunca
  omite a linha), `listPositionsAround` (as abertas e as que cruzam a faixa de velas lida, por `positions_user_id_run_id_idx`,
  com `LIMIT`) e `listDecisionMarkers` (pontinhos do gráfico, crescente, `LIMIT 501`). O dono vai no tipo como `OwnerScope`
  (a marca `ownerUserId` do repositório, a mesma convenção das outras leituras) e cada consulta filtra `user_id` nela mesma.
  Nenhuma migration, nenhum índice novo.
- Verificação em Postgres real: `packages/database/test-support/run-live-status-checks.ts`, ligada ao `database-test`
  (`checkLiveStatusReads`): 30 decisões com velas gravadas, duas páginas de 24 + 6 sem repetir (concatenadas = a lista inteira),
  cursor só quando há mais antigas, junção com o fechamento e o `close_time` certos, posições que cruzam a faixa (fechada que
  atravessa, aberta e compra e venda na mesma vela), pontinhos em ordem crescente com `LIMIT`; dono alheio recebe vazio nas
  quatro leituras; decisão sem vela vira erro.
- Banco usado: `embedded-postgres` do WSL (`~/pg-scratch/data-008`, porta 56436, fora do repositório; nenhum container
  e nenhum volume do Docker tocado).

```text
~/pg-scratch/pgctl-008.sh start · bun run --cwd packages/database db:database-test (DATABASE_URL=...:56436)
database-test: ao vivo: último ponto, 30 decisões em duas páginas decrescentes com junção em candles, posições que cruzam
  a faixa e pontinhos; dono alheio recebe vazio nas quatro leituras
database-test: OK
WSL ~/gates/ativada-spec8: typecheck verde · lint verde · format:check verde
bun test (ownership-registry, strategy-engine-boundary, code-size-limits, app-import-boundary, api-openapi, api-runs,
api-run-chart): 157 pass, 0 fail
```

## T1.4 — `GET /v1/runs/:runId/live-status` e `GET /v1/runs/:runId/decisions` (sonnet, 2026-10-14)

- Rotas em `apps/api-ativada/src/runs/live-status/` (`live-status.route.ts`, `run-decisions.route.ts`, `*.docs.ts`, o esquema Zod
  de saída em `live-status.schema.ts`, os casos de uso `live-status.use-case.ts` e `run-decisions.use-case.ts`, e as peças
  `live-status-context.ts` / `live-status-sections.ts` / `live-status-triggers.ts` / `decision-view.ts` / `decision-page.ts`).
  `access: USER`, `documentation` declarada, entrada `z.strictObject` (o `live-status` não aceita nenhum parâmetro; as decisões
  aceitam `limit` 1 a 100, padrão 24, e `cursor` opaco `encodeTimeCursor`) e política `RUN_LIVE_STATUS` de 60/min por usuário,
  um balde só para as duas rotas. `409 RUN_NOT_LIVE` (código novo em `RUN_ERROR_CODE`) para backtest e walk-forward do dono;
  alheia, inexistente, apagada ou malformada = o mesmo `404 RUN_NOT_FOUND`; `400` com todos os erros e sem eco.
- Custo: o `live-status` faz 5 consultas por chave e com LIMIT (execução, versão da estratégia, último ponto, página de decisões
  com a junção em candles e posições que cruzam a página); as decisões fazem 4. As três do meio vão em `Promise.all` só depois da
  execução do dono (sem parte opcional: falha em qualquer uma é 500, por isso não é `allSettled`). Sem cache no servidor.
- `nextDecisionAt` reusa a vela devida da spec 006 (`findDueAt` de `stall-policy.ts`, agora exportada com parâmetros mínimos).
- Harness: `loadApiApp()` ganhou as rotas, o repositório em memória das leituras novas (`in-memory-live-status.fixture.ts`) e o
  contador de consultas por pedido (`harness.queries`); cenários em `test/fixtures/live-status/live-status-scenario.fixture.ts`.
- Contratos (`test/api-run-live-status.contract.test.ts`, 30 testes): o exemplo da spec sem compra, gatilhos regra por regra,
  linha por vela com voto e leitura, cursor sem repetir nem perder, `limit` 1/7/100, nenhuma frase com data ou hora, sem vela,
  aquecendo (Donchian com uma linha), comprada (posição aberta, alvo, stop, comprou/vendeu/esperou comprada), parada, concluída,
  na fila e com falha, com meta (prazo = início + 7 dias), com desfecho e sem meta, esquema documentado, 5 e 4 consultas, 401,
  404 idêntico entre usuários/inexistente/malformado/apagado, 409 em backtest e walk-forward, 400 com todos os erros sem eco,
  429 no 61º pedido (balde compartilhado). `api-openapi` ganhou os dois caminhos no 429 e o par 404/409.

```text
WSL ~/gates/ativada-spec8b: typecheck verde · lint verde · format:check verde
bun test (live-status + api-openapi + api-run* + ownership-registry + strategy-engine-boundary + code-size-limits +
app-import-boundary + frases e contas da T1.1/T1.2): 449 pass, 0 fail
```

## T1.5 — `decisions` opcional no `/chart` (sonnet, 2026-10-14)

- `GET /v1/runs/:runId/chart` ganha `decisions: [{ candleTime, closedAt, action, outcome, score, scoreThreshold }] | null`
  (`chart-decisions.ts`, ADR 0002 L16): só na `live_paper`, uma linha por vela da faixa efetiva `[from, to)`, crescente, esperas
  incluídas; `null` em backtest, em walk-forward e quando a faixa tem mais de 500 velas. A conta `(to − from) ÷ duração > 500`
  é feita sem consulta: acima do teto o banco nem é lido. Até 500: uma leitura de `signals` (`LIMIT 501`) e uma das posições que
  cruzam a faixa, mais a versão da estratégia para o limiar de cada vela (compra livre, venda comprada); a `live_paper` sem
  vela fechada devolve `[]`. Campos antigos intactos; a política de taxa do `/chart` segue `RUN_CHART` (30/min).
- Contrato novo `test/api-run-chart-decisions.contract.test.ts` (faixa inteira e recortada, compra/venda/espera comprada com o
  limiar certo, 500 velas passam, 501 e "500 velas + 1 ms" viram `null`, sem consulta acima do teto, `[]` antes da primeira
  vela, backtest e walk-forward `null` sem ler as decisões, esquema documentado, 404 entre usuários); o contrato antigo
  `test/api-run-chart.contract.test.ts` continua verde sem edição.

```text
WSL ~/gates/ativada-spec8b: typecheck verde · lint verde · format:check verde
bun test (T1.1 a T1.5 + api-run* + api-openapi + ownership-registry + strategy-engine-boundary + code-size-limits +
app-import-boundary): 460 pass, 0 fail
```

## T1.6 — Mutantes do acompanhamento (sonnet, 2026-10-14)

- `test/api-run-live-status-mutants.contract.test.ts` (alvo `LIVE_STATUS_MUTANT_TARGET` em
  `test/fixtures/api-routes/api-routes-mutation.fixture.ts`; padrão do `api-run-chart-mutants`, cópia do `src` da API julgada
  por `API_ROUTES_APP_SOURCE`, o primeiro teste que falha mata o mutante): **50 mutantes, todos mortos**, mais o controle (a
  cópia sem edição passa). Famílias: dono e acesso (404 que vira outro erro, 409 `RUN_NOT_LIVE` removido ou virado 404, rotas
  públicas, `decisions` do gráfico para backtest e walk-forward); validação e limites (query aberta, `limit` sem teto de 100,
  página padrão que não é 24, `limit` e cursor ignorados, cursor nunca devolvido, cursor sem validar, `RUN_LIVE_STATUS` ausente em
  cada rota ou com limite errado, teto de 500 velas do gráfico por uma a mais, removido ou com mais de 500 pontinhos mantidos);
  arredondamento e conta (taxa para cima, saldo no lugar do benchmark, faixa do empate larga, bordas de `acima`/`abaixo`, o que
  falta para baixo, o que cabe para cima, `remainingAmount` e `lossRoomAmount` negativos, prazo contado de agora, direções
  trocadas no formato, cada direção das frases); frases e estados (limiar de venda na frase de compra, a carteira nas bordas da
  vela de compra e de saída, precedência `not_running`, `no_candle` dito como aquecendo, estado sempre aguardando entrada,
  posição aberta que é a fechada, canal anterior do Donchian trocado ou inventado, dado gravado que não é número mantido,
  sentimento descartado).
- Três mutantes sobreviveram na primeira rodada e viraram testes: arredondamento do que falta/cabe com saldo de mais de 8 casas
  (`test/live-goal-progress.contract.test.ts`, dado sujo) e leitura gravada em texto no lugar do RSI
  (`test/api-run-live-status.contract.test.ts`, nas decisões); a carteira nas bordas ganhou teste próprio.
- `scripts/api-runs-mutants.ts`: +4 filtros de dono dos repositórios novos (`LIVE_LATEST_EQUITY_POINT_READS_EVERY_OWNER`,
  `LIVE_DECISION_ROWS_READ_EVERY_OWNER`, `LIVE_POSITIONS_AROUND_READ_EVERY_OWNER`, `LIVE_DECISION_MARKERS_READ_EVERY_OWNER`); o
  juiz `route-isolation-test` passou a rodar `checkLiveStatusReads`. Rodado no Postgres embutido do WSL (porta 56436, fora do
  repositório; o `make api-runs-mutants` sobe o Docker de `ENV=test`, que outro executor usa): **25 mutantes de filtro de dono
  reprovados** (21 antigos + 4 novos), controle passa. O texto do alvo `api-runs-mutants` no `Makefile` passou de 21 para 25.
- O `api-run-chart-mutants` (spec 005) continua verde com a rota nova (38 testes).

```text
~/pg-scratch/pgctl-008.sh start · DATABASE_URL=...:56436 bun run scripts/api-runs-mutants.ts
api-runs-mutants: OK - 25 mutantes de filtro de dono reprovados
WSL ~/gates/ativada-spec8b: typecheck verde · lint verde · format:check verde
bun test (live-status, chart-decisions, api-run*, api-openapi, database.contract, ownership-registry, strategy-engine-boundary,
code-size-limits, app-import-boundary, frases e contas, mutantes do acompanhamento e do gráfico): 566 pass, 0 fail
```

## T2.1 — Zod espelhado e consultas do acompanhamento (haiku, 2026-10-14)

- `apps/frontend-ativada/src/runs/live-tracking/live-status.validation.ts`: `liveStatusSchema`, `decisionSchema` e os tipos
  (`Decision`, `DecisionVote`, `RuleTrigger`, `LiveGoal`, `LiveStatus`) espelham o `live-status.schema.ts` da API (ADR 0002 L4 a
  L13): dinheiro e taxa só em `decimalText` (número, `NaN` e notação científica reprovam), `triggers` em união por `status`
  (`available` / `unavailable`), voto só `-1 | 0 | 1`, desfecho, ação e comparação em enums fechados.
- `live-status.query.ts`: `useLiveStatusQuery` (`['runs', runId, 'live-status']`) e `useDecisionsQuery` (`['runs', runId, 'decisions']`,
  `useInfiniteQuery` com `limit=24` e cursor); as duas sob a raiz `runs`, então o aviso do stream as refaz.
- `trade-chart.validation.ts`: `chartDecisionSchema` e `decisions` no `tradeChartSchema` (`nullable().default(null)`: resposta de
  API sem o campo vale como `null`, os contratos antigos do gráfico seguem sem edição).
- Contrato `test/live-status-queries.contract.tsx` (na lista explícita do `package.json`, fixtures em
  `test/support/live-status-fixtures.ts`): formato do servidor com e sem meta/posição, variante `unavailable`, rejeições (dinheiro
  número, `NaN`, `1e5`, voto 2, desfecho inventado, `status` desconhecido), resposta inválida acaba em erro e nada é desenhado,
  chaves começam com `runs`, 24 por página sem cursor na primeira.

```text
WSL ~/gates/ativada-spec8: typecheck verde · lint verde · format:check verde
panel-test: 690 pass, 0 fail (53 arquivos)
```

## T2.2 — Glossário do acompanhamento (haiku, 2026-10-14)

- `src/glossary/glossary.constant.ts` ganha seis termos do catálogo fechado: `candle` (Vela), `score` (Pontuação do placar),
  `threshold` (Limiar), `buyAndHold` (Comprar e segurar), `stopPrice` (Stop) e `targetPrice` (Alvo), cada um com UMA frase de uma
  linha em português simples (≤ 120 caracteres, termina em ponto).
- `test/glossary.contract.ts` (já na lista do `package.json`): os rótulos agora são os doze, as frases continuam de uma linha, sem
  quebra, sem rótulo nem frase repetidos, e um teste novo fixa o texto literal dos seis termos novos.

```text
WSL ~/gates/ativada-spec8: typecheck verde · lint verde · format:check verde
panel-test: 691 pass, 0 fail (53 arquivos)
```

## T2.3 — Texto das decisões (sonnet, 2026-10-14)

- `apps/frontend-ativada/src/runs/live-tracking/decision-text.ts` (puro, `BigInt`, sem `Number`): `formatClosingMoment` (hora do
  FECHAMENTO no fuso do usuário, "08:00 de hoje" / "23:00 de ontem" / data completa, pelo `formatRelativeMoment` do painel),
  `formatScoreOfThreshold` ("1 de 2", vírgula pt-BR, até 2 casas), `formatUsdt` (dinheiro na direção do campo no servidor: saldo,
  resultado e "ainda cabe" descem; perda e "falta" sobem), `formatDirectedPercent` (taxa de 12 casas do servidor vira % de 2 casas
  arredondada para baixo ou para cima, em `BigInt`) e `describeLiveResult` (resultado desce sempre; zero exato sai "= 0,00 (0,00%)"
  com tendência `flat`, o cinza do redesenho aprovado).
- Contrato `test/decision-text.contract.ts` (na lista explícita do `package.json`): `America/Sao_Paulo` e `America/New_York`
  (a mesma vela é "ontem" num fuso e "hoje" no outro), virada do dia às 00:00 local (23:59 x 00:00), data completa acima de
  ontem, pontuação "1 de 2" com negativo e arredondamento, dinheiro com 16 dígitos inteiros (acima de 2^53), as duas direções de
  arredondamento (ganho, perda, centésimo de ponto percentual), texto que não é decimal vira "—", e uma varredura do código-fonte
  que reprova `Number(`, `parseFloat`, `parseInt`, `toFixed` e `Math.`.

```text
WSL ~/gates/ativada-spec8: typecheck verde · lint verde · format:check verde
panel-test: 710 pass, 0 fail (54 arquivos)
```

## T3.1 — Cartão "Acompanhamento": saldo, comparação e meta (sonnet, 2026-10-14)

- `src/runs/live-tracking/`: `LiveTrackingSection` (topo do detalhe `live_paper`), `LivePulseLine` (linha de pulso reutilizável: Rodando · preço · última decisão · próxima em mm:ss · "servidor respondeu há N s"), `LiveTrackingCard` com `LiveBalanceBlock` (saldo, resultado com ícone + sinal, comprar e segurar com `Term`, frase do servidor), `LiveTradesState` (estado vazio que ensina no lugar dos zeros; "Aguardando a primeira vela") e `LiveTrackingNotices` (vela, olhar de 1 h, dinheiro fictício); `LiveGoalBlock` + `GoalMeterRows` (alvo, prazo no fuso, quanto falta, ganho/tempo/perda com `<progress>`, selo "Abaixo do ritmo"/"No caminho" com o ritmo linear explicado, desfecho troca o bloco). Contas em `goal-text.ts` só com `BigInt` (ganho e tempo para baixo, perda para cima); o prazo vem de `deadlineAt` e `periodStart` (ADR 0002 L8).
- Detalhe: `LivePaperBody` (rodando, na fila, parada ou concluída; falha segue como antes); `TradeChartCard` ganhou `hasSummary` (o resumo mora no cartão) e agora aparece também na simulação parada e na concluída. `Card` ganhou `icon`, `aside` e `id`; `Icon` ganhou `size` e os ícones do redesenho; tokens de escala (`--text-*`, `--radius-*`, `--space-*`) em `global.css`.
- Contratos: `test/live-tracking-card.contract.tsx` (números do fixture, zero cinza com "=", estado vazio sem "Total pago"/"Compras", meta 16 h depois do início com `setSystemTime`, "No caminho", desfecho, sem meta o bloco some, simulação cancelada, nenhum `style=` nos componentes), `contrast` (+ `warn` sobre `surface`, barras sobre `surface-2`) e `touch-targets` (+ `.link`).
- Limitação registrada: o painel não recebe o batimento do worker; "Simulador ativo · servidor respondeu há N s" usa a última resposta do `GET /v1/runs/:id` (consultado a cada 2 s enquanto roda). Um campo de batimento na API ficaria para uma spec própria.
- **T3.4 (pontinhos "esperou" e níveis no gráfico) ADIADA para a spec 009 por decisão do usuário; nada dela foi feito aqui.**

```text
WSL ~/gates/ativada-spec8: typecheck verde · lint verde · format:check verde
panel-test: 727 pass, 0 fail (55 arquivos)
```

## T3.2 — Tabela "O que a estratégia decidiu" (sonnet, 2026-10-14)

- `DecisionsTable` (uma `<table>` com `<caption>`, cabeçalho com o fuso, empilhada por CSS abaixo de 700 px como no redesenho), `DecisionRow` (hora do fechamento com "hoje"/"ontem", preço, selo ícone + palavra "Esperou"/"Comprou"/"Vendeu", pontuação "−2,5 de +2", frase do servidor), `DecisionVotes` (botão "ver votos" com `aria-expanded`; cada regra com sinal, palavra "a favor"/"contra"/"neutra" e leitura; "Detalhe técnico" recolhido com o `reason` do motor) e `DecisionRunGroup` (velas seguidas iguais agrupadas: "Mostrar 13 horas iguais"). `decision-groups.ts` agrupa e junta páginas sem repetir vela.
- "Ver decisões anteriores": o `live-status` traz as 24 mais novas; o primeiro pedido das anteriores (`useDecisionsQuery`) leva 48 (as 24 já mostradas mais 24 novas) e os seguintes 24 pelo cursor. Assim a consulta refeita pelo aviso do stream percorre as páginas do começo e nunca deixa buraco. `formatScoreOfThreshold` passou a escrever sinal explícito ("+1 de +2", "−2,5 de +2", venda "−1 de −2"), como no redesenho (teste da T2.3 atualizado).
- Contrato `test/live-decisions-table.contract.tsx`: ordem e frases, teclado/`aria-expanded`, votos com sinal e palavra, agrupamento, paginação por cursor (limites 48 e 24, botão some no fim), aviso do stream acrescenta a linha do topo; `touch-targets` (+ `.expand`, `.more`). Limitação: a tabela empilhada a 375 px é conferida por CSS (classe) e na rodada final no navegador; o happy-dom não calcula media query.

```text
WSL ~/gates/ativada-spec8: typecheck verde · lint verde · format:check verde
panel-test: 738 pass, 0 fail (56 arquivos)
```
