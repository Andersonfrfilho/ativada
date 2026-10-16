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

## T3.3 — "O que falta para comprar agora" e estados (sonnet, 2026-10-14)

- `NextTriggersBlock`: título "o que falta para comprar/vender agora" conforme a carteira, régua do placar em SVG (`ScoreboardRuler`, `scoreboard-scale.ts` puro: de −limite a +limite, no mínimo ±4, até a soma dos pesos), a frase do servidor e, por regra, valor de hoje, o que precisa ("fechar acima de 13,10") e a distância em % marcada "exata" ou "aproximada" (`trigger-text.ts`), com o voto de hoje por ícone + sinal + palavra; indisponível (`no_candle`, `warming_up`, `not_running`) mostra a frase do porquê, sem tabela. Texto fixo "Isto não é previsão: o preço pode nunca chegar lá…". Termos do glossário (`Term`) em "pontuação do placar" e "limiar". Estado vazio e avisos já estavam na T3.1; nenhum "0,00" aparece sem a frase ao lado (teste).
- Contrato `test/live-next-triggers.contract.tsx`: régua (valores do redesenho 18,75% e 75%), contagem regressiva e idade, textos de condição e distância, os estados aguardando entrada/comprada/sem vela/parada/aquecendo e a linha de pulso (rodando, última decisão, próxima, parada sem relógio).

```text
WSL ~/gates/ativada-spec8: typecheck verde · lint verde · format:check verde
panel-test: 751 pass, 0 fail (57 arquivos)
```

## T3.5 — Visão geral com a última decisão e a meta do servidor (sonnet, 2026-10-14)

- `BalanceCard` ganhou `LastDecisionLine`: "Última decisão: esperou às 10:00. <frase do servidor>" e o link "Ver o acompanhamento" (`/backtests/:runId#acompanhamento`); a Visão geral abre com a `LivePulseLine`. `ActiveGoalCard` agora só pede o `live-status` e mostra o `LiveGoalBlock` (título "Meta: +3% em 7 dias", selo "Abaixo do ritmo"/"No caminho", ritmo linear explicado); a faixa de parada completa continua só no cartão de saldo e a linha de pulso diz "Parada".
- `src/goals/goal-progress.ts` (cálculo em `Number`) saiu do código; nenhum teste dele existia à parte. `goals.contract.tsx` e `live-run-status.contract.tsx` foram reescritos para a meta do servidor (66% de ganho com saldo de 10.200 e meta de 300; "No caminho"/"Abaixo do ritmo"; desfecho "Meta alcançada"; antes da primeira vela a meta ainda mostra o que falta) e ganharam o teste da linha "Última decisão".

```text
WSL ~/gates/ativada-spec8: typecheck verde · lint verde · format:check verde
panel-test: 752 pass, 0 fail (57 arquivos)
```

## T3.5b — Decisões do redesenho fora do tasks.md: veredito, lista agrupada e cartão ao vivo (sonnet, 2026-10-14)

- Veredito do ranking: a tela escreve "Favorável/Neutro/Desfavorável no histórico" com ícone (seta para cima, igual, seta para baixo) no lugar de COMPRAR/SEGURAR/EVITAR; o valor da API não mudou (`VERDICT_LABEL` em `goal.constant.ts`); explicações e o fluxo E2E de metas acompanham.
- Backtests: `LiveRunCard` no topo (simulação rodando, linha de pulso e "Acompanhar" até `#acompanhamento`); a lista de backtests virou grupos recolhíveis (`<details>`) por versão da estratégia (`GroupedRunList`, `run-groups.ts`) com resumo ("1 de 3 positivos", mediana, melhor e pior par), caixa de seleção em coluna própria de 44 px e resultado como barra a partir do zero (SVG, escala de −20% a +20%) + seta + sinal; zero é cinza com "=". Linha de pulso também na tela da meta, quando há simulação ativa dela.
- **Limitação registrada:** a lista é paginada (20 por vez); o agrupamento e o resumo valem para o que está carregado ("Carregar mais" acrescenta). Os filtros por estratégia e a ordenação clicável do redesenho NÃO foram feitos (não estavam no `tasks.md`); a Visão geral manteve o desenho dela (sem as barras de comparação) além da linha de pulso, da última decisão e da meta do servidor.
- Contratos: `test/backtests-groups.contract.tsx` (agrupar, resumir, lista agrupada, cartão ao vivo), `backtests.contract.tsx` e `goals.contract.tsx` ajustados; `touch-targets` (+ `.pick` e `.pairLink` do grupo).

```text
WSL ~/gates/ativada-spec8: typecheck verde · lint verde · format:check verde
panel-test: 758 pass, 0 fail (58 arquivos)
```

## T3.6 — E2E do acompanhamento (haiku → feito em sonnet, 2026-10-15)

