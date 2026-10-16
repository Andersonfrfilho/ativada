# Evidência — Spec 014

## Decisões do usuário (spec §9)

Em 2026-10-16 o dono do produto respondeu **"pode add"** às propostas pendentes (central de avisos na tela). Não escolheu
decisão por decisão, então valem os **padrões A** do `spec.md` §9 em tudo, e foram aplicados por padrão:

| # | Decisão | Aplicada |
|---|---|---|
| D1 | Ciclo da ordem | A: um aviso que muda de estado (mesmo `noticeId`) |
| D2 | Preferências e "lido" | A: `localStorage` do aparelho, **sem migration** (T1.4 não existe) |
| D3 | Fonte | A: rota nova só leitura `GET /v1/notices` |
| D4 | "Perto de comprar" | A: só para a simulação marcada "Avisar antes de comprar" |
| D5 | Acerto em cada aviso | A: uma linha em todo aviso de compra, venda e "perto de" |
| D6 | Preferências | A: três interruptores |
| D7 | Tempo do toast | A: 8 s, pausa no mouse e no foco |
| D8 | Toast na própria simulação | A: não (só o sino conta) |
| D9 | Notificação do navegador | A: com par e preço |
| D10 | "Compra barrada" | A: a peça só liga quando 007/013 gravarem o motivo (não ligada agora) |
| D11 | Tom do sinal | A: direto e curto, com o sujeito no sinal |
| D12 | Quantidade à mão | A: a da simulação e, com "Meu saldo" (só no navegador), a proporção |
| D13 | Atalho para a corretora | A: link do par + botões de copiar + roteiro (sem API da corretora) |
| D14 | Ficha no toast | A: ficha e régua no toast; "Operar à mão" abre no sino |
| D15 | Camada "Níveis" | A: ligada por padrão (T4.1, ainda não feita) |
| D16 | "Quando desistir" | A: ponto de equilíbrio (T1.5, ainda não feita) |

## Tasks

### T0.1 — Conferência (feita em 2026-10-16)

Resultado: **nada falta**; a task não precisou parar. O horário da mudança de estado da ordem existe: `orders` guarda
`created_candle_time` e `last_event_candle_time` (o candle do último evento; o status é monotônico, então é o candle da
mudança `created → filled|cancelled|expired|rejected`). O instante do aviso é o **fechamento** desse candle
(`last_event_candle_time + duração da vela`).

| Aviso | Tabela e coluna |
|---|---|
| Compra pedida / executada / cancelada / expirada / recusada | `orders` (`side = buy`, `purpose = entry`): `status`, `reason`, `type`, `limit_price`, `expires_candle_time`, `last_event_candle_time` |
| Preço, taxa e quantidade da compra executada | `fills` (`order_key = orders.engine_key`): `price`, `fee`, `quantity` |
| Alvo e proteção da compra | `positions` (por `fills.position_key`): `target_price`, `stop_price`, `engine_key` (a chave de `?operacao=`) |
| Venda com motivo e resultado | `positions` (`status = closed`): `exit_reason`, `exit_price`, `exit_fee`, `net_profit`, `closed_candle_time` |
| Resultado sobre o saldo | `runs.run_parameters->>'initialBalance'` |
| Simulação parada | `runs.stalled_since` (episódio corrente) |
| Simulação voltou | `alerts` (`side = RESUME`): `candle_time`, `created_at` (só existe para quem tem Telegram vinculado) |
| Aguardando dados | `runs.waiting_since`, `waiting_open_time` |
| Meta | `runs.goal_outcome`, `goal_outcome_candle_time` |
| Alerta de preço disparado | `price_alerts.last_fired_at`, `direction`, `value`, `symbol` |

