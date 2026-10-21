# Tasks — Spec 009

Cada task fecha com: `bun run typecheck` + `bun run lint` + testes + commit isolado + evidência em `evidence.md`.
Rodar os gates no Linux/WSL (spec 003, plan D6). Teste novo do painel entra na lista explícita do script `test` do
`package.json` do painel.

**Antes de começar:** as decisões do `spec.md` §9 precisam de resposta do usuário. Sem resposta, a execução segue os padrões
A **exceto** D1-A (instalar biblioteca) e D4-B (migration), que nunca acontecem sem autorização explícita. Com D1-B, as
tasks marcadas (D1-A) trocam o adaptador da biblioteca por um adaptador SVG próprio (mesma porta `ChartSurface`), e a T0.2
vira um spike de desempenho do SVG.

**Dependência:** spec 008 Fases 0 e 1 (prontas). A T3.4 da spec 008 não é feita no SVG (D14); as demais tasks da 008
podem correr antes ou em paralelo.

## Fase 0 — Contrato e spike

> 🤖 Modelo: `opus` 🧠 na T0.1 (decisão herdada por todas as fases) · `sonnet` na T0.2

| Task | O quê | Aceite |
|---|---|---|
| T0.1 🧠 | Fechar o contrato de `strategy-layers` e `projections` (plan D2), a regra `projection-1` com o veredito de Wilson (D3), o catálogo de frases (D4), a consulta do resumo (`LEAD` sobre `signals` ⋈ `candles`, plano de execução conferido com 17.520 sinais), o mapeamento `indicators` → linhas por papel para as 7 regras, e se `live-status` ganha `projection` | Seção "Gráfico estilo Binance (spec 009)" no ADR 0002; oráculo do resumo em `test/fixtures/projections/` (TS puro, sem importar `src`) com o resultado dos dois conjuntos reais; se faltar índice ou o p95 passar de 300 ms, **parar e perguntar** |
| T0.2 (D1-A) | Spike da biblioteca **depois da autorização**: `lightweight-charts@5.2.1` exato no painel; página de teste com 20.000 velas, 3 painéis, marcadores e cone; `vite build` + `vite preview` com a CSP real | Evidência: tamanho gzip somado ao bundle, quadros/s ao arrastar, **zero** violação de CSP no console, licença e `NOTICE` conferidos, `bun audit` limpo; se a CSP exigir afrouxar qualquer diretiva, **parar e perguntar** |

## Fase 1 — API

> 🤖 Modelo: `sonnet` (T1.1 → `haiku`)

| Task | O quê | Aceite |
|---|---|---|
| T1.1 | `projection-rule.ts` e `projection-messages.ts` puros (plan D3, D4) | Contas à mão + propriedades (faixa nunca encolhe; `counted = hits + misses`; taxas para baixo); Wilson nas bordas (29/30 contadas; limite encostando em 0,5); frases literais |
| T1.2 | Leituras em `packages/database/src/run-results/run-projections.ts`: `listLayerRows({ userId, runId, from, to })`, `summarizeProjections({ userId, runId })` (uma consulta), `listProjectionItems({ userId, runId, cursor, limit })`; `userId` no tipo | `make database-test` verde; isolamento; paridade do resumo SQL com o oráculo da T0.1 nos dois conjuntos; walk-forward só janelas de teste |
| T1.3 | `GET /v1/runs/:runId/strategy-layers` (`access`, `documentation`, Zod entrada/saída, `RUN_CHART`) | Contratos (`loadApiApp()`): 404 entre usuários, 400 sem eco, > 5.000 velas = 400, estratégia sem regra de preço = `lines: []`; `api-openapi` verde |
| T1.4 | `GET /v1/runs/:runId/projections` (`RUN_LIVE_STATUS`) | Contratos: live rodando com `current`, backtest sem `current` com `summary`, aquecendo, neutro, sem vela, parada, cursor; `api-openapi` verde |
| T1.5 (D9-A) | Vela em formação: assinatura `kline_<tf>` no ticker, agregador 1/s por (par, tf), mensagem `candle` no `/v1/stream`, env `TICKER_KLINE_ENABLED` | `make stream-api-test` ganha o caso (Binance falsa manda kline aberta → socket recebe `candle`; teto 1/s; par não assinado não recebe); `make stream-mutants` verde |
| T1.6 | Mutantes `test/api-run-projections-mutants.contract.test.ts` (plan D7) e +2 em `scripts/api-runs-mutants.ts` | Todos mortos; `make api-runs-mutants` verde |

