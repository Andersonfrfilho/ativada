# Evidência — Spec 017 (gráfico em velas menores)

## Autorização do usuário (2026-10-16, na thread)

O usuário (Anderson) respondeu "pode fazer" à proposta da spec 017 com as decisões **A** do `spec.md` §9. Ficam
AUTORIZADOS, e só eles:

- a **migration aditiva** do `CHECK` de `candles` (aceitar `3m`);
- a **rotina de limpeza** (cron `purge-display-candles`, 90 dias);
- a **recarga (backfill) de 3 min no banco DEV** (últimos 90 dias dos 9 pares, pela tarefa do cron do repositório);
- a **assinatura `kline_3m`** no ticker (e a gravação das velas fechadas de 3 min pelo worker).

Decisões A em tudo: velas de 3 min guardadas só 90 dias; só 3 min de exibição; abre em 3 min nas simulações de 15 min; saída
por alvo/proteção com marca no início da vela de 15 min e colchete sobre as 5 de 3 min.

**NÃO autorizado:** `1m`/`5m` (por isso o `CHECK` aceita só `3m`), chamada externa sob demanda (opção B), mudar o motor.
A Fase 3 (painel) fica para depois: outro agente edita o painel agora.

## T0.1 — contrato (docs/adr/0002, "Gráfico em velas menores (spec 017)")

- A execução de alvo/proteção NÃO grava o instante dentro da vela: `fills.candle_time` é a abertura da vela de 15 min
  (`map-decisions.ts:58`, `fill.candleOpenTime`). Vale D4-A.
- Campo do corte da retenção: `retentionStart`, em `meta` aditivo do envelope (`{ data, meta: { retentionStart } }`), só
  nas velas de exibição.
- Desvio: `MARKET_DISPLAY_TIMEFRAMES` tem padrão VAZIO (o plan dizia `3m`); `envs/env.dev` liga `3m`.
- Pendência: validação do ADR por `architect` (opus) não rodou nesta sessão.

## T1.1 — constantes e fronteira (commit c2b7561)

- Constantes: `DISPLAY_TIMEFRAME` (`3m`), `MARKET_CANDLE_TIMEFRAME`, `MARKET_CANDLE_DURATION_MILLISECONDS`, `isDisplayTimeframe`
  (mercado); `RUN_CANDLE_TIMEFRAMES`, `DISPLAY_CANDLE_TIMEFRAMES`, `CANDLE_TIMEFRAMES` (banco). `TIMEFRAME`, `ENGINE_TIMEFRAME` e
  `RUN_TIMEFRAMES` não mudaram.
- `test/display-timeframe-boundary.contract.test.ts` (9 testes): interseção vazia, `MARKET_TIMEFRAMES` recusa `3m`,
  `POST /v1/runs` com `3m` = 400 (backtest e live_paper), esquema do corpo recusa `3m` mesmo habilitado por engano, sonda de
  importação nos 8 diretórios do motor, ligação `isCandleTimeframe(run.timeframe)` nas três bases.
- Mutantes da fronteira: `3m` em `RUN_TIMEFRAMES` (morto), guarda `isCandleTimeframe` removida no ao vivo (morto) e no backtest
  (morto), menção a `MARKET_DISPLAY_TIMEFRAMES` em `worker/src/live` (morto), `3m` na lista `MARKET_TIMEFRAMES` do ambiente
  (morto). Mutante "esquema do corpo aceita `3m`" sobrevive POR DESIGN: há uma segunda barreira dentro da transformação do
  corpo (o erro do `timeframe` continua), então um único defeito não basta.
- `test/api-markets-display.contract.test.ts`: 3m aceita com `meta.retentionStart` alinhado à grade; vela de execução mantém o
  corpo antigo (`{ data }`); teto de 5.000 velas contado em 3m; `5m` e `3m` desabilitada = 400.
- Vizinhos verdes (542 testes em 47 arquivos): strategy-engine-boundary, timeframe-tables, ownership-registry, api-markets,
  api-openapi, cron/worker/api environment, kline-stream, ticker, market-*, backfill, code-size-limits, app-import-boundary.
  `database.contract` reprova a lista de exportações públicas por `EXIT_REASON`, `NOTICE_*`, `ORDER_*` e
  `createNoticeFeedRepository` (spec 014, já no HEAD; fora desta spec). `ticker-mutants` falhou uma vez sob carga (mutante
  `NEW_TICK_DOES_NOT_CLEAR_THE_SEAL`, temporização) e passou isolado.

## T2.1 — migration 0026