- Servidor de controle (`scripts/panel-e2e/control-server.ts`): rota nova `/decision` grava, no papel do worker, a vela (com "agora" adiantado no repositório, a rota de decisões lê o fechamento pela chave), o ponto de patrimônio (10.500,00), um sinal HOLD com votos e leituras reais do Placar clássico e dá o `pg_notify` de `signal` e `balance`. O seed e o `/signal` antigos gravavam `votes: {}` e `indicators: {}`; a rota nova leu isso como dado inválido (500) e como "vela ausente", então agora gravam votos em lista, leituras por saída (`rule:ema-9-21.fast`, `regime:adx.adx`…) e a vela da hora (`panel-e2e-decision.constant.ts`).
- Teste novo em `e2e/panel.e2e.ts` + `flows/live-tracking.flow.ts`: Visão geral → "Ver o acompanhamento" (`#acompanhamento`) → saldo sem 10.500,00 → `/decision` → o saldo e a primeira linha da tabela mudam sozinhos ("Esperou", "0 de +2"), a linha de pulso diz "Última decisão" e "ver votos" abre os votos e o "Detalhe técnico". Dois fluxos antigos acompanharam a tela: o resumo das operações agora é lido no cartão "Acompanhamento" e a meta ativa é o cartão "Meta: +3% em N dias" (sem o texto de primeira vela, coberto no contrato do painel).
- Limite de 120 requisições por minuto: a tela ao vivo faz mais consultas e o teste de setas e o novo ganharam a pausa de 50 s que os outros já tinham (sem ela o `429` deixa a seta e o saldo velhos).
- Rodada: containers de TESTE (`ativada-test-*`, `docker compose --env-file envs/env.test`) subidos e derrubados com `--volumes` ao fim (conferido: só `ativada-dev-*` seguem de pé, intocados); `bun` do WSL rodando `scripts/panel-e2e.ts` com o Edge (`PANEL_E2E_BROWSER_CHANNEL=msedge`, `PANEL_E2E_PLAYWRIGHT_BIN` = `playwright.exe`, shim de `vite`, como na rodada de Docker real da spec 006; o `make` não existe no Windows).

```text
panel-e2e: OK — 22 passed (3.7m), incluindo "celular: sem rolagem horizontal em nenhuma tela do painel"
WSL ~/gates/ativada-spec8: typecheck verde · lint verde · format:check verde · panel-test: 758 pass, 0 fail
```

## Conferência final da Fase 3 no app dev (2026-10-15)

API dev reiniciada (a que rodava era anterior às rotas `live-status` e `decisions`; só o processo da API, nenhum container) e painel dev no ar em `http://127.0.0.1:56100`, usuário de teste local. Verificado por texto no Edge: detalhe da simulação LINK/USDT (linha de pulso, Acompanhamento, o que falta, meta com ritmo, gráfico, tabela com grupos "Mostrar N horas iguais" e "Ver decisões anteriores"), Visão geral (pulso, "Última decisão: esperou às …", "Ver o acompanhamento") e lista de Backtests (cartão ao vivo, grupos com "N de M positivos"). Sem rolagem horizontal a 375 px e a 1280 px (`scrollWidth` = largura da janela). Captura única: `specs/008-acompanhamento-ao-vivo/capturas/fase3-detalhe-1280-claro.png`. A conferência a 375 px no tema escuro e a revisão de design completa ficam na T4.1.

## T4.1 — Revisão de design contra os previews (sonnet, 2026-10-15)

Painel real conferido contra `docs/preview/redesign/` por texto (Playwright + Edge, usuário local `teste`) em 375 px e 1280 px, tema claro e escuro, na Visão geral, em Backtests e no detalhe da simulação ao vivo. Uma captura final: `capturas/fase4-visao-geral-375-escuro.png`.

- **(a) Barras de comparação na Visão geral.** `ComparisonBars` (novo) no `BalanceCard`: "Sua simulação" e "Comprar e segurar" em barras a partir do zero, na mesma escala (3%, 5%, 10%, 20%, 50% ou 100%, a menor que cabe nas duas), seta + sinal + número em cada uma e a legenda "teria hoje N USDT". Reusa `RunResultBar`, que ganhou `scaleLimit` (padrão −20% a +20%). Contas só com `BigInt` (`divideFloor`), nada de `Number` em dinheiro; os campos "Resultado" e "Comprar e segurar" da grade antiga saíram do cartão (agora estão nas barras), "Inicial" virou a frase "Começou com N USDT".
- **(b) Lista de backtests.** Filtro por estratégia (botões `aria-pressed` com ícone de marca, vários ao mesmo tempo, o último não desliga) e ordenação do cabeçalho "Resultado" que alterna decrescente → crescente → neutro (ordem da API), com `aria-sort`, seta e frase para leitor de tela. Os dois moram na URL: `?strategy=<id>&strategy=<id>` e `?order=asc|none` (decrescente é o padrão e não escreve nada). A grade empilhada a 375 px mantém só o cabeçalho de ordenação visível (antes o `thead` sumia). `summarizeGroup` agora acha melhor e pior pelo valor, não pela posição (a ordem ficou escolhível).
- **(c) RunProgressCard.** Como no mockup, a simulação ao vivo não tem barra de andamento: o cartão (no fim da tela, depois das decisões) mostra o estado, a frase "Cancelar encerra a simulação de vez; o histórico fica guardado." e o botão vermelho com ícone de parar "Cancelar simulação". Backtest e walk-forward mantêm a barra e o texto "Cancelar execução", agora também vermelho com ícone. Nada de cancelar foi perdido (contrato `backtests.contract.tsx` e `live-run-status.contract.tsx` intactos).
- **(d) Contraste e alvos.** Varredura automática dos CSS (cor e fundo na mesma regra) achou um par novo sem contrato: `on-accent` sobre `sell` (botão vermelho) entrou em `test/contrast.contract.ts` (4,5:1 nos dois temas). Alvos de 44 px novos em `test/touch-targets.contract.ts`: `.sortButton`, `.groupSummary`, `.chip` do filtro. No navegador, só as caixas de seleção da lista medem 24 px; o alvo clicável é o `<label>` de 44 px que as envolve (já era assim).
- **(e) 375 px, foco, estado.** Sem rolagem horizontal (`scrollWidth` = largura da janela) na Visão geral, em Backtests e no detalhe, nos dois temas e nos dois tamanhos. Foco visível (contorno de 2 px) em todos os controles percorridos por Tab; achado e corrigido: o campo de data não mostrava contorno (o `:focus-visible` não casa no campo composto), agora `input[type='date']:focus-within` em `global.css`. Estado segue ícone + palavra + cor (selo "Esperou", setas e sinais, "Abaixo do ritmo").
- **(f) Estilo inline e movimento.** Nenhum `style=` nos componentes e nenhum atributo `style` no DOM; o único CSS com `transition`/`animation` é o `global.css`, com o bloco `prefers-reduced-motion`. Agora prendido por `test/design-review.contract.ts` (varre `src/` e reprova arquivo de estilo novo com movimento sem o próprio bloco).
- Testes novos (na lista explícita do `package.json`): `backtests-view.contract.tsx` (ordem, melhor/pior, filtros, URL, último filtro, ciclo do cabeçalho), `overview-comparison.contract.tsx`, `design-review.contract.ts`. `version-index.contract.tsx` passou a aceitar o nome da estratégia também no botão de filtro.