Limites conhecidos (registrados, sem coluna nova nem migration): (1) a **parada** de um episódio que já terminou só deixa
rastro como "voltou" (`RESUME` em `alerts`, só com Telegram); enquanto dura, `runs.stalled_since` a mostra. (2) Não há
instante gravado do **momento exato** do cancelamento; vale o candle do evento (`last_event_candle_time`), como previsto
no §8 do spec. (3) `blocked.analyst` e `blocked.minimum_profit` não ligados (D10).

Medição do `UNION ALL` (SELECT apenas, banco dev, `EXPLAIN ANALYZE`, usuário com 16 execuções ao vivo; o banco tem 48.766
ordens, 19.600 posições, 67 execuções): 1ª chamada a frio 89 ms, as três seguintes 8,6 a 9,4 ms (planejamento ~6 ms).
Abaixo de 150 ms sem índice novo, então **sem migration**. (Quatro amostras, não p95 formal: o seed grande não existe
no banco dev.)

### T1.2 — Catálogo de frases (`apps/api-ativada/src/notices/notice-messages.ts`, `notice-trade-messages.ts`)

As frases da §5, literais, e `reject.other` (recusa por motivo gravado fora da tabela, p.ex. `volume_capped`) e
`price_alert.fired.below` (alvo abaixo) como únicas adições. Nenhuma frase leva data ou hora: as marcas `{abre}`,
`{fecha}`, `{validade}` e `{hora}` são trocadas pelo painel no fuso do usuário (`confirmsAt` e `expiresAt` vêm
calculados em ISO para isso). Preços saem no tick do par (`symbol-filters.constant.ts`: LINK/USDT 3 casas, para cima
quando sobra casa) e em pt-BR; resultado sobre o saldo inicial para baixo, com sinal (`+`, `−`, `=`). A prova da frase por
código e a varredura de palavras proibidas e de horas estão em `test/api-notices.contract.test.ts`.

### T1.1 — `GET /v1/notices` (`apps/api-ativada/src/notices/`, `packages/database/src/notices/`)

- `access: USER`, `documentation` (Zod ↔ OpenAPI, `api-openapi` verde), política `NOTICES` 60/min por usuário, consulta
  Zod estrita (`limit` 1 a 50, `cursor` = avisos anteriores, `after` = avisos mais novos que o cursor, para o resumo,
  `scope` = `runs|price-alerts|all`), cursor adulterado ou `cursor`+`after` juntos = 400.
- UMA consulta `UNION ALL` de 7 ramos (`orders`+`fills`+`positions`, saídas, parada, espera, meta, volta, alerta de
  preço), dono em cada tabela de cada ramo, só execuções `live_paper` não apagadas, janela de 30 dias e `LIMIT`; ordem
  `(occurred_at, notice_id)` decrescente.
- Gates (WSL, espelho `~/gates/ativada-spec14`, Postgres embutido 56447): `typecheck` e `lint` limpos nos arquivos da
  task, `format:check` limpo, `test/api-notices.contract.test.ts` 36 testes (ciclo `created → filled` no mesmo
  `noticeId`, as 8 variantes de cancelada/expirada/recusada, as 5 saídas, parada/volta/espera/meta/alerta de preço,
  recorte, página, `after`, 400 por consulta inválida, isolamento entre usuários, 429 na 61ª, varredura de frases),
  vizinhos `api-*.contract.test.ts` (43 arquivos, 808 testes) verdes, `route-isolation-test` com os avisos (ciclo, ordem,
  isolamento, recortes e paginação).
- Mutantes de dono (`scripts/api-runs-mutants.ts`, Postgres embutido): **35 de 35 reprovados** (30 antigos + 5 novos:
  filtro de dono das execuções, das ordens, das saídas, da volta e dos alertas de preço; o de ordens, saídas e volta
  levam também o filtro das execuções, porque o `JOIN` por execução já protege sozinho).

### T2.1 e T2.2 — Modelo dos avisos no painel (`apps/frontend-ativada/src/notices/`)