- `0026_candles_display_timeframes.sql`: recria `candles_timeframe_check` com `3m` (`NOT VALID` + `VALIDATE`); snapshot e
  journal gerados pelo `drizzle-kit generate` num espelho. O `CHECK` aceita SÓ `3m` (`1m`/`5m` não foram autorizados; o teste
  prova que `5m` é recusada, código 23514).
- `.rollback.sql` ABORTA (`restrict_violation`) com qualquer linha `3m`.
- `make migration-test` equivalente no Postgres embutido do WSL (porta 56455): "27 migrations aplicadas e desfeitas", com a
  verificação nova (CHECK validado com `3m`; rollback aborta pela guarda com linha 3m; sem linha, o rollback completo passa).
  Mutante "rollback sem guarda" morto.
- `database-test` (mesmo Postgres): expurgo só de `3m` anterior ao corte (exclusivo), em lotes (3), 15m/1h/4h/1d intactos;
  mesma abertura em 3m e 15m, cada leitura traz só a sua; 5 velas de 3 min (bigint, escala 8) = a vela de 15 min (OHLCV e
  `trade_count`). Mutantes mortos: expurgo sem filtro de vela, corte `<=`, leitura sem filtro de vela, expurgo sem laço.

## T2.2 / T2.3 — cron: recarga e limpeza das velas de exibição

- `backfill-display-candles`: a mesma tarefa do backfill (sequencial por par, peso e 418 do cliente existente: o 418 aborta),
  com janela em DIAS (`computeBackfillWindow({ days })`: `ceil((agora − retenção) ÷ d) × d` até a vela em formação).
  `purge-display-candles`: `repository.purgeDisplayCandles` (lotes de 5.000, parametrizado, só `3m`, corte exclusivo). As duas
  em `TASK_NAME`/`CRON_TASKS` e em `createProductionTasks`. Env novas validadas no `marketEnvironmentShape`
  (`MARKET_DISPLAY_TIMEFRAMES`, padrão vazio, só `3m`; `CANDLE_DISPLAY_RETENTION_DAYS`, 7 a 365, padrão 90).
- `test/backfill-display-candles.contract.test.ts` (12 testes): janela de 90 dias na grade de 3 min, 43.199 velas em 44 pedidos
  de 1.000, segundo backfill sem pedido nenhum, 418 para tudo no terceiro pedido, corte da limpeza, env (padrão, faixa, nomes
  das tarefas, recusas). Mutantes mortos: corte no futuro, janela ignora dias, `days` não repassado, teto da retenção.
- Cron REAL (`scripts/display-candles-test.ts`, Postgres embutido porta 56455 + Binance falsa local, sem Docker):
  "90 dias de 3m (43199) -> 44 chamadas de 1000, peso 88", segundo backfill "zero chamadas, zero inseridas", limpeza com 7
  dias "ficaram 3359 velas 3m, 1h intacta". (`make backfill-test` NÃO foi usado: o alvo sobe Docker de teste, proibido aqui; e o
  `scripts/backfill-test.ts` já falha no HEAD no primeiro cenário, `HOLEUSDT` sem filtros de par, fora desta spec.)

## T2.4 — worker, ticker e rota

- Worker: assina `<par>@kline_3m` (a lista é `MARKET_TIMEFRAMES` + `MARKET_DISPLAY_TIMEFRAMES`) e grava só as fechadas; vela de
  exibição NÃO aciona `onCandleStored`. `test/worker-display-candles.contract.test.ts` (5): assinatura, gravação com decimais
  exatos e imutável (reentrega e reescrita não mudam a vela), vela aberta não grava, 3m não acorda a simulação (1h acorda),
  buraco de 3m na janela recuperado pelo REST. Mutantes mortos: 3m acorda a simulação, esquema do stream sem 3m.
  (Mutante da duração em `unfillable` sobrevive: só altera a contabilidade de "inalcançável".)
- Ticker da API: `test/market-stream-pipeline.contract.test.ts` +2: `kline_3m` assinado junto das velas de execução, UMA
  mensagem por par e vela (1h e 3m separadas), exibição sozinha NÃO liga a assinatura de kline. Mutantes mortos: ticker sem
  exibição, esquema do ticker sem 3m, exibição ligando o kline sozinha.
- Rota: ver T1.1 (`meta.retentionStart`, teto de 5.000 em velas de 3 min).
- Oráculo 5×3 = 15: `database-test` (bigint, Postgres embutido) e `scripts/display-candles-measure.ts` (só `SELECT`, valida
  contra o banco real; provado contra uma janela adulterada: 1 divergência `high`, saída 1).

