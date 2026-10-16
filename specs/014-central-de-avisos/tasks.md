# Tasks — Spec 014

Cada task fecha com: `bun run typecheck` + `bun run lint` + `bun run format:check` + testes + commit isolado + evidência em
`evidence.md`. Rodar os gates no Linux/WSL (spec 003, plan D6). Teste novo do painel entra na lista explícita do script
`test` do `package.json` do painel.

**Antes de começar:** confira em `evidence.md` as respostas do usuário às decisões do `spec.md` §9. Sem resposta, valem os
padrões A.

| O quê | Onde | Exige |
|---|---|---|
| Migration `notice_preferences` | T1.4 | só com D2-B, e autorização registrada |
| `completesScore` aditivo em `live-status` (rota da spec 008) | T1.3 | 008 sem outro executor; senão parar e perguntar |
| `blocked.analyst` / `blocked.minimum_profit` | T1.2 | 007 Fase 2 / 013 gravando o motivo; senão pular e registrar |
| Destaque na sala e na linha de pulso | T4.1 | specs 011 e 008 fechadas |

**Dependências:** specs 005, 008 e 009 prontas. Não tocar em `specs/007*`, `specs/008*`, `specs/009*`, `specs/011*`,
`specs/013*`. Não mudar motor, `run-recording` nem `StreamClient`.

## Fase 0 — Conferência

> 🤖 Modelo: `sonnet`

| Task | O quê | Aceite |
|---|---|---|
| T0.1 | Conferir no banco e no ADR: `orders` guarda o candle de cada mudança de estado? `positions` tem `exitReason`, alvo, stop e resultado? `alerts` STALL/RESUME e `price_alerts.last_fired_at` existem? Medir o `UNION ALL` de D3 no seed grande | Tabela "aviso → coluna" em `evidence.md`; p95 medido; se faltar coluna, **parar e perguntar** |

## Fase 1 — API dos avisos

> 🤖 Modelo: `sonnet` (T1.2 → `haiku`)

| Task | O quê | Aceite |
|---|---|---|
| T1.1 | `notice-feed.repository.ts` + `GET /v1/notices` (rota, docs OpenAPI, `access`, política `NOTICES`, cursor) | Contratos com `loadApiApp()`: ciclo `created→filled`, `cancelled`/`expired`/`rejected` com motivo, todas as saídas, parada/volta, alerta de preço; negativo entre usuários; mutantes de dono em `api-runs-mutants`; `api-openapi` verde |
| T1.2 | `notice-messages.ts` com as frases da §5 da spec (literais) | Teste de frase por código; varredura de palavras proibidas; nenhuma frase com hora |
| T1.3 ⚠ | `completesScore` aditivo em `triggers.rules[]` do `live-status` (puro: `weight ≥ scoreGap` com a regra a favor) e o Zod do painel (opcional) | Contrato de paridade da 008 intacto; contas à mão em 4 casos; mutantes da rota verdes |
| T1.5 | Bloco `manual` dos avisos de entrada e saída (`notice-manual.ts`, plan D3): quantidade, custo, líquido, equilíbrio, histórico, filtros do par | Contas à mão do exemplo (113,50 LINK; custo 0,30%; +0,76% / −0,93%; 0,8 : 1; equilíbrio 12,447); par sem backtest = `history: null`; arredondamento contra o usuário; `api-openapi` verde |
| T1.4 ⚠ | Só com D2-B: migration `notice_preferences` (+ `.rollback.sql`), `GET/PUT /v1/me/notice-preferences`, LGPD (exporta e apaga) | `make database-test`, `make lgpd-test`; sem D2-B a task não existe |

## Fase 2 — Núcleo no painel

> 🤖 Modelo: `sonnet` (T2.1 → `haiku`)

| Task | O quê | Aceite |
|---|---|---|
| T2.1 | `notice.validation.ts`, `notice-preferences.ts`, `notice-text.ts` | Zod espelha o OpenAPI; preferências toleram JSON ruim e acesso negado (padrões A); hora no fuso |
| T2.2 | `notice-store.ts` + `useNoticeCenter.hook.ts` + `notices.query.ts` | Contratos puros: mescla por id, troca de estado no lugar, não volta estado, não lidos, silenciado, simulação aberta sem toast, primeiro carregamento sem toast |
| T2.3 | `NoticeToast`, `NoticeToastStack`, `NoticeAnnouncer` | Texto literal dos 3 estados da ordem; 3 visíveis + "+N no sino"; 8 s com pausa no foco/mouse (relógio falso); um anúncio por aviso e por troca; `design-review`, `touch-targets`, `contrast` |
| T2.4 | `NoticeBell`, `NoticeDrawer`, `NoticeItem`, `NoticeEmpty`, `NoticeFirstRun` no `HeaderMenu` (fora do painel recolhível) | Foco preso e devolvido; Esc; "Marcar todos"; filtro por simulação; vazio e primeiro uso com o texto da spec; 375 px |
| T2.6 | `SignalCard`, `LevelRuler`, `TriggerProgress` (ficha de todos os estados, RF23 a RF25) no toast, na gaveta e no cartão "Sinal em andamento" | Texto literal por estado; régua com 3 marcas, 2 zonas e cursor (dentro e fora da faixa); vertical abaixo de 280 px; descrição textual; `contrast` ≥ 3:1 nas zonas e marcas e 4,5:1 no selo, nos dois temas |
| T2.7 | `ManualTradePanel`, `manual-trade.ts`, `useCopyValue`, `exchange-link.ts`, `my-balance.ts` (RF27 a RF34) | Proporção `BigInt` para baixo no passo; texto copiado com ponto decimal e no tick; "Copiado" anunciado; URL da Binance só com o par (contrato); "Meu saldo" nunca sai do navegador |
| T2.5 | `NoticePreferences` (3 interruptores, silenciados, "Avisar antes de comprar") na gaveta e na Conta | Contratos: desligar tira toast/som/notificação e mantém o sino |