**Pendências explícitas (não couberam):**
1. Filtro e ordenação valem só para o que está carregado (20 por vez): a API de `GET /v1/runs` não tem filtro por versão nem ordenação por resultado. Pedir `sortBy`/`strategyVersionId` na API fica para uma spec própria (web.md §7 pede isso no contrato do BFF para base grande). "Selecionar todos" no cabeçalho e "Limpar filtros" não existem (a comparação aceita só 2 execuções).
2. A Visão geral não repete a frase de veredito do preview ("Você está N pontos acima de quem só comprou e segurou…"); ela mora no cartão "Acompanhamento" do detalhe. O gráfico "Saldo hora a hora" com a linha de comparação também não foi levado para a Visão geral.
3. Caixas de seleção nativas têm 24 px (alvo de 44 px pelo rótulo); trocar por controle próprio não foi feito.

```text
WSL ~/gates/ativada-spec8: typecheck verde · lint verde · format:check verde
panel-test: 775 pass, 0 fail (61 arquivos)
```

## T4.2 — CLAUDE.md (sonnet, 2026-10-15)

- **Bloco duplicado removido.** O arquivo tinha 678 linhas: a partir da linha 340 o texto inteiro vinha colado de novo, no meio do item (6) da spec 006 ("…sem `source`, então `" seguido de "# CLAUDE.md"). Conferido por comparação de texto antes de apagar: as 339 primeiras linhas eram um prefixo EXATO da segunda cópia, exceto por dois pontos no item (6) da spec 006. A primeira cópia trazia a frase "quem loga é cada laço pela guarda `createDatabaseOutageGuard`…" (que a segunda perdera) e a segunda trazia o fim do item e as frases "(2)" a "(7)" (que a primeira cortava); o trecho "`dev-down` nunca apaga volume … então `$`" só existia na primeira. Ficou UMA cópia (343 linhas), a segunda completa mais a frase da primeira e o trecho do item (6) reconstituído. Causa provável: um `String.replace` com texto contendo "$`", que o JavaScript expande para "tudo o que veio antes".
- **Atualizado:** parágrafo "Estado" (spec 008 e a T3.4 que passou para a spec 009); na seção do painel, o bullet "Acompanhamento ao vivo" (linha de pulso, cartão "Acompanhamento", "o que falta", meta do servidor, tabela de decisões, saída do `goal-progress.ts`, glossário de 12 termos, Visão geral com barras de comparação, lista de backtests agrupada com filtro e ordenação na URL, revisão de design e E2E); nas regras, o bullet da API (`GET /v1/runs/:runId/live-status`, `/decisions`, campo `decisions` do `/chart`, de onde vêm os dados, paridade, frases do servidor, arredondamento, ≤ 5 consultas, mutantes); o veredito do ranking agora é Favorável / Neutro / Desfavorável "no histórico".

```text
prettier --check CLAUDE.md: verde
git diff CLAUDE.md: +5 −341 (as 5 são os bullets e frases novos; as 341 são a cópia repetida e as linhas reescritas)
```

## Correções da revisão final (sonnet, 2026-10-15)

Aplicadas as correções da revisão final (opus) em dois commits (API e banco; painel) mais este de documentação. Nada em `packages/strategy-engine` nem `packages/run-recording`; sem migration.