## T2.5 — ambiente

- `envs/env.dev`: `MARKET_DISPLAY_TIMEFRAMES=3m`, `CANDLE_DISPLAY_RETENTION_DAYS=90`. `dev-lib.ps1`/`.sh` repassam
  `VITE_MARKET_DISPLAY_TIMEFRAMES` (variável NOVA; `VITE_MARKET_TIMEFRAMES` NÃO mudou, para não mexer no seletor do painel
  que outro agente edita: a Fase 3 decide como consumi-la). `docs/runbook-dev-local.md` §8.

## Ambiente DEV (2026-10-16, autorizado)

Estado ANTES (por `SELECT`): 11 simulações `live_paper` em execução (todas 15 min: BNB, BTC, DOGE, ETH, 3 de LINK, PEPE, SHIB,
SOL, XRP), `candles` = 15m 634.247 · 1h 158.555 · 4h 39.629 · 1d 6.597 (nenhuma 3m), 26 migrations.

1. **Migration pelo caminho oficial:** `bun --env-file=envs/env.dev scripts/dev-migrate.ts <pasta absoluta>` aplicou a
   `0026_candles_display_timeframes` (26 → 27). `pg_constraint`: `candles_timeframe_check` com `convalidated = true` e `3m` na
   lista.
2. **Recarga de 3 min (90 dias, 9 pares)** pela tarefa do cron do repositório
   (`CRON_TASKS=backfill-display-candles`, `bun run apps/cron-ativada/src/main.ts`, Binance pública `data-api.binance.vision`):
   `{"pairs":9,"inserted":388791,"unfillable":0,"failures":0}`, 9 × 43.199 velas (cada par: 44 pedidos de 1.000, peso 2 cada),
   saída 0, **nenhum 418** (log de erro vazio), cerca de 5 minutos no relógio.