## Fase 2 — Painel: base

> 🤖 Modelo: `haiku` (T2.3 → `sonnet`)

| Task | O quê | Aceite |
|---|---|---|
| T2.1 | Zod espelhado (`strategy-layers.validation.ts`, `projections.validation.ts`, mensagem `candle` do stream) e consultas sob a chave raiz `runs` (velas públicas sob `markets`) | Contrato: resposta inválida não renderiza; chaves começam com `runs`/`markets` |
| T2.2 | Glossário: vela em formação, volume, placar, tendência, faixa (ATR), acerto do lado, moeda ao ar; tokens novos em `global.css` (`--chart-grid`, `--cone-up`, `--cone-down`, `--cone-neutral`, por `color-mix`) | Contrato do glossário; `test/contrast.contract.ts` com as cores novas ≥ 3:1 nos dois temas |
| T2.3 | Puros: `candle-series.ts` (única conversão texto→número, só para desenho), `strategy-line-series.ts`, `score-series.ts`, `marker-series.ts`, `projection-cone.ts`, `candle-paging.ts`, `ohlc-text.ts`, `chart-preferences.ts` (`localStorage` com try/catch) | Contratos puros; fuso `America/Sao_Paulo` e `America/New_York`; paginação sem duplicar vela; preferência inválida cai no padrão |

## Fase 3 — Gráfico e previsão

> 🤖 Modelo: `sonnet` (T3.7 → `haiku`)

| Task | O quê | Aceite |
|---|---|---|
| T3.1 | Porta `ChartSurface` + `lightweight-surface.ts` (D1-A; único import da biblioteca, cores por `chart-theme.ts`, crédito do `NOTICE` no rodapé) + superfície falsa em `test/support/` | Contrato com a superfície falsa: criar/destruir no ciclo do React 19 (StrictMode monta duas vezes sem vazar), troca de tema reaplica as cores |
| T3.2 | `CandleChart` no `TradeChartCard`: velas + volume + legenda OHLC + cruz + zoom/arrasto + botões + paginação à esquerda + seletor de vela; a URL `?de=&ate=` continua valendo | Contratos: dados certos à superfície, página anterior pedida perto da borda, troca de vela mantém o centro, aviso fora do timeframe da execução |
| T3.3 | Camadas: linhas da estratégia, placar, compras/vendas (agrupamento acima de 500), "Stop e alvo" (caixas), "Esperou" (desligada), barra de camadas com `aria-pressed` e recolhida no celular | Contratos por camada; padrões de ligado/desligado (spec §5 D12, spec 008 D6); 375 px por classe |
| T3.4 | Ao vivo: `useLiveCandle` (D9), vela em formação tracejada, linha do preço real a partir do último fechamento | Contrato: mensagem `candle` atualiza só a vela aberta; vela fechada pelo aviso `runs` refaz a última página; parada vira "sem dados" |
| T3.5 | `NextCandlePanel` (SVG pequeno à mão): velas recentes, vela em formação ampliada, cone (D10), linha real, "agora", rótulo de tendência, resultado ao fechar, todos os estados "sem previsão" (RF16) | Contratos de cada estado com o texto literal; estado = ícone + palavra + cor; nada de faixa sem tendência |
| T3.6 | Cartões `ProjectionSourceCard` ("De onde vem a previsão": régua do placar, votos em palavras, "o que falta" da spec 008, faixa em palavras) e `ProjectionHistoryCard` (KPIs, veredito, acerto por força, tabela com "Ver mais") | Contratos com fixture: números e frases do servidor exibidos sem conta local; veredito `too_few` abaixo de 30 |
| T3.7 | Teclado e leitor de tela (D6): uma parada de Tab, setas, Shift+seta, `+`/`−`, Home/End, Esc, anúncio com espera, descrição textual com a previsão | Contrato de teclado com a superfície falsa; descrição textual literal |
| T3.8 | E2E (`make panel-e2e`): canvas com pixels, arrasto pede página anterior, teclado muda o anúncio, kline falsa muda a vela em formação, sem violação de CSP | E2E verde |