**API e banco (commit `fix(api)`).**
- **A1 [ALTO] saída por alvo, stop, lacuna e comando.** O `outcome` ganhou `exited`: vale a vela em que uma posição fechou (`closed_candle_time = t`) com `exit_reason` diferente de `signal`, lido de `PositionInput.exitReason`, que já estava em memória (nenhuma consulta nova). Frases fechadas, com teste literal: "Vendeu no alvo (11.800,50).", "Vendeu no stop (95,50).", "Saiu pela lacuna de dados.", "Saiu porque a meta terminou.". O `/chart` e o Zod do `live-status` (`z.enum(DECISION_OUTCOME)`) herdam o valor; o Zod do painel foi espelhado. Módulo novo `decision-candle-state.ts` (`readCandleState`, `isHoldingAt`).
- **M1 "Comprou" sem preenchimento.** BUY na vela `t` só é `bought` se existe posição com `opened_candle_time = t + duração`; na última vela decidida é `buy_pending` ("Pediu compra: executa na abertura da próxima vela."); senão `waited` com "Sinal de compra sem execução.". Para a posição que abre na vela seguinte não ficar de fora da leitura, a faixa de `listPositionsAround` passou a ir até `mais nova + duração` (decisões e `/chart`; teste com a página seguinte por cursor). A contradição do estado vazio do painel ("Nenhuma compra ainda" com pedido pendente) está no commit do painel.
- **M4 §15.** `readChartDecisions` saiu do `Promise.all` do caminho crítico (`run-chart.use-case.ts`): falha vira `decisions: null`, sem log (sem PII); contrato novo em `api-run-chart-decisions` (spy em `listDecisionMarkers`).
- **Baixos da API.** Posições lidas da MAIS NOVA para a mais antiga (`ORDER BY opened_candle_time DESC`: o corte do `LIMIT` nunca descarta a aberta; `POSITIONS_BEYOND_THE_PAGE` 2 → 3; teste no Postgres em `run-live-status-checks.ts`); `row.action` validada por guarda (`toSignalAction`, sem `as`); ramo morto do `holder.vote.vote === 1` trocado por um type guard; gatilho de preço diz "no último fechamento" em vez de "hoje" (o `current` é o fechamento, não o preço de agora). ADR 0002 ganhou a linha L21.
- 6 mutantes novos em `api-run-live-status-mutants` (saída por sinal contada como saída, compra sempre preenchida, última vela nunca pendente, faixa sem a vela seguinte, falha das decisões derrubando o gráfico; os dois de `holding` foram para `decision-candle-state.ts`).

**Painel (commit `fix(painel)`).**
- **A1/M1:** `OUTCOME_LOOK`/`OUTCOME_WORD` com "Pediu compra" e "Saiu"; `LiveTradesState` troca o título para "Compra pedida: executa na abertura da próxima vela" quando a decisão mais nova está pendente; o `live-status` mais novo agora vence a página antiga em cache na junção (`mergeDecisions([older, status])`).
- **M2:** `roundRateDownToPercent`/`formatSignedPercentDown` (`roundScaledDirected(rate × 100, 2, 'down')`); `RunResultBar` escolhe seta, cor e texto pelo valor já arredondado (zero vira "= 0,00%"), e `GroupedRunList` e `ComparisonBars` herdam. Os outros usos de `formatSignedScaledPercent` (ativos, marcadores) não mudaram.
- **M3:** `StaleDataNotice` ("Não foi possível atualizar agora; dados de há N s."): com dado em cache e `isError`, `LiveTrackingSection` e `ActiveGoalCard` mantêm a tela; o erro cheio só aparece sem dado.
- **M5:** "Painel atualizado há N s" (sem afirmar que o simulador está ativo); o nome da região da linha de pulso acompanha o estado (rodando, parada, aguardando dados, na fila).
- **M6:** `createRefetchScheduler` (`src/live/refetch-scheduler.ts`): avisos do mesmo assunto viram UMA rebusca 500 ms depois do último, e as páginas de `['runs', id, 'decisions']` só ficam obsoletas (`refetchType: 'none'`).
- **Baixos do painel:** `DecisionRunGroup` mostra dia e hora (`formatRelativeMoment`); "Abaixo do ritmo" só depois da primeira vela fechada (`balance.observedAt`) e com tolerância (ganho < 90% do esperado em linha reta); voto de peso 0 diz "fora (filtro de tendência)"; `formatDirectedPercent` usa o sinal "−"; "Processando a vela…" quando `agora ≥ nextDecisionAt` (no lugar de 00:00); `aria-controls` no botão do grupo (ids das linhas); "1 decisão mostrada"; cancelamento pelo usuário com `role="status"` e estilo neutro (falha segue `alert`); "teria hoje" para baixo (`formatDirectedMoney(…, 'down')`); `run-groups.ts` com `push` no array do Map.

**Questões abertas, sem mudar o comportamento além do citado.**
1. Vela ausente para uma decisão gravada continua sendo 500 (L12): é estado impossível, e omitir a linha esconderia o defeito.
2. Limiar de venda/compra com muitas casas: `formatPoints` mostra o número exato; limitar as casas não foi feito (mudaria a frase literal de L14 e não há limite de casas no `thresholds`). Fica para quando a validação da estratégia fixar um teto.
3. "desde" no cartão usa `periodStart` (a abertura da vela em curso na criação), não `started_at`: é a base do prazo da meta (L8), então os dois textos concordam; a diferença é de até uma vela.
4. A saída `command` diz "Saiu porque a meta terminou." também quando o comando foi `user_stop` ou `kill_switch` (a frase é a pedida na revisão; `PositionInput` só guarda `exitReason = command`, não o motivo do comando). Se isso incomodar, a correção é gravar o motivo ou ler `run_commands` (consulta nova), fora desta correção.