- `notice.validation.ts` espelha `GET /v1/notices` (Zod, valores decimais como texto); `notices.query.ts` tem duas consultas
  sob as raízes do stream: `['runs', 'notices']` (infinita, "Ver avisos anteriores") e `['price-alerts', 'notices']`
  (o mesmo endpoint com `scope=price-alerts`). O stream não mudou: todo `event` e `price_alert` já refaz a raiz.
- `notice-preferences.ts`: três interruptores, silenciadas, "avisar antes", cursor de leitura e "já vi o balão", tudo no
  `localStorage` por `sub` opaco (`SessionService.readSubject`, claim `sub` do token em memória); JSON ruim, campo inválido
  e acesso negado caem nos padrões A, campo a campo. Nada de preço nem par guardado.
- `notice-events.ts` (puro): mescla por `noticeId` (o estado mais avançado vence, nunca volta), `diffNotices`, não lidos,
  `decideEffects` (desligar o tipo ou silenciar tira toast, som e notificação; a simulação aberta na tela não ganha toast;
  ordem pedida não faz som nem notificação) e o texto do resumo.
- `notice-router.ts`: o primeiro carregamento de cada assunto é só linha de base (nada vira toast); depois, toast e
  anúncio por mudança; depois de religar, UM resumo sem toast individual; aba escondida só notifica e, ao voltar, repõe os
  toasts (ou resume se passou de 60 s).
- Gates (WSL, espelho `~/gates/ativada-spec14`): `typecheck`, `lint` e `format:check` limpos; `test/notice-model.contract.ts`
  com 23 testes (preferências, texto e horário no fuso, mescla, troca de estado, efeitos, roteador).

### T2.3, T2.4 e T2.5 — Toasts, sino, gaveta e preferências na tela

- `NoticeCenterProvider` (dentro do `AppShell`, sob o `LiveMarketProvider`) junta consultas, preferências, roteador e
  gaveta num contexto; `NoticeBell` fica no cabeçalho FORA do painel recolhido (44×44 px, `aria-label="Avisos: 2 não lidos"`,
  ponto âmbar se pausou), `NoticeToastStack` (no máximo 3, "+N no sino", compacta com gráfico), `NoticeToast` (o ciclo da
  ordem troca de estado NO LUGAR, 8 s com pausa no mouse/foco, "Ver no gráfico" para `/backtests/:runId?operacao=…#grafico`,
  "Silenciar esta simulação", fechar sem marcar como lido) e `NoticeAnnouncer` (o ÚNICO `aria-live`; os toasts são uma
  lista com rótulo, sem `aria-live`, para não anunciar duas vezes e manter botões focáveis).
- `NoticeDrawer`: `role="dialog"` `aria-modal`, foco no título, foco preso (Tab em ciclo), Esc fecha e devolve o foco ao sino,
  frase fixa "Simulações com dinheiro fictício. Não é recomendação.", agrupado por dia ("Hoje", "Ontem"), "Novo", detalhe
  recolhido, "Marcar todos como lidos", filtro por simulação, "Ver avisos anteriores", vazio amigável e a faixa
  "Avisos pausados — reconectando…" (RF19) / "Avisos parados. Entre de novo.". Balão do primeiro uso (RF11).
- Preferências (RF15): `role="switch"` para "Avisar quando comprar ou vender", "Avisar quando algo parar" e "Som" (o clique
  no interruptor prepara o Web Audio), botão "Ativar notificações" (o pedido ao navegador só acontece no clique; negado diz
  como religar), e por simulação "Silenciar esta simulação"/"Voltar a avisar" e "Avisar antes de comprar".
- Tokens novos em `global.css` (`--on-buy`, `--on-sell`, `--scrim`, `--toast-shadow`, `--cancel-soft`, `--zone-gain`,
  `--zone-loss`, `--space-6`); `contrast.contract.ts` ganhou `on-buy`/`on-sell` e o texto sobre os fundos suaves (4,5:1 nos
  dois temas) e `touch-targets.contract.ts` os alvos de 44 px; `prefers-reduced-motion` no CSS do módulo.
