# Evidência — Spec 011

## Decisões do usuário (spec §10)

_Sem resposta registrada._

## Respostas do usuário às decisões do spec.md §10 (registro de 2026-10-15)

O usuário (Anderson) respondeu "pode seguir" às escolhas recomendadas: D1-A (cartão próprio recolhível), D2-A (animação só
na vela nova, com botão de desligar), D3-A (plaquinha com a situação real do auditor), D4-A (motivo curto por regra no
balão; muda o contrato da spec 007 e só começa com a Fase 3 da 007 fechada), D5-A (personagens em SVG), D6-A (janela de
30 dias) e D7-A (rever velas anteriores).

Pedido adicional do usuário: a equipe também deve aparecer NA TELA DO GRÁFICO (versão compacta ao lado do gráfico,
"Próxima vela de perto"), ajudando a enxergar as decisões. Regra: a sala mostra a opinião e o motivo de cada agente; quem
decide continua sendo o analista na simulação, e a tela nunca fala em nome do usuário nem soa como recomendação.

Pedido adicional (2026-10-15, "ou o gráfico na sala"): além da versão compacta da equipe ao lado do gráfico, deve existir o
modo inverso, a sala com o gráfico dentro dela (um "monitor" na parede da sala de negociação, com os balões apontando
para a vela e a linha que cada agente comenta). Os dois modos são uma única escolha de layout (alternância "Gráfico +
equipe" / "Sala com o gráfico"), com o mesmo conteúdo e as mesmas frases do servidor. Entra como decisão D8 do spec 011
(padrão: A = alternância com os dois modos; B = só um deles) a detalhar na T0.1 da 011, após a Fase 3 da spec 007.

## Versão 1 sem o analista (2026-10-15)

Pedido do usuário: ver a sala já, sem esperar o analista de risco da spec 007. A versão 1 usa SÓ dados que existem hoje
(`live-status`, `decisions` e o resumo de `projections`); nada da 007 (rotas, `ruleVotes`, migration, worker) foi tocado.
Decisões aplicadas: D1-A (cartão próprio recolhível), D2-A (animação só na vela nova, com botão), D3-A (plaquinha com a
situação real), D5-A (SVG), D6-A, D7-A (rever velas) e D8 (alternância "Gráfico + equipe" / "Sala com o gráfico"). D4-A (motivo
por regra via `ruleVotes`) fica fora: o balão usa a frase que o servidor já manda por regra em `triggers.rules[].message`
(só na vela mais recente) e, nas velas revistas, o voto e a leitura gravados na decisão.

### De onde vem cada fala (nenhuma é inventada)

| Na tela | Fonte |
|---|---|
| Os "especialistas" (Tendência, Reversão, Volume, Sentimento, "Outras regras") | regras de `decisions.items[0].votes`, agrupadas pela família do `kind` (vocabulário do ADR 0002); só aparece a família que a estratégia tem |
| Voto, peso e "leitura" | `votes[].vote`, `weight`, `isMissing`, `reading` |
| Frase do balão | `triggers.rules[].message` (servidor) |
| "Resumo do placar da estratégia" (no lugar do analista) | `outcome` (Esperou, Comprou, Vendeu…), `score` contra `scoreThreshold` e `message` da decisão |
| Auditor | `summary` de `GET /projections`: `verdict`, `hits`/`counted`, `wilson`, `message`, `verdictMessage`; "moeda ao ar" 50,00% |
| Textos de interface (não são falas) | "Sala da equipe", "Repetir", "Animação", "← Vela anterior", "Voltar para agora", legenda, "A equipe não tem opinião nesta vela…", "Sem simulação rodando agora…" |

Estado é ícone + palavra + cor (a favor ↗, contra ↘, neutro =, sem leitura ⓘ; "votou", "sem voto", "fora do placar").

### Tasks e commits

| Task | Commit |
|---|---|
| T1 modelo (famílias, tons, plaquinha, auditor), sequência pura, preferência, glossário | `84f3a3d` |
| T2 palco (SVG, balões, plaquinhas, piso, tokens) | `12a651d` |
| T3 cartão, sequência na vela nova, rever velas, lista de texto, equipe compacta | `ff11428` |
| T4 alternância de layout e ligação no detalhe da simulação ao vivo | `8ba3ea1` |

### Provas

- Contratos novos na lista explícita do script `test`: `team-room-model.contract.ts` (15) e `team-room.contract.tsx` (17: vela nova,
  equipe sem opinião, auditor com menos de 30 previsões, sem simulação rodando, palco `aria-hidden` sem focável, lista de texto
  = palco, animação só na vela nova com `aria-live` uma vez, animação desligada, `prefers-reduced-motion`, rever velas,
  recolher, alternância de layout, equipe compacta, varredura de palavras proibidas e nenhum `Number(`).
- Contraste: pares novos em `contrast.contract.ts` (bordas 3:1) nos dois temas; alvos de 44 px em `touch-targets.contract.ts`
  (`.tool`, `.switchButton`, `.linesSummary`); `design-review` sem `style=` e com `prefers-reduced-motion` em todo CSS com movimento.
- Sequência: pensa 450 ms, um especialista a cada 120 ms, o resumo pensa 250 ms e fala 300 ms, anúncio 200 ms depois; o contrato
  prova ≤ 1,8 s até com 5 lugares. Durações das animações só em tokens (`--motion-fast`, `--motion-medium`, `--ease-out`).
- App dev real (`/backtests/01a14175-02ae-73ae-ba93-86c0591f7a2c`), por texto: estratégia com Reversão (RSI, Bollinger) e Volume
  (OBV); sem rolagem horizontal a 1280 e 375 px; zero focável no palco; "Equipe agora" ao lado de "Próxima vela de perto";
  "Sala com o gráfico" põe o gráfico no monitor da sala e a escolha fica no `localStorage`; auditor com "Poucas previsões"
  (19 contadas). Captura final: `capturas/versao-1-1280-claro.png`.

![Sala da equipe, versão 1](capturas/versao-1-1280-claro.png)

### Pendências (versão 1)

- Falas finais do analista de risco (postura, ritmo, tamanho, travas, "Modo sombra") e `ruleVotes`/`motive` por regra: dependem
  da 007 (Fases 2 e 3) e entram na spec 011 completa.
- Plaquinha com acerto por especialista e prancheta com o intervalo de Wilson por barra: o servidor só mede a estratégia inteira
  hoje; a versão 1 mostra o resumo do auditor em texto.
- Capturas por tema a 375 px e E2E com `pg_notify` (T3.1 e T3.2 da spec completa).

## Equipe junto do gráfico (2026-10-16)

Pedido: "os nossos agentes mais perto do gráfico, dando as opiniões ali mesmo, para acompanharmos tudo em tempo real".
Nada da 007 (api, worker, packages) foi tocado; só `apps/frontend-ativada`.

### Commits

| Task | Commit |
|---|---|
| Ordem da página: pulso → "Sua simulação ao vivo" → gráfico; decisões, acompanhamento, acertos e sala grande depois | `b21633d` |
| Coluna "Equipe agora" colada no gráfico (≥ 1100 px; no celular logo abaixo) e fala de cada agente na vela apontada | `f570ae3` |
| Compras e vendas bem visíveis (faixa na vela, ponto com halo, etiqueta com seta + palavra + preço, dica "Compra a X · taxa Y") | `42b3353` |
| Camada "Níveis" (entrada, alvo, stop ou gatilho da regra de preço) | `d6a8c7e` |

### Onde o gráfico começa (Playwright + Edge, app dev real, 1280 px, tema claro, sem aviso de dado antigo)

| Medida | Antes | Depois |
|---|---|---|
| Cartão "Preço e operações" (topo) | 2.731 px | ~374 px |
| Canvas do gráfico | 3.299 px | ~600 a 625 px (as camadas, o período e o aviso ficaram abaixo do gráfico; barra de tempos e de zoom em uma linha) |
| "Equipe agora" | 3.901 px | no alto, ao lado do canvas (mesmo `top` do canvas) |
| Rolagem horizontal | 0 | 0 a 1280 px e a 375 px |

No celular (375 px) a equipe vem logo abaixo do gráfico, em lista; "Próxima vela de perto" depois dela.

### Opinião em tempo real

- A coluna lê a MESMA consulta do acompanhamento (`useLiveStatusQuery`); o aviso do stream só refaz essa consulta. Vela nova
  dispara a sequência curta existente (pensa 450 ms, um a um, resumo por último; ≤ 1,8 s), desligável pela chave "Animação"
  da sala e anulada por `prefers-reduced-motion`. Preço ao vivo mudando NÃO re-anima (a chave é o `candleTime` mais recente).
- Cruz do mouse ou do teclado: `useCandleCanvasModel` já tinha o índice apontado (`hoverIndex ?? keyboard.index`); agora
  entrega `pointedOpenTime` à equipe pelo contexto `TeamAside` (função que recebe a vela apontada). Nenhum estado novo.
  `pickDecisionForCandle` acha a decisão da vela (mesma abertura ou, em outro tempo gráfico, a que cobre o instante);
  vela revista usa só voto e leitura gravados (a frase por regra do servidor existe só na mais recente), sem animação;
  vela sem decisão diz "Esta vela não tem falas gravadas…".
- Com a sala grande recolhida, o aviso do leitor de tela (`aria-live`) passa para a coluna.
- Honestidade: só falas do servidor; "Tendência, não promessa. Tudo simulado…" na coluna; palavras proibidas varridas por teste.

### Marcadores de compra e venda

Primitivo novo `trade-marks-primitive.ts` (sem importar a biblioteca): faixa suave na vela, ponto no preço do preenchimento
com halo (cor do fundo), etiqueta "▲ Compra 12,458" / "▼ Venda …" (cor semântica `--buy`/`--sell`, texto na cor do fundo: os
pares `surface`/`buy` e `surface`/`sell` já estão em `contrast.contract.ts`), agrupamento "Compras ×3" quando próximas
(menos de 96 px), seta da biblioteca maior (tamanho 2, 3 se selecionada). Ao apontar a vela, a legenda diz
"Compra a 12,45 · taxa 0,01". Custo: só os marcadores visíveis (≤ 500) por quadro, desenho de canvas simples; o teste de
quadros por segundo da T3.8 não foi alterado.

### Níveis da estratégia nesta simulação

Camada "Níveis" (padrão ligada; só desenha com dado): posição aberta = entrada, alvo e stop do `openPosition` do
`live-status`; sem posição = a regra de PREÇO que ainda não votou a favor ("Bollinger 20/2 vota a favor se fechar acima de
12,53"). No máximo 3 linhas. Valores em texto do servidor (`formatPrice`), conversão só por `toDrawingNumber`. O aviso diz
que são níveis desta simulação, não previsão de preço nem recomendação. Nos balões da equipe, a frase do servidor por regra
("o RSI precisa ficar acima de 70…") já traz o valor ao lado do especialista. Reaproveita a consulta do acompanhamento; a
camada "Stop e alvo" (caixas por operação) segue como estava.

### Provas

- `test/team-beside-chart.contract.tsx` (10): ordem da página, resumo curto, vela apontada pelo teclado chega à equipe e Esc
  volta a "agora", `pickDecisionForCandle`, vela antiga sem a frase viva, vela sem fala, vela nova pensa/fala/descansa, refetch
  do preço não anima, animação desligada.
- `test/trade-marks.contract.ts` (6) e `test/strategy-levels.contract.tsx` (5); `surface-style`, `chart-series` e
  `chart-preferences` ajustados (campos novos).
- Gates: `tsc` do painel limpo, `eslint` do painel limpo, `panel-test` 1.120 passam, 0 falham. Falha da raiz só em arquivos da
  007 (`typecheck` da raiz e `format:check` em `scripts/live-mutants.ts`), ignorada.
- Capturas: `capturas/equipe-junto-do-grafico-1280-claro.png` e `capturas/equipe-junto-do-grafico-375-escuro.png`.

![Equipe junto do gráfico, 1280 px](capturas/equipe-junto-do-grafico-1280-claro.png)

### Pendências

- O canvas fica em ~600 a 625 px (card em ~374 px), não abaixo de 600 de forma folgada: o que sobra acima dele é o cabeçalho
  da execução (3 linhas), a linha de pulso e o resumo.
- A coluna da equipe (≈ 900 px com 3 famílias e frases longas do servidor) é mais alta que o canvas (620 px): sobra espaço à
  esquerda abaixo do gráfico no desktop.
- A "Sala com o gráfico" mantém o gráfico dentro da sala (sem a coluna); a equipe compacta não aparece nesse layout.
- Rever velas da sala grande e a vela apontada no gráfico são seleções independentes (sem estado compartilhado, por pedido).

## Equipe não aparecia (2026-10-16)

Relato: "no gráfico mais equipe não está aparecendo". Conferido no painel de desenvolvimento (Edge, 1280 px, tema claro, login
local de teste) nas quatro execuções abaixo, por DOM, rede e console; capturas em `capturas/` do scratchpad da sessão.

| Execução | Antes | Depois |
|---|---|---|
| LINK 15 min, 1 operação, sem analista | coluna "Equipe agora" presente (361 px, ao lado do canvas de 756 px) | igual |
| LINK 15 min com analista | presente | presente |
| PEPE recém-criada | coluna presente só depois da 1ª decisão; antes dela e com o gráfico sem velas, nada | coluna ao lado do aviso do gráfico, com "A equipe ainda está olhando o mercado…" |
| Backtest `01a131cd…` | **nenhuma coluna**; o canvas (756 px) ficava com a coluna da direita vazia | coluna "Equipe agora" com a frase honesta de execução histórica |

Causas encontradas (cada uma reproduzida por contrato em `test/team-always-beside-chart.contract.tsx`):

1. **Sem decisões ainda** (`useCompactTeamModel` devolvia `undefined` e o `CompactTeam` renderizava `null`): simulação recém-criada
   ou parada antes da 1ª vela não tinha equipe. Agora diz "A equipe ainda está olhando o mercado. A primeira opinião chega quando a
   vela de N fechar às HH:MM." (hora no fuso do usuário, de `nextDecisionAt`) ou, parada, "não está rodando".
2. **`live-status` carregando, 409/429/5xx** (`useLiveStatusQuery` sem dado): o componente renderizava `null`; uma resposta 429 do
   limite de renovação (visto várias vezes no dev) fazia a equipe sumir sem aviso. Agora a moldura fica, com "Carregando a equipe…"
   ou "Não deu para carregar a equipe agora." e o botão "Tentar de novo".
3. **Backtest e walk-forward**: `CompletedBacktest`/`CompletedWalkForward` desenham o gráfico fora do `TeamAsideProvider`, e o
   `CandleCanvas` só montava a coluna com `view.isLive`. Agora a coluna existe e diz "Esta execução roda sobre o passado: a equipe só
   opina nas simulações ao vivo. As compras e vendas estão marcadas no gráfico." (backtest não grava falas; não há dado por vela).
4. **Simulação ao vivo concluída** (`hasChart` falso no `LiveChartArea`; o gráfico vem do `CompletedBacktest`): sem provedor, sem
   equipe. Agora `RunTeamAside` dá a equipe compacta à execução ao vivo terminada.
5. **Gráfico que não chega ao canvas** (carregando as velas, "Ainda não há velas para mostrar", velas públicas ausentes, canvas
   que falhou): a coluna morava dentro do `CandleCanvas`, então sumia junto. Agora `BesideTeam` reserva a mesma coluna ao lado desses avisos.
6. **Layout "Sala com o gráfico" salvo no navegador** (`ativada.team-room`): a equipe compacta some por desenho, e a sala sem
   decisões, carregando ou com erro **não renderizava o monitor**: o gráfico inteiro desaparecia e não havia botão para voltar.
   Agora esses estados mantêm o gráfico (monitor) e o seletor "Gráfico + equipe | Sala com o gráfico" fica visível no cartão.
7. Largura < 1100 px: não é causa; a coluna desce para logo abaixo do canvas (CSS `min-width: 1100px` já existia).
   `isCollapsed` não esconde a equipe compacta (só a sala grande).

Verificação: typecheck, lint e format do painel limpos; `bun run --cwd apps/frontend-ativada test`: 1231 testes verdes (100
arquivos). Testes antigos que seguravam o elemento "Equipe agora" passaram a esperar a opinião chegar (`test/support/loaded-team.ts`),
porque a moldura agora existe desde o carregamento. Para ver no navegador: Ctrl+F5 (o Vite recarrega sozinho, mas o painel de
produção precisa de novo build).

### Pendências

- Backtest não mostra a equipe "da vela apontada": o motor não grava falas por vela em backtest (nem há rota); a coluna diz isso.