```text
WSL ~/gates/ativada-spec8 (espelho): typecheck verde · lint (meus arquivos) verde · format:check verde
API: live-decision-messages, api-run-live-status, api-run-live-status-mutants (+6), api-run-chart-decisions, api-run-chart*, api-openapi, ownership-registry, code-size-limits, live-trigger-messages, live-stored-readings-parity: verdes
database-test (Postgres embutido do WSL, porta 56436): OK
panel-test: 791 pass, 0 fail (61 arquivos)
```

## Correções de fidelidade

Data: 2026-10-15. Plano C1 a C10 de `comparacao-preview-vs-real.md`; painel dev real (Edge via Playwright, login Keycloak do usuário local, uma sessão por rodada), 1280 px claro e 375 px escuro. Notas antes e depois estão no fim do `comparacao-preview-vs-real.md`; capturas lado a lado (preview | real) em `capturas/fidelidade-*.png` (uma por tela principal).

| Task | Commit | Resultado |
|---|---|---|
| C1 grade e cabeçalho | `feat(painel): cabeçalho numa linha…` | `--page-width` 1200 px; `HeaderMenu` (botão Menu com `aria-expanded`, fecha ao navegar) abaixo de 1100 px; 61 px de altura do cabeçalho a 1280 px. Teste `header-menu.contract.tsx`. |
| C2 a C4 e C10 Visão geral | `feat(painel): Visão geral com cartão-herói…` | `BalanceHero`, `BalanceChart` (eixos, começo, "agora", legenda), `LatestDecisionsCard` (substitui `SignalsCard`, mostra "Esperou"), duas colunas; `running-for.ts` e `balance-axis.ts` puros com `balance-text.contract.ts`; pedido único de `GET /v1/runs` (teste: 1 chamada) |
| C5 gráfico | `feat(painel): gráfico de velas ajusta o zoom…` | `computeLastBarsWidth` (`visible-bars.contract.ts`); painel lateral `clamp(250px, 26%, 310px)`; canvas 560 px; tabela de operações com quebra de linha |
| C6 meta | `feat(painel): meta com pódio de 3…` | `RankingItem` pódio/linha, "Mostrar as N", `GoalSimulationCard`, situação das moedas |
| C7 metas | `feat(painel): lista de metas com apagar discreto…` | ícone `trash` com dica (`data-tip`, mesmo texto do `aria-label`), selo "Simulação rodando"; testes de pódio, expansão, simulação da meta e lista em `goals.contract.tsx` |
| C8 e C9 simulação | `feat(painel): simulação ao vivo mais curta…` | decisões antes da sala; 8 linhas iniciais e "Ver mais N decisões"; nota única (`role="note"`); régua com `<pattern>` hachurado |

```text
Gates (espelho WSL ~/gates/ativada-spec9): tsc do painel verde · eslint do painel verde (0 erros em apps/frontend-ativada)
prettier: arquivos do painel e da spec 008 sem aviso (os avisos restantes são de arquivos da spec 007, que não toquei)
panel-test: 1099 pass, 0 fail (88 arquivos); 2 arquivos de teste novos na lista explícita do script `test`
`bun run typecheck` da raiz e `bun run lint` da raiz falham só em arquivos da spec 007 (worker, packages/database, packages/risk-analyst, fixtures de teste); nenhum erro nos meus arquivos
Rede (Visão geral, 25 s): 1 GET /v1/runs?kind&limit (eram 2), sem 429, sem alerta de erro; 375 px sem overflow horizontal
```

Pendências: ver "O que ainda falta" por tela no `comparacao-preview-vs-real.md`; "Por que está assim" (recolhível de decisões de design), ícone de usuário no cabeçalho, abas do filtro do ranking e resumo em caixa tracejada da simulação ficam para uma próxima rodada.

## Filtro por par (sonnet, 2026-10-16)

**Problema.** Na tela de Backtests só aparecia LINK/USDT: o banco tem execuções de nove pares (BTC, ETH, DOGE, PEPE, SOL, XRP, BNB, LINK, SHIB), mas a lista carregava 20 por vez (mais novas primeiro) e filtrava só o que já estava na memória (pendência 1 da T4.1).

**API (`GET /v1/runs`).** Filtros opcionais e combináveis por E: `kind` (já existia), `symbol` (só par habilitado em `MARKET_SYMBOLS`) e `strategyVersionId` (UUID). Esquema em `runs/list-runs-query.schema.ts` (Zod, `strictObject`, 400 com todos os erros e sem eco do valor). O filtro entra no `WHERE` de `listRuns` junto do dono (`ownerCondition`) e ANTES do cursor, então a paginação segue por `(created_at, id)` dentro do filtro; uma consulta só, sem N+1. OpenAPI regerado da tabela (a rota passa o esquema como `query`).