- Gates: `typecheck`, `lint`, `format:check` limpos e `bun run --cwd apps/frontend-ativada test` com 1.309 testes verdes (103
  arquivos), dos quais 22 novos em `test/notices-center.contract.tsx` (primeiro carregamento sem toast, pedida → executada
  no mesmo toast com anúncio, cancelada em cinza, 8 s com pausa, teto de 3, fechar não marca como lido, desligar o tipo e
  silenciar mantêm o sino, tela da própria simulação sem toast, gaveta com foco/Esc/Tab, "Marcar todos", filtro, reconexão
  com UM resumo, notificação só no clique).

### T2.6 — Ficha do sinal e régua dos níveis

- `SignalCard`: selo de 56 px (seta + COMPRA ou VENDA + cor `--buy`/`--sell`, texto em `--on-buy`/`--on-sell`), preço em
  `--font-data` a 34 px no tick do par, hora, a linha direta do servidor ("Sinal de compra: LINK/USDT a 12,458 · vender no
  alvo 12,590 · sair se cair a 12,379."), o resultado na venda (▲/▼/= com sinal e cor) e a régua. Aparece no toast e no item
  da gaveta para compra executada e venda; cancelada, recusada e as demais ficam como frase simples, em cinza.
- `LevelRuler` em SVG com atributos (`x`, `width`, nunca `style=`): proteção, entrada e alvo rotulados com % (−0,63% e
  +1,06% no exemplo), zonas de perda e ganho (`--zone-loss`, `--zone-gain`), cursor "Saiu 12,372" no preço de saída (mesmo fora
  da faixa) e a legenda "Perda possível −0,63% · Ganho possível +1,06% · Ganho ÷ perda 1,7 : 1". Abaixo de 280 px do contêiner
  (`@container`) vira a lista vertical; no toast abaixo de 640 px a régua some (fica na gaveta). `role="img"` com a descrição
  textual dos três níveis. Os únicos `Number(` do módulo são os dois da posição de desenho (`level-ruler.ts`, provado por teste).
- Preços no tick do par: `symbol-filters.ts` é o espelho do painel da tabela de produção (`test/panel-symbol-filters.contract.test.ts`
  prende a igualdade): LINK/USDT 3 casas, para cima quando sobra casa; BTC e ETH, 2.
- A rota ganhou o campo aditivo `entryPrice` (de `positions.entry_price`): a venda não tem a ordem de entrada ao lado.
- Gates: `typecheck`, `lint`, `format:check`; painel inteiro 1.325 testes verdes (`level-ruler.contract.ts` com 15, mais 2 na tela:
  ficha da compra e da venda); `api-notices` 37 e `route-isolation-test` com `entryPrice`; contraste dos tokens novos já em T2.3.
- Pendência: o cartão "Sinal em andamento" da tela da simulação e o cursor "agora" ao vivo (COMPRADO) ficam na T4.1, que
  mexe nos arquivos das specs 009 e 011.

### T1.5 — Bloco `manual` ("Operar à mão") nos avisos de compra executada e venda

- `notice-manual-math.ts` (EngineDecimal, puro) e `notice-manual-messages.ts` (frases `manual.*`): ordem a mercado ou limitada
  com as marcas `{decisao}` e `{confirmacao}`, quantidade e notional da simulação (de `fills`) com o saldo inicial, as três
  ordens no tick do par (parâmetros gravados em `runs.run_parameters`), custo ida e volta (`2 × (taxa + deslizamento)`), ganho e
  perda depois do custo, razão e o ponto de equilíbrio `(alvo + proteção) ÷ (2 + 2 × custo)` para baixo no tick, histórico do
  último backtest ou walk-forward concluído da MESMA versão, par e vela (uma consulta extra, `notice-history.ts`, com o dono)
  e a frase fixa de honestidade. Sem backtest: `history: null` e "Sem histórico deste par. Rode um backtest em Backtests.".
- Contas do exemplo conferidas à mão no contrato: 113,50 LINK, custo 0,30%, equilíbrio 12,447, razão 0,8 : 1. Decisão de
  arredondamento: o ganho líquido DESCE e a perda líquida CRESCE (contra o usuário, como pede o plano D3), então o servidor diz
  **+0,75% e −0,94%** onde a spec escreveu +0,76% e −0,93% (arredondamento comum); a razão sai igual (0,8 : 1) e o equilíbrio
  também (12,447). A régua da ficha (distância até o nível, não dinheiro) segue o arredondamento comum da spec (−0,63% e +1,06%).
- Gates: `typecheck` e `lint` limpos nos arquivos da task; `api-notices` 43 testes (bloco manual: contas, frases, par sem
  histórico, saída, limitada sem taxa, varredura de palavras e horário); `route-isolation-test` com o histórico e o isolamento
  dele; `make api-runs-mutants` com **36 de 36 mutantes de dono reprovados** (+1: o filtro de dono do histórico).

### T2.7 — "Operar à mão" no painel

- `ManualTradePanel` (recolhível, na gaveta; no aviso da tela só o botão "Operar à mão" que abre a gaveta): como a simulação
  executou, quantidade, entrada/alvo/proteção no tick, custo, líquido, "Desista se o preço já passou de 12,447", histórico, o
  roteiro de 3 passos e a honestidade. Os botões copiam com ponto decimal e nas casas do par ("Copiar preço", "Copiar
  quantidade", "Copiar alvo", "Copiar proteção", "Copiar todas as ordens") e o retorno "Copiado" ✓ dura 2 s e fala no
  ÚNICO `aria-live`. "Abrir LINK/USDT na Binance" é o link do par (`exchange-link.ts`), nova aba, `noopener noreferrer`, sem
  nenhum dado da pessoa na URL; nenhuma requisição de escrita sai deste painel.
- "Meu saldo" (D12-A, `my-balance.ts`) fica só no `localStorage`; a proporção é BigInt, para BAIXO no passo (2.000 USDT sobre
  10.000 dão 22,70 LINK; `manual-trade.ts` não usa `Number`, provado por teste).
- Gates: painel `typecheck`/`lint`/`format` limpos nos arquivos da task; `manual-trade.contract.ts` (13) e `notices-center`
  com 5 testes novos (fatos, link, proporção e armazenamento, cópia com clipboard falso e anúncio, botão do aviso).

### T1.3 — `completesScore` em `triggers.rules[]` do `live-status` (campo aditivo da spec 008)

- `rule-completes-score.ts` (puro, decimal exato): a regra ainda não atendida, com voto para o lado que a carteira espera
  (comprar sem posição, vender com posição) e peso maior ou igual ao que falta (`scoreGap`), completa o placar sozinha. Entra
  em `RuleTriggerView`, no Zod da rota (`live-status.schema.ts`) e, como opcional, no Zod do painel. Os arquivos da spec 008
  tocados são só esses quatro e não havia outro executor neles (o `git status` do dia só tinha mudanças alheias em
  `decision-page.ts`, `live-status-context.ts` e `run-decisions.*`).
- Prova: `test/live-rule-completes-score.contract.test.ts` (5 casos à mão: a favor e cobre, peso igual ao que falta,
  atendida, lado contrário, comprado vende, placar já feito); `api-run-live-status` e a paridade com `computeLatestTriggers`
  (`live-stored-readings-parity`) seguem verdes (50 testes); painel de acompanhamento 57 testes.
- Observação: `test/api-run-live-status-mutants.contract.test.ts` falha hoje por uma mudança alheia em
  `live-status-context.ts` (o texto-alvo do mutante `LIVE_STATUS_OF_FOREIGN_RUN_IS_A_409` agora aparece 2x); não é desta task.