## Fase 4 — Fechamento

> 🤖 Modelo: `sonnet` (revisão final com `code-reviewer` em `opus`)

| Task | O quê | Aceite |
|---|---|---|
| T4.1 | Revisão de design (web.md §15) contra o preview `docs/preview/grafico-binance/`: gráfico, painel de previsão e cartões a 375 e 1280 px nos dois temas, foco visível, nunca só cor, linguagem para leigo; **uma** captura final | Captura em `evidence.md`; divergências corrigidas ou listadas |
| T4.2 | Atualizar `CLAUDE.md` (rotas novas, mensagem `candle`, biblioteca e a porta `ChartSurface`, regra `projection-1`, glossário). Atenção: o `CLAUDE.md` atual está com o conteúdo **duplicado** a partir da linha ~339 (o arquivo foi colado duas vezes); corrigir na mesma task | Diff revisado; arquivo sem a cópia |
| T4.3 | Revisão final (`code-reviewer` `opus`) e auditoria §15 do code-standart (N+1, uma consulta no resumo, `Promise.all` × `allSettled` no carregamento das camadas — a falha das camadas NÃO pode derrubar as velas, logs sem PII, sem stack trace no 500) | Relatório em `evidence.md` |

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/009-grafico-estilo-binance/ (leia spec.md, plan.md e tasks.md
antes de começar). Uma task por vez, na ordem do tasks.md.
ANTES DE TUDO: confira em evidence.md as respostas do usuário às decisões do spec.md §9. Sem autorização explícita
registrada, NÃO instale lightweight-charts (D1-A) e NÃO crie migration (D4-B): siga D1-B e D4-A e avise.
Modelos: T0.1 🧠 → opus (contrato, regra projection-1, consulta do resumo, ADR 0002) · T0.2 → executor model=sonnet ·
Fase 1 → executor model=sonnet (T1.1 → executor model=haiku) · Fase 2 → executor model=haiku (T2.3 → executor
model=sonnet) · Fase 3 → executor model=sonnet (T3.7 → executor model=haiku) · Fase 4 → executor model=sonnet ·
revisão final → code-reviewer model=opus.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Cada task fecha com bun run typecheck + bun run lint + testes + commit isolado, evidência em evidence.md.
Teste novo do painel entra na lista explícita do script test do package.json do painel.
Rode os gates no Linux/WSL: no Windows, fixtures com new URL(...).pathname quebram (spec 003, plan D6).
Não mude packages/strategy-engine nem packages/run-recording. Não recalcule o motor por pedido: linhas, placar e ATR vêm
de signals; velas de candles; eventos de fills/positions. A previsão é tendência do placar, nunca preço-alvo.
Dinheiro em texto decimal na API e BigInt no painel; Number só para coordenada de desenho, num adaptador único.
Pare e pergunte antes de: deploy, instalar qualquer pacote sem autorização registrada, qualquer migration, afrouxar a CSP,
índice faltando ou p95 acima de 300 ms na T0.1, remover ou mudar o tipo de campo existente de /v1/runs*, qualquer
[NEEDS CLARIFICATION].
PROIBIDO: git push, git reset, git commit --amend, git stash, apagar volumes que não sejam os descartáveis do projeto,
mexer nos containers ativada-dev-*.
UI: verifique por texto (read_page, get_page_text); screenshot só uma vez, na T4.1.
Ao terminar ou parar, feche o modo (/oh-my-claudecode:cancel).
```