**Provas.**
- `test/api-runs.contract.test.ts` (`loadApiApp()`): par, versão, filtros combinados, versão de outro dono (lista vazia), dono B só vê o dele, cursor dentro do filtro; 400 para `symbol` fora dos habilitados, vazio ou repetido e `strategyVersionId` que não é UUID, sem o valor na resposta.
- `test/api-routes-mutants.contract.test.ts`: dois mutantes novos (`RUN_LIST_IGNORES_THE_SYMBOL_FILTER`, `RUN_LIST_IGNORES_THE_STRATEGY_VERSION_FILTER`) reprovados.
- `make database-test` contra o Postgres embutido do WSL (porta 56448, descartável): o filtro por par/versão no SQL real traz só o do dono e a versão de outro dono não aparece. `scripts/api-runs-mutants.ts` no mesmo Postgres: "OK - 30 mutantes de filtro de dono reprovados" (incluído `RUN_LIST_SHOWS_EVERY_OWNER`).
- Gates no espelho Linux: contratos `api-runs`, `api-routes-mutants` e `api-openapi` (139 passam), lint e format da raiz limpos.

**Painel (`/backtests`).** Duas fileiras de chips acima das listas: "Filtrar por moeda" (Todas as moedas + uma por par de `VITE_MARKET_SYMBOLS`, rótulo curto "BTC") e "Filtrar por tipo" (Todos, Backtests, Walk-forward). Um par e um tipo por vez, no estado da URL (`?par=BTCUSDT`, `?tipo=walk_forward`; valor fora dos habilitados é ignorado). O par vai à API em `symbol` e entra na chave da consulta (`['runs','list',kind,symbol]`), então "Carregar mais" continua dentro do filtro; o tipo esconde a outra lista. Sob cada lista: "N carregadas · há mais" enquanto houver outra página e "N no total" quando a última foi lida (a API não devolve o total, então nenhum M é inventado). O resumo do grupo ("N de M positivos", mediana, melhor e pior) é do que foi carregado COM o filtro; o agrupamento por estratégia, o filtro por estratégia (`?strategy=`) e a ordenação (`?order=`) seguem como estavam. Alvos de 44 px (mesmo `.chip` da barra de estratégia), estado = ícone de marca + texto + cor (`aria-pressed`).
- Teste novo `test/backtests-filters.contract.tsx` (na lista explícita do script `test`): chips, par enviado à API e na URL, "Carregar mais" com o filtro e a contagem, par inválido ignorado, tipo esconde a outra lista. `bun run --cwd apps/frontend-ativada test`: 1185 passam, 0 falham; `tsc` e `eslint` do painel limpos.

**App dev real (Playwright + Edge, API reiniciada com o código novo; só o processo da API, sem tocar no worker).** A lista sem filtro mostra os nove pares; cada chip chama `GET /v1/runs?kind=...&limit=20&symbol=<PAR>` (200) e a tela mostra só aquele par: BTC 5, ETH 5, DOGE 5, PEPE 8, SOL 5, XRP 5, BNB 5, LINK 6, SHIB 5 (contagem do cartão Backtests; "N no total"); a URL fica `?par=...`. Sem filtro: "20 carregadas · há mais".

**Pendência que sobra.** A ordenação por resultado e o filtro por estratégia continuam locais ao que está carregado; filtro por versão já existe na API (`strategyVersionId`), falta o painel usá-lo.

## Troca rápida de execução (sonnet, 2026-10-16)

**Problema.** Para ir de uma execução (backtest, walk-forward ou simulação ao vivo) a outra era preciso voltar à lista de Backtests e abrir a outra.

**O que entrou (`apps/frontend-ativada/src/backtests/run-switch/`).**
- Barra `RunSwitcher` no topo do detalhe (`BacktestDetailPage`), presente também em carregando e erro (quem abre uma execução que não existe ainda escolhe outra): botão "Trocar execução" com a execução de agora (moeda, vela, tipo e estratégia), "Anterior" e "Próxima".
- O botão abre uma folha pesquisável: popover de 640 px no computador, tela cheia em 375 px. É um combobox de verdade (`role="combobox"`, `aria-controls` no `listbox`, `aria-activedescendant`, opções com `aria-selected`; grupos `role="group"` com título). Teclado: digitar filtra por moeda (com e sem a barra), estratégia, tipo por extenso e vela; ↑/↓ andam e dão a volta; Enter abre; Esc fecha e devolve o foco ao botão; Tab dá a volta dentro da folha. A contagem ("3 execuções encontradas.", "Nenhuma execução encontrada.") vai em `role="status"`.
- Grupos Ao vivo, Backtests e Walk-forward, cada um do mais novo para o mais antigo (ordem da API); "Recentes" no topo quando não há busca. Cada linha mostra o resultado como ícone + palavra + cor (`describeResult`): "+3,26% · 7 operações" (seta para cima, verde), "−11,31% · 12 operações" (seta para baixo, vermelho), "= 0,00%" (cinza), "Rodando", "Na fila", "Falhou", "Cancelada". Percentual em `BigInt` (`parseScaled`/`formatSignedPercentDown`, arredonda para baixo como a lista).
- Chips de moeda (os mesmos `FilterChip` da tela de Backtests), um par por vez, enviados à API em `symbol`.
- "Anterior"/"Próxima" e os atalhos `[` e `]` (ignorados com o foco num campo) seguem a lista da MESMA moeda e do MESMO tipo da execução ("anterior" sobe, é a mais nova; "próxima" desce). No fim da página carregada com mais páginas na API, "Próxima" busca a seguinte e vai à primeira nova.
- Preferências: camadas ligadas e layout da sala já moravam em `localStorage` (`ativada.chart-preferences`, `ativada.team-room`) e o tema é global, então sobrevivem à troca. A VELA escolhida no gráfico (que era por execução, RF05) passou a acompanhar a troca por `CarriedTimeframeProvider` (só dentro do detalhe; se a próxima execução não pode oferecer aquela vela, abre na dela; "Voltar para a vela da execução" limpa). A troca é navegação do roteador, sem recarregar: o botão é o MESMO nó do DOM antes e depois.
- Recentes: as 5 últimas visitadas em `localStorage` (`ativada.recent-runs`, só `id`, tipo, par, vela e versão), leitura e escrita em try/catch, item quebrado some e armazenamento que lança equivale a não ter.
- Dados: três `useRunListQuery` (um por tipo; os outros dois só com a folha aberta, parâmetro novo `isEnabled`) com as MESMAS chaves `['runs','list',kind,symbol]` da tela de Backtests: o cache é reaproveitado e o aviso do stream já invalida. Uma consulta por tipo e página, nenhuma por linha (a estratégia sai do índice de versões que o painel já tem).