3. **Reinício só da API e do worker** (o painel e os containers ficaram como estavam; `dev-up.ps1` reconheceu "painel já está no
   ar"), saída em arquivo: o worker subiu com `timeframes: 5` (4 de execução + `3m`), `stream connected`, e as 11 simulações
   foram retomadas ("live run taken over from a stopped worker"); `api.err.log` e `worker.err.log` vazios.
4. **Estado DEPOIS (`SELECT`):** as mesmas 11 `live_paper` em `running`, cada uma com +1 decisão na vela de 15 min seguinte
   (87 → 88 nas antigas, 16 → 17 nas novas); `candles` 15m +9, 1h +9 (gravação normal do stream), `3m` 388.809.
   Por par: **43.201 velas de 3 min** em 9 de 9 (de 2026-07-18 18:57 UTC a 2026-10-16 18:57 UTC, e o worker segue gravando as
   fechadas pelo stream).
5. **Soma 5×3 → 15 (`scripts/display-candles-measure.ts`, só `SELECT`, bigint escala 8, sem importar o `src`):** 8.639 janelas de
   15 min conferidas por par (77.751 no total; 1 incompleta por par, a mais antiga, que começa no meio da janela),
   **0 divergências**. Achado: com a regra ingênua (abertura = abertura da 1ª vela de 3 min) houve 2 divergências, ambas
   SHIBUSDT (2026-07-23 02:15 e 2026-07-24 09:00 UTC): a 1ª vela de 3 min não teve negócio (volume 0, `trade_count` 0) e traz o
   fechamento anterior. A regra correta (ADR V9) ignora a vela sem negócio para abertura, máxima e mínima. Prova no banco de
   teste: `display-candle-checks.ts` ("vela de 3 min sem negócio não define a abertura").

## Fase 3 — painel (T3.1, T3.2, T3.3), 2026-10-16

Commits: 5691843 (mapeamento e composição), b95e57f (seletor, abertura em 3 min, retenção, camadas em degraus), os seguintes
(colchete, opinião, vela de 15 min composta, vagas de 3 min, ponta com o relógio, balão de valores, contexto e marca do começo,
tabela no celular). Gates no espelho `ativada-spec17`: typecheck, lint, format e panel-test (1.482 testes) verdes.

- **Contratos (superfície falsa):** `test/candle-display.contract.tsx` (abertura em 3 min ao vivo com UMA página de 1.000 velas, seletor
  e ambiente, degraus de 5 velas a partir do fechamento, "esperou", retenção, colchete e dica da saída, opinião e equipe na vela
  decidida, vela de 15 min composta e kline de 15 min como fonte, 5 vagas, balão, início da simulação, tabela no celular); a visão de 15 min
  segue igual à da 009 (os 1.400+ contratos antigos continuam verdes e há teste dedicado).
- **Propriedades e oráculo:** `display-mapping.contract.ts` (2.000 sorteios: opinião nunca antes do fechamento; toda vela de exibição sabe a
  opinião que valia) e `compose-candles.contract.ts` (2.000 sorteios com o oráculo independente: negócios → vela de 3 min pela definição
  da corretora e vela de 15 min direto; caso SHIB sem negócio).
- **App dev real (Edge, painel 127.0.0.1:56100, LINK ao vivo):** abre em 3m com a legenda, a frase fixa, "Opinião das 18:45 · vale até 19:00",
  "Vela de 15 min em formação (19:00–19:15)", as 5 vagas (fechada/em formação/falta, ícone + palavra) e a faixa da vela em formação
  cobrindo a coluna dos 5 degraus; captura única em `capturas/grafico-3min-1280-claro.png`. O painel precisou ser reiniciado só para
  enxergar `VITE_MARKET_DISPLAY_TIMEFRAMES` (o processo antigo não tinha a variável).
- **Pedidos:** 1 chamada `strategy-layers` por carga (antes ~12 por causa da referência instável de `displayMapping`); 5 páginas de
  1.000 velas de 3 min = 5 chamadas de `candles` (balde `CANDLE_QUERY`), nenhum 429 nas rodadas; ponta nova = 1 chamada a cada 3 min.
- **Desempenho (backtest BTC de 15 min, 183 dias, 5 páginas = 5.000 velas de 3 min, Edge, app dev em modo desenvolvimento):** arrasto
  mediana 238 fps; p5 60–80 fps; pior quadro 7–12 fps (vista de 15 min na mesma máquina e no mesmo app: p5 60–119, pior 12–34). Antes da
  correção da referência instável: p5 8–12. Ressalva: não é o harness estático da 009 (p5 232), e a máquina tem ruído de ±2x entre rodadas.
- **Valores na vertical (relato do usuário):** achado no app real a 375 px: a tabela de operações (`TradesTable.module.css`) tinha
  `overflow-wrap: anywhere` e colunas de 28 px (números empilhados, linhas de 228 px). Corrigido (`overflow-wrap: normal`, `min-width: 760px`
  e rolagem lateral) com teste de contrato; o balão do gráfico nasceu com o mesmo risco (coluna de valor comprida espremia os rótulos) e
  ficou em duas colunas (rótulo flexível | valor `nowrap`), com a regra do placar numa frase à parte. Varredura de `getBoundingClientRect`
  em página, balão, gaveta de avisos, "Trocar execução", fichas dos agentes e dica `Term` a 1.280 e 375 px: nenhum valor quebrado (restam linhas
  de 72 px na tabela de operações por texto de motivo que quebra em várias linhas; a janela virtual assume 44 px: pendência).
- **Pendências:** botão de 3m não desabilita quando a execução inteira é anterior à retenção (o aviso aparece e a página vem vazia);
  balão sem opinião curta de cada agente e sem distância até os níveis (a equipe ao lado já fala da vela apontada); revisão em tema escuro
  e `design-review`/`contrast`/`touch-targets` rodaram verdes no panel-test, mas a captura é só do tema claro a 1.280 px; `code-reviewer` (T4.1)
  não rodou; `make panel-e2e` não foi rodado (infra descartável usa Docker).

## Balão de valores opcional (pedido do usuário: "deixa o modal opcional para aparecer")

- Interruptor na barra do gráfico "Balão de valores: ligado/desligado" (ícone + palavra, `aria-pressed`, botão de 44 px), preferência
  `isTooltipOn` no mesmo `localStorage` das camadas (try/catch, padrão LIGADO, valor inválido volta ao padrão) e atalho `V` (ignora campo de
  texto e Ctrl/Alt/Meta). Desligado: o mouse não abre nada; clicar numa vela abre e fixa o balão (o toque faz isso em qualquer modo), Esc fecha.
  A legenda OHLC fixa e o anúncio por teclado não mudam.
- Contratos em `candle-display.contract.tsx` (padrão ligado, interruptor, persistência ao remontar, desligado + clique + Esc, tecla V com e sem foco
  em campo, toque) e `chart-preferences.contract.ts` (campo novo).
- NÃO feito: o menu "Gráfico ▾" da janela baixa não existe no código, e não agrupei "Janelas automáticas" nas preferências da central de avisos
  (são arquivos de `src/notices/`, de outro agente); a ficha do agente e a gaveta não são pop-ups sobre o gráfico, então só o balão ganhou interruptor.