## Fase 3 — Fora da aba, perto de comprar e conexão

> 🤖 Modelo: `sonnet`

| Task | O quê | Aceite |
|---|---|---|
| T3.1 | `useTabTitle`, ícone com ponto, `useBrowserNotification` (pedido só no clique, `tag`), `notice-sound.ts` | `visibilityState` falso; permissão negada/concedida; nenhum pedido sem clique; som só depois do gesto |
| T3.2 | `near-trigger.ts` + o aviso "perto de comprar" | `BigInt` sem `Number(`; histerese; uma vez por vela e regra; só simulação marcada |
| T3.3 | `ConnectionStrip`, ponto âmbar no sino e o resumo na volta (`after` = cursor) | Socket falso: `reconnecting` > 5 s mostra a faixa; `resync` → um resumo com a contagem certa, sem toasts individuais |

## Fase 4 — Integração, prova e fechamento

> 🤖 Modelo: `sonnet` (T4.4 → `haiku`)

| Task | O quê | Aceite |
|---|---|---|
| T4.1 ⚠ | Balão do agente falando o sinal e destaque na sala/"Equipe agora" (011), "Novo"/"Compra pedida" na linha de pulso (008) e a camada "Níveis" com a faixa da operação e as etiquetas no gráfico (009, D15) | Contratos das três specs intactos; `prefers-reduced-motion` = só borda; contraste das linhas e da faixa |
| T4.2 | E2E (`make panel-e2e`, Edge): `POST /decision` de compra → toast "pedida" → passo seguinte → "executada" no mesmo toast; cancelamento por sinal contrário; socket derrubado com `routeWebSocket` → resumo | E2E verde, zero violação de CSP |
| T4.3 | Revisão de design a 375 e 1280 px nos dois temas contra `docs/preview/central-de-avisos/`; linguagem para leigo | Uma captura final por tema em `evidence.md`; divergências corrigidas ou listadas |
| T4.4 | `CLAUDE.md` (pasta `src/notices/`, rota, política, preferências) | Diff revisado |

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/014-central-de-avisos/ (leia spec.md, plan.md e tasks.md antes de
começar; o preview de referência é docs/preview/central-de-avisos/index.html e as capturas ao lado). Uma task por vez,
na ordem do tasks.md.
ANTES DE TUDO: confira em specs/014-central-de-avisos/evidence.md as respostas do usuário às decisões do spec.md §9. Sem
resposta, siga os padrões A. D2-B (migration notice_preferences, T1.4) só com autorização registrada.
DEPENDÊNCIAS: specs 005, 008 e 009 prontas. T1.3 mexe na rota live-status da 008 (campo aditivo completesScore): se a 008
tiver outro executor, pare e pergunte. Frases "compra barrada" só quando 007/013 gravarem o motivo; senão pule e registre.
Modelos: Fase 0 → executor model=sonnet · Fase 1 → executor model=sonnet (T1.2 → executor model=haiku) · Fase 2 →
executor model=sonnet (T2.1 → executor model=haiku) · Fase 3 → executor model=sonnet · Fase 4 → executor model=sonnet
(T4.4 → executor model=haiku) · revisão final → code-reviewer model=sonnet.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Cada task fecha com bun run typecheck + bun run lint + bun run format:check + testes + commit isolado, evidência em
evidence.md. Teste novo do painel entra na lista explícita do script test do package.json do painel.
Rode os gates no Linux/WSL: no Windows, fixtures com new URL(...).pathname quebram (spec 003, plan D6).
Regras: o aviso é de SIMULAÇÃO com dinheiro fictício, nunca recomendação; nenhuma frase com "compre", "venda agora",
"garantido"; toda frase do aviso vem do catálogo fechado do servidor; o ciclo da ordem é UM aviso que muda de estado;
estado é ícone + palavra + cor; um único aria-live; pedido de permissão do navegador só no clique; som e notificação
desligados por padrão; sem Number( em dinheiro (só posição de desenho na régua); sem biblioteca nova; CSS Modules +
tokens; sem style=. "Operar à mão" só mostra e copia: o app NÃO envia ordem, não guarda chave de corretora, o link da
Binance leva só o par e "Meu saldo" nunca sai do navegador. Integração por API com corretora (D13-B) está FORA: pare.
Nada muda no motor, no run-recording nem no StreamClient. Tudo simulado: nenhuma ordem real, nenhuma chave de corretora.
Não toque em specs/007*, specs/008*, specs/009*, specs/011*, specs/013*.
Pare e pergunte antes de: deploy, qualquer migration, dependência nova, mudar regra do analista, T1.3 com a 008 ocupada,
qualquer [NEEDS CLARIFICATION].
PROIBIDO: git push, git reset, git commit --amend, git stash, mexer nos containers ativada-dev-*.
UI: verifique por texto (read_page, get_page_text); screenshot só na T4.3.
Ao terminar ou parar, feche o modo (/oh-my-claudecode:cancel).
```