**Honestidade.** "Rodando · saldo" só aparece quando a própria lista traz o patrimônio (`metrics.finalEquity`); a lista de execuções não traz o saldo da simulação ao vivo (ele vem do `live-status`, uma consulta por execução), então a linha diz só "Rodando" e o saldo fica no detalhe. Isso evita o N+1 pedido.

**Acessibilidade e movimento.** Alvos de 44 px (`.trigger`, `.option`, `.searchInput` entram em `test/touch-targets.contract.ts`; chips e botões usam as classes existentes), foco visível (anel no campo, na opção ativa e nos chips), `prefers-reduced-motion` no próprio arquivo de estilo (a folha sobe 8 px em 240 ms, só `opacity` e `transform`; o teste `design-review` varre). Contraste: a folha só usa pares que `test/contrast.contract.ts` já cobre nos dois temas (`buy`, `sell`, `accent`, `ink-2` e `ink-3` sobre `surface` e `surface-2`, que é o fundo da opção ativa).

**Provas.**
- `test/run-switch-model.contract.tsx` (13 casos): resultado em ícone/palavra/cor para ganho, perda, zero, rodando com e sem saldo, fila, falha, cancelada e estado desconhecido; título; busca (todas as palavras, sem acento e sem caixa, "btc/usdt 1H"); vizinhas e setas com volta; recentes (5, sem repetir, ida e volta, item quebrado, armazenamento que lança); vela levada para a próxima execução, queda para a vela própria e limpeza, e nada levado sem o provedor.
- `test/run-switch.contract.tsx` (14 casos, painel inteiro com roteador): grupos e resultado na linha; combobox (aria-controls, activedescendant, foco na busca); filtro e anúncio; setas, Enter, Esc e o foco devolvido; troca sem recarregar (mesmo botão); chip de moeda enviado à API e nenhuma consulta de detalhe de outra execução (sem N+1); falha e lista vazia; anterior/próxima com botões e com `[` `]`; atalhos ignorados no campo; "Próxima" que busca a página seguinte; recentes e armazenamento quebrado; execução inexistente mantém a barra. Os dois arquivos entram na lista explícita do script `test` do painel.
- Gates no espelho Linux: `tsc` raiz e do painel limpos; `eslint .` limpo; `prettier --check .` limpo; `panel-test`: 1219 passam, 0 falham.

**App dev real (Playwright + Edge, texto).** Na simulação XRP/USDT ao vivo: o botão mostra "XRP/USDT · 15m · Ao vivo · … · versão 1", a folha abre com o foco no combobox e 37 opções em quatro grupos de elementos (os chips e Ao vivo, Backtests, Walk-forward); digitar "eth" deixa 3 ("3 execuções encontradas."); ↓ ativa "ETH/USDT · 15m · Backtest … −11,31% · 12 operações"; Esc fecha e o foco volta ao botão. Em um backtest ETH/USDT: escolhi a vela 1d e a camada "Stop e alvo"; `]` levou ao backtest ETH seguinte e `[` voltou, e nos dois a vela 1d e a camada continuaram marcadas, `ativada.chart-preferences` intacto e `ativada.recent-runs` com as três últimas visitadas na ordem. Em 375 px: folha de tela cheia (375 × 812), sem rolagem horizontal, campo de 44 px, 10 chips de 44 px, botão Fechar de 44 px; a barra tem o botão em 343 × 59 e "Anterior"/"Próxima" lado a lado com 167 × 44 cada. Capturas: `capturas/troca-rapida-1280-claro.png` e `capturas/troca-rapida-375-escuro.png`.

