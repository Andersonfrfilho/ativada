# Tasks — Spec 017

Cada task fecha com: `bun run typecheck` + `bun run lint` + `bun run format:check` + testes + commit isolado (só os arquivos
da task, pelo nome) + evidência em `evidence.md`. Gates no Linux/WSL, num espelho PRÓPRIO desta spec: copiar `gates7.sh` do
scratchpad (`C:\Users\ander\AppData\Local\Temp\claude\C--Users-ander-Documentos-personal\cc00ea62-3173-407e-a131-bebea2ff1016\scratchpad\`)
para `gates-spec17.sh` (o nome `gates17.sh` já existe e aponta para a spec 011) trocando `DST` por
`$HOME/gates/ativada-spec17` (o `rsync` exclui `node_modules`, `.git`, `.omc` e `dist`). Uso: `bash gates-spec17.sh
install|typecheck|lint|format|test <arquivos>|panel-test`. Teste novo do painel entra na lista explícita do script `test`.
Alvos `make *-test` um por vez.

**Antes de começar:** decisões do `spec.md` §9. Sem resposta, padrões A, **exceto** o que exige autorização:

| O quê | Onde | Exige |
|---|---|---|
| Migration do `CHECK` de `candles` (1m/3m/5m) | T2.1 | **migration aditiva** |
| Cron de expurgo das velas de exibição | T2.3 | **apagar dados** (mesmo públicos) |
| Backfill de 3m no ambiente dev (e o de 2 anos, se escolhido) | T2.4 | **backfill grande / chamada à Binance** |
| Opção B (proxy sob demanda) | — | **chamada externa nova**: só com resposta explícita |

**Coordenação:** outros executores trabalham nas specs 007, 011, 013, 014 e 016. Não tocar em `specs/0{07,11,13,14,16}*`,
`packages/strategy-engine`, `packages/run-recording`, `packages/risk-analyst`, `apps/worker-ativada/src/live/`,
`apps/frontend-ativada/src/notices/` nem nos arquivos da sala/escritório. Antes de cada fase: `git status --short --branch`
e `git log --oneline -- apps/frontend-ativada/src/runs/candle-chart packages/database/drizzle` desde 2026-10-16.

## Fase 0 — Contrato e medição

> 🤖 Modelo: `opus` 🧠 na T0.1 · `sonnet` na T0.2

| Task | O quê | Aceite |
|---|---|---|
| T0.1 🧠 | Conferir os pontos "(conferir na T0.1)" do plan e fechar o contrato: `DISPLAY_ONLY_TIMEFRAMES`, `isDisplayCompatible`, mapeamento D3 (incl. instante do `fills`), stream D4, paginação e baldes D5, retenção/expurgo, fronteira do motor | Seção "Gráfico em velas menores (spec 017)" no ADR 0002, validada por `architect` (opus); se exigir mudar motor/run-recording, **parar e perguntar** |
| T0.2 | Oráculo `bigint` `test/fixtures/display-candles/compose-oracle.ts` + `test/display-candles-compose.contract.test.ts` (contas à mão, 2.000 propriedades) e `scripts/display-candles-measure.ts` (só `SELECT`): tamanho por linha e estimativas da tabela do plan D1 | Contas à mão verdes; tabela de custo em `evidence.md` |

## Fase 1 — Fronteira e regras puras

> 🤖 Modelo: `haiku` (T1.2 → `sonnet`)

| Task | O quê | Aceite |
|---|---|---|
| T1.1 | Constantes (`DISPLAY_ONLY_TIMEFRAMES`, durações) em `market-data-crypto` e `database`; teste de fronteira RNF01 (interseção vazia, sonda de import, `POST /v1/runs` `3m` = 400) | Testes verdes; `RUN_TIMEFRAMES` e motor idênticos; mutantes da fronteira mortos |
| T1.2 | `display-mapping.ts` e `compose-candles.ts` no painel (puros, BigInt) | Propriedades do aceite 3 (2.000); dourado: em 15m posições idênticas às da 009; composição = oráculo |

## Fase 2 — Banco, cron, worker e API (🔒 T2.1, T2.3, T2.4)

> 🤖 Modelo: `sonnet` (T2.5 → `haiku`)

| Task | O quê | Aceite |
|---|---|---|
| T2.1 🔒 | Migration `00NN_candles_display_timeframes` (número livre na hora) + `.rollback.sql` que aborta com linhas de exibição | `make migration-test` e `make database-test` verdes; rollback com e sem linha |
| T2.2 | Backfill por retenção para velas de exibição (`MARKET_DISPLAY_TIMEFRAMES`, `CANDLE_DISPLAY_RETENTION_DAYS` no `packages/environment`) | `make backfill-test` com 3m (Binance falsa), peso no log, 418 aborta |
| T2.3 🔒 | Tarefa `purge-display-candles` no cron (lotes de 5.000, parametrizada) | `make database-test`: apaga só exibição antiga; mutantes (sem filtro de vela, `<=`) mortos |
| T2.4 🔒 | Worker grava `kline_3m` fechadas e recupera lacunas na retenção; ticker da API assina 3m; `GET /v1/markets/candles` aceita 3m e devolve o corte | `make stream-test` e `make stream-api-test` verdes; contrato da rota; oráculo 5×3m = 15m sobre o banco de teste |
| T2.5 | OpenAPI, `envs/*`, `dev-up` copiando para `VITE_MARKET_TIMEFRAMES` | `api-openapi` verde |

## Fase 3 — Painel

> 🤖 Modelo: `sonnet` (T3.3 → `haiku`)

| Task | O quê | Aceite |
|---|---|---|
| T3.1 | Seletor, vela padrão, legenda e frase fixa, corte da retenção, paginação; camadas e marcas pelo mapeamento | Contratos com `fake-chart-surface` (posições, faixas "vale até", colchete, degraus); textos literais |
| T3.2 | "Próxima vela de perto" com 5 vagas; legenda da vela de 15 min composta; vela em formação de 3m | Contratos com kline falsa; composição em BigInt |
| T3.3 | Revisão de design: 375 px, contraste, 44 px, `prefers-reduced-motion`, glossário "vela de exibição" | `contrast`, `touch-targets`, `design-review` verdes |

## Fase 4 — Revisão final

> 🤖 Modelo: `sonnet`

| Task | O quê | Aceite |
|---|---|---|
| T4.1 | `code-reviewer` (sonnet); `make panel-e2e` no Edge (`PANEL_E2E_BROWSER_CHANNEL=msedge`) com 5.000 velas de 3m; `CLAUDE.md` e ADR | 60 quadros/s; zero violação de CSP; uma captura final em `evidence.md` |

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/017-grafico-em-velas-menores/ (leia spec.md, plan.md e tasks.md antes de
começar). Uma task por vez, na ordem do tasks.md.
ANTES DE TUDO: confira em evidence.md as respostas do usuário ao spec.md §9. Sem resposta, padrões A, mas SEM autorização
registrada NÃO crie a migration (T2.1), NÃO crie o expurgo (T2.3) e NÃO rode backfill de 3m no dev (T2.4): pare e pergunte.
Opção B (proxy na Binance) só com resposta explícita.
Modelos: T0.1 🧠 → opus, validada por architect model=opus · T0.2 → executor model=sonnet · Fase 1 → executor model=haiku
(T1.2 → sonnet) · Fase 2 → executor model=sonnet (T2.5 → haiku) · Fase 3 → executor model=sonnet (T3.3 → haiku) ·
T4.1 → executor model=sonnet + code-reviewer model=sonnet.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Cada task fecha com bun run typecheck + bun run lint + bun run format:check + testes + commit isolado (só os arquivos da
task, pelo nome), evidência em evidence.md. Gates no WSL num espelho próprio: copie gates7.sh do scratchpad para
gates-spec17.sh com DST=$HOME/gates/ativada-spec17 (rsync sem node_modules); alvos make *-test um por vez.
O MOTOR NÃO MUDA: packages/strategy-engine, packages/run-recording e packages/risk-analyst intocados; nenhuma execução,
meta, prazo, analista ou backtest lê 3m; o teste de fronteira prende isso.
Opiniões, placar, tendência e linhas da estratégia da vela t ficam em [t+d, t+2d) (sem lookahead visual); em 15m o gráfico
é idêntico ao da spec 009. Oráculo bigint: 5 velas de 3 min = a vela de 15 min gravada.
Toda tela em vela menor traz a frase: velas menores não melhoram a previsão nem criam vantagem.
Tudo simulado: nenhuma ordem real, nenhuma chave de corretora, nada de modo live.
Pare e pergunte antes de: deploy, migration, apagar dados, backfill grande, chamada externa nova, mudar o motor,
dependência nova, qualquer [NEEDS CLARIFICATION].
PROIBIDO: git push, git reset, git commit --amend, git stash, escrever no banco de dev, mexer nos containers ativada-dev-*.
NÃO toque em specs/007*, 011*, 013*, 014*, 016*, nem nos arquivos da sala/escritório e de src/notices/.
UI: verifique por texto (read_page, get_page_text); screenshot só uma vez, na T4.1.
Ao terminar ou parar, feche o modo (/oh-my-claudecode:cancel).
```