**Pendências.**
- "Anterior"/"Próxima" seguem sempre a mesma moeda e o mesmo tipo; não há ainda a opção de seguir a lista inteira ou o filtro de moeda escolhido nos chips.
- O saldo da simulação ao vivo na linha da lista depende de a API passar a devolver o patrimônio em `GET /v1/runs` (hoje só o detalhe e o `live-status` o têm).
- Fora do escopo e anterior a esta tarefa: com o selo de conexão em "Reconectando…" o cabeçalho do computador passa de 1280 px e corta o "Sair" (aparece na captura de 1280).
- A vela levada vale só dentro do detalhe; se a pessoa voltar à lista e abrir outra, cada execução abre na sua vela (RF05).
- A captura de 1280 (`troca-rapida-1280-claro.png`) foi tirada com a API do ambiente dev devolvendo `429` em todas as rotas do usuário `teste` (outro trabalho em paralelo usava o mesmo limite): o detalhe não carregou, então o botão aparece no estado de falha ("Escolher outra execução", com "Anterior"/"Próxima" desligados) e o selo diz "Reconectando…". A folha mostra a busca por "eth", o grupo Ao vivo e o backtest marcado "Atual" com "−11,31% · 12 operações". A captura de 375 escuro (tirada com a API respondendo) mostra o estado normal. Refazer a de 1280 com a API calma fica como pendência.

## Visão geral com todas as simulações

Dúvida do usuário: "visão geral ainda está em 10k, por que? e porque só mostra a LINK, se a PEPE lucrou?". Causa: `pickActiveRun` devolvia só a primeira simulação `running`, e a PEPE que lucrou (+15,98%, 3 operações) é um BACKTEST, não ao vivo.

- **Painel "Minhas simulações ao vivo"** no topo (`src/overview/LiveSimulationsPanel`): um cartão por simulação ativa (moeda, vela, estratégia, selo "com analista (sombra/governa)", saldo, resultado em ícone + palavra + cor com zero cinza "=", compras e vendas, estado Rodando/Parada/Esperando dados/Na fila, "última decisão há N min" e duas barras contra "comprar e segurar"). Ordem: mais recente (padrão), maior resultado ou moeda; chips de moeda; o título do cartão cobre o cartão inteiro e abre o detalhe. Cartões em pilha a 375 px, alvos de 44 px (`touch-targets`), foco visível, sem animação.
- **Simulação em destaque** (`useFeaturedRun`): alimenta o cartão-herói, a linha de pulso e o gráfico de saldo. Padrão: a MAIS RECENTE que já operou, senão a mais recente (o maior |resultado| foi descartado: troca de dono a cada vela e o destaque pularia sozinho). A escolha fica em `localStorage` (`ativada.overview.featured-run`, tudo em try/catch) e some se a simulação deixar de estar ativa.
- **Linha de total** (`totalOf`, BigInt de 8 casas, desce para o centavo): "Carteira fictícia total: N simulações · saldo somado X USDT · resultado Y", só com ao vivo, dizendo que cada simulação tem o próprio saldo fictício e que somar não é uma carteira real.
- **Backtests que lucraram (no passado)**: cartão separado e recolhido, rotulado "Teste no passado, não é ao vivo", com a ressalva de amostra pequena (< 30 operações) e "das últimas 20 execuções carregadas"; reaproveita `useRunListQuery('backtest')` e só pede ao abrir.
- **Dados — decisão:** a lista `GET /v1/runs` não traz saldo nem operações e um `live-status` por linha estoura o balde de 60/min. Optei pela rota agregada `GET /v1/runs/live-summary` (aditiva, `RUN_LIVE_SUMMARY` 60/min, sem migration): UMA consulta SQL (`listLiveSummaries`, junção lateral pelo último ponto de `equity_points`, contagem de `fills` por lado, última decisão de `signals`), filtro de dono em toda tabela, só `live_paper` ativas, no máximo 100. Preferida ao campo na lista porque não mexe no contrato estrito de `RunView` nem nas listas de backtest. O painel faz DUAS consultas: a página compartilhada `LIVE_RUNS_PAGE_KEY` (estado, moeda, parada) e o resumo.
- **Prova.** `test/api-run-live-summary.contract.test.ts` (8; `loadApiApp()`, uma consulta só, outro dono, 400, 401), `make database-test` equivalente contra Postgres embutido (`run-live-summary-checks.ts`, exit 0), `test/live-simulations.contract.ts` e `test/live-simulations-panel.contract.tsx` (16), `touch-targets`, `api-openapi`, `ownership-registry`, `code-size-limits`, `api-routes-mutants` verdes. No app dev real (API reiniciada só ela): 11 simulações ao vivo, total "109.679,34 USDT · −320,66 USDT (−0,30%)", 14 pedidos `/v1/runs*` no carregamento (um `live-summary`, sem N+1), backtests "PEPE/USDT Ganho +15,98% · 3 operações · amostra pequena". Capturas: `capturas/visao-geral-claro-1280.png` e `capturas/visao-geral-escuro-375.png` (sem rolagem horizontal).
- **Pendências:** (1) mutante de dono da rota no `scripts/api-runs-mutants.ts` (arquivo em edição por outro trabalho; o filtro está provado pelo database-test e pelo contrato); (2) `GET /v1/runs` ainda sem saldo, então a troca rápida segue sem o saldo na linha (o resumo agora existe e pode alimentá-la); (3) typecheck/lint da raiz têm falhas só em `runs/team-room/balcony/*` e `notices/*` (outro trabalho).
